
exports.monkeyPatch = function(context) {
	Parse = context.Parse;
	_ = Parse._;

	Parse.User = Parse.Object.extend("_User", /** @lends Parse.User.prototype */ {
		// Instance Variables
		_isCurrentUser: false,

		// Instance Methods

		/**
		 * Internal method to handle special fields in a _User response.
		 */
		_mergeMagicFields: function(attrs) {
		  if (attrs.sessionToken) {
		    this._sessionToken = attrs.sessionToken;
		    delete attrs.sessionToken;
		  }
		  Parse.User.__super__._mergeMagicFields.call(this, attrs);
		},

		/**
		 * Removes null values from authData (which exist temporarily for
		 * unlinking)
		 */
		_cleanupAuthData: function() {
		  if (!this.isCurrent()) {
		    return;
		  }
		  var authData = this.get('authData');
		  if (!authData) {
		    return;
		  }
		  Parse._objectEach(this.get('authData'), function(value, key) {
		    if (!authData[key]) {
		      delete authData[key];
		    }
		  });
		},

		/**
		 * Synchronizes authData for all providers.
		 */
		_synchronizeAllAuthData: function() {
		  var authData = this.get('authData');
		  if (!authData) {
		    return;
		  }

		  var self = this;
		  Parse._objectEach(this.get('authData'), function(value, key) {
		    self._synchronizeAuthData(key);
		  });
		},

		/**
		 * Synchronizes auth data for a provider (e.g. puts the access token in the
		 * right place to be used by the Facebook SDK).
		 */
		_synchronizeAuthData: function(provider) {
		  if (!this.isCurrent()) {
		    return;
		  }
		  var authType;
		  if (_.isString(provider)) {
		    authType = provider;
		    provider = Parse.User._authProviders[authType];
		  } else {
		    authType = provider.getAuthType();
		  }
		  var authData = this.get('authData');
		  if (!authData || !provider) {
		    return;
		  }
		  var success = provider.restoreAuthentication(authData[authType]);
		  if (!success) {
		    this._unlinkFrom(provider);
		  }
		},

		_handleSaveResult: function(makeCurrent) {
		  // Clean up and synchronize the authData object, removing any unset values
		  if (makeCurrent) {
		    this._isCurrentUser = true;
		  }
		  this._cleanupAuthData();
		  this._synchronizeAllAuthData();
		  // Don't keep the password around.
		  delete this._serverData.password;
		  this._rebuildEstimatedDataForKey("password");
		  this._refreshCache();
		  if (makeCurrent || this.isCurrent()) {
		    Parse.User._saveCurrentUser(this);
		  }
		},

		/**
		 * Unlike in the Android/iOS SDKs, logInWith is unnecessary, since you can
		 * call linkWith on the user (even if it doesn't exist yet on the server).
		 */
		_linkWith: function(provider, options) {
		  var authType;
		  if (_.isString(provider)) {
		    authType = provider;
		    provider = Parse.User._authProviders[provider];
		  } else {
		    authType = provider.getAuthType();
		  }
		  if (_.has(options, 'authData')) {
		    var authData = this.get('authData') || {};
		    authData[authType] = options.authData;
		    this.set('authData', authData);

		    // Overridden so that the user can be made the current user.
		    var newOptions = _.clone(options) || {};
		    newOptions.success = function(model) {
		      model._handleSaveResult(true);
		      if (options.success) {
		        options.success.apply(this, arguments);
		      }
		    };
		    return this.save({'authData': authData}, newOptions);
		  } else {
		    var self = this;
		    var promise = new Parse.Promise();
		    provider.authenticate({
		      success: function(provider, result) {
		        self._linkWith(provider, {
		          authData: result,
		          success: options.success,
		          error: options.error
		        }).then(function() {
		          promise.resolve(self);
		        });
		      },
		      error: function(provider, error) {
		        if (options.error) {
		          options.error(self, error);
		        }
		        promise.reject(error);
		      }
		    });
		    return promise;
		  }
		},

		/**
		 * Unlinks a user from a service.
		 */
		_unlinkFrom: function(provider, options) {
		  var authType;
		  if (_.isString(provider)) {
		    authType = provider;
		    provider = Parse.User._authProviders[provider];
		  } else {
		    authType = provider.getAuthType();
		  }
		  var newOptions = _.clone(options);
		  var self = this;
		  newOptions.authData = null;
		  newOptions.success = function(model) {
		    self._synchronizeAuthData(provider);
		    if (options.success) {
		      options.success.apply(this, arguments);
		    }
		  };
		  return this._linkWith(provider, newOptions);
		},

		/**
		 * Checks whether a user is linked to a service.
		 */
		_isLinked: function(provider) {
		  var authType;
		  if (_.isString(provider)) {
		    authType = provider;
		  } else {
		    authType = provider.getAuthType();
		  }
		  var authData = this.get('authData') || {};
		  return !!authData[authType];
		},

		/**
		 * Deauthenticates all providers.
		 */
		_logOutWithAll: function() {
		  var authData = this.get('authData');
		  if (!authData) {
		    return;
		  }
		  var self = this;
		  Parse._objectEach(this.get('authData'), function(value, key) {
		    self._logOutWith(key);
		  });
		},

		/**
		 * Deauthenticates a single provider (e.g. removing access tokens from the
		 * Facebook SDK).
		 */
		_logOutWith: function(provider) {
		  if (!this.isCurrent()) {
		    return;
		  }
		  if (_.isString(provider)) {
		    provider = Parse.User._authProviders[provider];
		  }
		  if (provider && provider.deauthenticate) {
		    provider.deauthenticate();
		  }
		},

		/**
		 * Signs up a new user. You should call this instead of save for
		 * new Parse.Users. This will create a new Parse.User on the server, and
		 * also persist the session on disk so that you can access the user using
		 * <code>current</code>.
		 *
		 * <p>A username and password must be set before calling signUp.</p>
		 *
		 * <p>Calls options.success or options.error on completion.</p>
		 *
		 * @param {Object} attrs Extra fields to set on the new user, or null.
		 * @param {Object} options A Backbone-style options object.
		 * @return {Parse.Promise} A promise that is fulfilled when the signup
		 *     finishes.
		 * @see Parse.User.signUp
		 */
		signUp: function(attrs, options) {
		  var error;
		  options = options || {};
		  console.log('Yeah we hooked in.');
		  var username = (attrs && attrs.username) || this.get("username");
		  if (!username || (username === "")) {
		    error = new Parse.Error(
		        Parse.Error.OTHER_CAUSE,
		        "Cannot sign up user with an empty name.");
		    if (options && options.error) {
		      options.error(this, error);
		    }
		    return Parse.Promise.error(error);
		  }

		  var password = (attrs && attrs.password) || this.get("password");
		  if (!password || (password === "")) {
		    error = new Parse.Error(
		        Parse.Error.OTHER_CAUSE,
		        "Cannot sign up user with an empty password.");
		    if (options && options.error) {
		      options.error(this, error);
		    }
		    return Parse.Promise.error(error);
		  }

		  // Overridden so that the user can be made the current user.
		  var newOptions = _.clone(options);
		  newOptions.success = function(model) {
		    model._handleSaveResult(true);
		    if (options.success) {
		      options.success.apply(this, arguments);
		    }
		  };
		  return this.save(attrs, newOptions);
		},

		/**
		 * Logs in a Parse.User. On success, this saves the session to localStorage,
		 * so you can retrieve the currently logged in user using
		 * <code>current</code>.
		 *
		 * <p>A username and password must be set before calling logIn.</p>
		 *
		 * <p>Calls options.success or options.error on completion.</p>
		 *
		 * @param {Object} options A Backbone-style options object.
		 * @see Parse.User.logIn
		 * @return {Parse.Promise} A promise that is fulfilled with the user when
		 *     the login is complete.
		 */
		logIn: function(options) {
		  var model = this;
		  var request = Parse._request("login", null, null, "GET", this.toJSON());
		  return request.then(function(resp, status, xhr) {
		    var serverAttrs = model.parse(resp, status, xhr);
		    model._finishFetch(serverAttrs);
		    model._handleSaveResult(true);
		    return model;
		  })._thenRunCallbacks(options, this);
		},

		/**
		 * @see Parse.Object#save
		 */
		save: function(arg1, arg2, arg3) {
		  var i, attrs, current, options, saved;
		  if (_.isObject(arg1) || _.isNull(arg1) || _.isUndefined(arg1)) {
		    attrs = arg1;
		    options = arg2;
		  } else {
		    attrs = {};
		    attrs[arg1] = arg2;
		    options = arg3;
		  }
		  options = options || {};

		  var newOptions = _.clone(options);
		  newOptions.success = function(model) {
		    model._handleSaveResult(false);
		    if (options.success) {
		      options.success.apply(this, arguments);
		    }
		  };
		  return Parse.Object.prototype.save.call(this, attrs, newOptions);
		},

		/**
		 * @see Parse.Object#fetch
		 */
		fetch: function(options) {
		  var newOptions = options ? _.clone(options) : {};
		  newOptions.success = function(model) {
		    model._handleSaveResult(false);
		    if (options && options.success) {
		      options.success.apply(this, arguments);
		    }
		  };
		  return Parse.Object.prototype.fetch.call(this, newOptions);
		},

		/**
		 * Returns true if <code>current</code> would return this user.
		 * @see Parse.User#current
		 */
		isCurrent: function() {
		  return this._isCurrentUser;
		},

		/**
		 * Returns get("username").
		 * @return {String}
		 * @see Parse.Object#get
		 */
		getUsername: function() {
		  return this.get("username");
		},

		/**
		 * Calls set("username", username, options) and returns the result.
		 * @param {String} username
		 * @param {Object} options A Backbone-style options object.
		 * @return {Boolean}
		 * @see Parse.Object.set
		 */
		setUsername: function(username, options) {
		  return this.set("username", username, options);
		},

		/**
		 * Calls set("password", password, options) and returns the result.
		 * @param {String} password
		 * @param {Object} options A Backbone-style options object.
		 * @return {Boolean}
		 * @see Parse.Object.set
		 */
		setPassword: function(password, options) {
		  return this.set("password", password, options);
		},

		/**
		 * Returns get("email").
		 * @return {String}
		 * @see Parse.Object#get
		 */
		getEmail: function() {
		  return this.get("email");
		},

		/**
		 * Calls set("email", email, options) and returns the result.
		 * @param {String} email
		 * @param {Object} options A Backbone-style options object.
		 * @return {Boolean}
		 * @see Parse.Object.set
		 */
		setEmail: function(email, options) {
		  return this.set("email", email, options);
		},

		/**
		 * Checks whether this user is the current user and has been authenticated.
		 * @return (Boolean) whether this user is the current user and is logged in.
		 */
		authenticated: function() {
		  return !!this._sessionToken &&
		      (Parse.User.current() && Parse.User.current().id === this.id);
		}

		}, /** @lends Parse.User */ {
		// Class Variables

		// The currently logged-in user.
		_currentUser: null,

		// Whether currentUser is known to match the serialized version on disk.
		// This is useful for saving a localstorage check if you try to load
		// _currentUser frequently while there is none stored.
		_currentUserMatchesDisk: false,

		// The localStorage key suffix that the current user is stored under.
		_CURRENT_USER_KEY: "currentUser",

		// The mapping of auth provider names to actual providers
		_authProviders: {},


		// Class Methods

		/**
		 * Signs up a new user with a username (or email) and password.
		 * This will create a new Parse.User on the server, and also persist the
		 * session in localStorage so that you can access the user using
		 * {@link #current}.
		 *
		 * <p>Calls options.success or options.error on completion.</p>
		 *
		 * @param {String} username The username (or email) to sign up with.
		 * @param {String} password The password to sign up with.
		 * @param {Object} attrs Extra fields to set on the new user.
		 * @param {Object} options A Backbone-style options object.
		 * @return {Parse.Promise} A promise that is fulfilled with the user when
		 *     the signup completes.
		 * @see Parse.User#signUp
		 */
		signUp: function(username, password, attrs, options) {
		  attrs = attrs || {};
		  attrs.username = username;
		  attrs.password = password;
		  var user = Parse.Object._create("_User");
		  try {
			  return user.signUp(attrs, options);
			} catch (e) {
				console.log(e);
			}
		},

		/**
		 * Logs in a user with a username (or email) and password. On success, this
		 * saves the session to disk, so you can retrieve the currently logged in
		 * user using <code>current</code>.
		 *
		 * <p>Calls options.success or options.error on completion.</p>
		 *
		 * @param {String} username The username (or email) to log in with.
		 * @param {String} password The password to log in with.
		 * @param {Object} options A Backbone-style options object.
		 * @return {Parse.Promise} A promise that is fulfilled with the user when
		 *     the login completes.
		 * @see Parse.User#logIn
		 */
		logIn: function(username, password, options) {
		  var user = Parse.Object._create("_User");
		  user._finishFetch({ username: username, password: password });
		  return user.logIn(options);
		},

		/**
		 * Logs out the currently logged in user session. This will remove the
		 * session from disk, log out of linked services, and future calls to
		 * <code>current</code> will return <code>null</code>.
		 */
		logOut: function() {
		  if (Parse.User._currentUser !== null) {
		    Parse.User._currentUser._logOutWithAll();
		    Parse.User._currentUser._isCurrentUser = false;
		  }
		  Parse.User._currentUserMatchesDisk = true;
		  Parse.User._currentUser = null;
		  Parse.localStorage.removeItem(
		      Parse._getParsePath(Parse.User._CURRENT_USER_KEY));
		},

		/**
		 * Requests a password reset email to be sent to the specified email address
		 * associated with the user account. This email allows the user to securely
		 * reset their password on the Parse site.
		 *
		 * <p>Calls options.success or options.error on completion.</p>
		 *
		 * @param {String} email The email address associated with the user that
		 *     forgot their password.
		 * @param {Object} options A Backbone-style options object.
		 */
		requestPasswordReset: function(email, options) {
		  var json = { email: email };
		  var request = Parse._request("requestPasswordReset", null, null, "POST",
		                               json);
		  return request._thenRunCallbacks(options);
		},

		/**
		 * Retrieves the currently logged in ParseUser with a valid session,
		 * either from memory or localStorage, if necessary.
		 * @return {Parse.Object} The currently logged in Parse.User.
		 */
		current: function() {
		  if (Parse.User._currentUser) {
		    return Parse.User._currentUser;
		  }

		  if (Parse.User._currentUserMatchesDisk) {
		    // TODO: Lazily log in anonymous user.
		    return Parse.User._currentUser;
		  }

		  // Load the user from local storage.
		  Parse.User._currentUserMatchesDisk = true;

		  var userData = Parse.localStorage.getItem(Parse._getParsePath(
		      Parse.User._CURRENT_USER_KEY));
		  if (!userData) {
		    // TODO: Lazily log in anonymous user.
		    return null;
		  }
		  Parse.User._currentUser = Parse.Object._create("_User");
		  Parse.User._currentUser._isCurrentUser = true;

		  var json = JSON.parse(userData);
		  Parse.User._currentUser.id = json._id;
		  delete json._id;
		  Parse.User._currentUser._sessionToken = json._sessionToken;
		  delete json._sessionToken;
		  Parse.User._currentUser.set(json);

		  Parse.User._currentUser._synchronizeAllAuthData();
		  Parse.User._currentUser._refreshCache();
		  Parse.User._currentUser._opSetQueue = [{}];
		  return Parse.User._currentUser;
		},

		/**
		 * Persists a user as currentUser to localStorage, and into the singleton.
		 */
		_saveCurrentUser: function(user) {
		  if (Parse.User._currentUser !== user) {
		    Parse.User.logOut();
		  }
		  user._isCurrentUser = true;
		  Parse.User._currentUser = user;
		  Parse.User._currentUserMatchesDisk = true;

		  var json = user.toJSON();
		  json._id = user.id;
		  json._sessionToken = user._sessionToken;
		  Parse.localStorage.setItem(
		      Parse._getParsePath(Parse.User._CURRENT_USER_KEY),
		      JSON.stringify(json));
		},

		_registerAuthenticationProvider: function(provider) {
		  Parse.User._authProviders[provider.getAuthType()] = provider;
		  // Synchronize the current user with the auth provider.
		  if (Parse.User.current()) {
		    Parse.User.current()._synchronizeAuthData(provider.getAuthType());
		  }
		},

		_logInWith: function(provider, options) {
		  var user = Parse.Object._create("_User");
		  return user._linkWith(provider, options);
		}

	});

	return true;
}