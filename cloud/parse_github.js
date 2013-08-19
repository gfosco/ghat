
exports.monkeyPatch = function(context) {

  Parse = context.Parse;
  _ = Parse._;

  var PUBLIC_KEY = "*";

  var initialized = false;
  var requestedPermissions;
  var initOptions;
  var provider = {
    authenticate: function(options) {
      var self = this;
      console.log('in authenticate');
      /*
      FB.login(function(response) {
        if (response.authResponse) {
          if (options.success) {
            options.success(self, {
              id: response.authResponse.userID,
              access_token: response.authResponse.accessToken,
              expiration_date: new Date(response.authResponse.expiresIn * 1000 +
                  (new Date()).getTime()).toJSON()
            });
          }
        } else {
          if (options.error) {
            options.error(self, response);
          }
        }
      }, {
        scope: requestedPermissions
      });
*/
    },
    restoreAuthentication: function(authData) {
      if (authData) {
        console.log('in restoreAuthentication');
        /*
        var authResponse = {
          userID: authData.id,
          accessToken: authData.access_token,
          expiresIn: (Parse._parseDate(authData.expiration_date).getTime() -
              (new Date()).getTime()) / 1000
        };
        var newOptions = _.clone(initOptions);
        newOptions.authResponse = authResponse;

        // Suppress checks for login status from the browser.
        newOptions.status = false;
        FB.init(newOptions);
        */
      }
      return true;
    },
    getAuthType: function() {
      return "github";
    },
    deauthenticate: function() {
      this.restoreAuthentication(null);
      console.log('in deauthenticate');
      //FB.logout();
    }
  };

  /**
   * Provides a set of utilities for using Parse with Github.
   * @namespace
   * Provides a set of utilities for using Parse with Github.
   */
  Parse.GithubUtils = {
    /**
     * Initializes Parse Github integration.  
     */
    init: function(options) {
      console.log('in init');
      initOptions = _.clone(options) || {};
      initOptions.status = false;
      //FB.init(initOptions);
      Parse.User._registerAuthenticationProvider(provider);
      initialized = true;
    },

    /**
     * Gets whether the user has their account linked to Github.
     * 
     * @param {Parse.User} user User to check for a Github link.
     *     The user must be logged in on this device.
     * @return {Boolean} <code>true</code> if the user has their account
     *     linked to Github.
     */
    isLinked: function(user) {
      return user._isLinked("github");
    },

    /**
     * Links Github to an existing PFUser. 
     *
     * @param {Parse.User} user User to link to Github. This must be the
     *     current user.
     * @param {String, Object} permissions The permissions required for Github
     *    log in.  This is a comma-separated string of permissions. 
     *    Alternatively, supply a Github authData object as described in our
     *    REST API docs if you want to handle getting Github auth tokens
     *    yourself.
     * @param {Object} options Standard options object with success and error
     *    callbacks.
     */
    link: function(user, permissions, options) {
      if (!permissions || _.isString(permissions)) {
        if (!initialized) {
          throw "You must initialize GithubUtils before calling link.";
        }
        requestedPermissions = permissions;
        return user._linkWith("github", options);
      } else {
        var newOptions = _.clone(options) || {};
        newOptions.authData = permissions;
        return user._linkWith("github", newOptions);
      }
    },

    /**
     * Unlinks the Parse.User from a Github account. 
     * 
     * @param {Parse.User} user User to unlink from Github. This must be the
     *     current user.
     * @param {Object} options Standard options object with success and error
     *    callbacks.
     */
    unlink: function(user, options) {
      if (!initialized) {
        throw "You must initialize GithubUtils before calling unlink.";
      }
      return user._unlinkFrom("github", options);
    }
  };
  
}