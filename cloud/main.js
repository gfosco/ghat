
var http = require('http'),
    fs = require('fs'),
    router = require('cloud/choreographer.js').router(),
    _ = require('underscore')._;

//require('cloud/parse_user.js');

router.get('/checkAuthorization', function c(request, response) {

	console.log('a');
	var user = new Parse.User();
	user.set("username","test");
	user.set("password","test");
	user.set("email","test@test.com");
	user.signUp(null, {
		success: function(user) {
			console.log('Worked.');
			header(response, 200, 'text/plain');
			response.end('OK');
		}, error: function(user, err) { 
			console.log('No Dice.');
			header(response, 401, 'text/plain');
			response.end('ERROR');
		}
	});

});

http.createServer(router).listen();

function header(res, status, contentType) { 
  res.statusCode = status;
  res.setHeader('Content-Type',contentType);
}

function redirect(res, loc) { 
  res.statusCode = 302;
  res.setHeader('Location',loc);
  res.end();
}




















/* PARSE OBJECT */

Parse.Object = function(attributes, options) {
    // Allow new Parse.Object("ClassName") as a shortcut to _create.
    if (_.isString(attributes)) {
      return Parse.Object._create.apply(this, arguments);
    }

    attributes = attributes || {};
    if (options && options.parse) {
      attributes = this.parse(attributes);
    }
    var defaults = Parse._getValue(this, 'defaults');
    if (defaults) {
      attributes = _.extend({}, defaults, attributes);
    }
    if (options && options.collection) {
      this.collection = options.collection;
    }

    this._serverData = {};  // The last known data for this object from cloud.
    this._opSetQueue = [{}];  // List of sets of changes to the data.
    this.attributes = {};  // The best estimate of this's current data.

    this._hashedJSON = {};  // Hash of values of containers at last save.
    this._escapedAttributes = {};
    this.cid = _.uniqueId('c');
    this.changed = {};
    this._silent = {};
    this._pending = {};
    if (!this.set(attributes, {silent: true})) {
      throw new Error("Can't create an invalid Parse.Object");
    }
    this.changed = {};
    this._silent = {};
    this._pending = {};
    this._hasData = true;
    this._previousAttributes = _.clone(this.attributes);
    this.initialize.apply(this, arguments);
  };

  /**
   * @lends Parse.Object.prototype
   * @property {String} id The objectId of the Parse Object.
   */

  /**
   * Saves the given list of Parse.Object.
   * If any error is encountered, stops and calls the error handler.
   * There are two ways you can call this function.
   *
   * The Backbone way:<pre>
   *   Parse.Object.saveAll([object1, object2, ...], {
   *     success: function(list) {
   *       // All the objects were saved.
   *     },
   *     error: function(error) {
   *       // An error occurred while saving one of the objects.
   *     },
   *   });
   * </pre>
   * A simplified syntax:<pre>
   *   Parse.Object.saveAll([object1, object2, ...], function(list, error) {
   *     if (list) {
   *       // All the objects were saved.
   *     } else {
   *       // An error occurred.
   *     }
   *   });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {Object} options A Backbone-style callback object.
   */
  Parse.Object.saveAll = function(list, options) {
    return Parse.Object._deepSaveAsync(list)._thenRunCallbacks(options);
  };

/**
   * Destroy the given list of models on the server if it was already persisted.
   * Optimistically removes each model from its collection, if it has one.
   * If `wait: true` is passed, waits for the server to respond before removal.
   *
   * <p>Unlike saveAll, if an error occurs while deleting an individual model,
   * this method will continue trying to delete the rest of the models if
   * possible, except in the case of a fatal error like a connection error.
   *
   * <p>In particular, the Parse.Error object returned in the case of error may
   * be one of two types:
   *
   * <ul>
   *   <li>A Parse.Error.AGGREGATE_ERROR. This object's "errors" property is an
   *       array of other Parse.Error objects. Each error object in this array
   *       has an "object" property that references the object that could not be
   *       deleted (for instance, because that object could not be found).</li>
   *   <li>A non-aggregate Parse.Error. This indicates a serious error that 
   *       caused the delete operation to be aborted partway through (for 
   *       instance, a connection failure in the middle of the delete).</li>
   * </ul>
   *
   * <p>There are two ways you can call this function.
   * 
   * The Backbone way:<pre>
   *   Parse.Object.destroyAll([object1, object2, ...], {
   *     success: function() {
   *       // All the objects were deleted.
   *     },
   *     error: function(error) {
   *       // An error occurred while deleting one or more of the objects.
   *       // If this is an aggregate error, then we can inspect each error
   *       // object individually to determine the reason why a particular
   *       // object was not deleted.
   *       if (error.code == Parse.Error.AGGREGATE_ERROR) {
   *         for (var i = 0; i < error.errors.length; i++) {
   *           console.log("Couldn't delete " + error.errors[i].object.id + 
   *             "due to " + error.errors[i].message);
   *         }
   *       } else {
   *         console.log("Delete aborted because of " + error.message);
   *       }
   *     },
   *   });
   * </pre>
   * A simplified syntax:<pre>
   *   Parse.Object.destroyAll([obj1, obj2, ...], function(success, error) {
   *     if (success) {
   *       // All the objects were saved.
   *     } else {
   *       // An error occurred while deleting one or more of the objects.
   *       // If this is an aggregate error, then we can inspect each error
   *       // object individually to determine the reason why a particular
   *       // object was not deleted.
   *       if (error.code == Parse.Error.AGGREGATE_ERROR) {
   *         for (var i = 0; i < error.errors.length; i++) {
   *           console.log("Couldn't delete " + error.errors[i].object.id + 
   *             "due to " + error.errors[i].message);
   *         }
   *       } else {
   *         console.log("Delete aborted because of " + error.message);
   *       }
   *     }
   *   });
   * </pre>
   *
   * @param {Array} list A list of <code>Parse.Object</code>.
   * @param {Object} options A Backbone-style callback object.
   */
  Parse.Object.destroyAll = function(list, options) {
    var promise = Parse.Promise.as();
    var batch = [];
    var errors = [];

    var triggerDestroy = function(object) {
      object.trigger('destroy', object, object.collection, options);
    };

    var destroyBatch = function(batch) {
      var promise = Parse.Promise.as();

      if (batch.length > 0) {
        promise = promise.then(function() {
          return Parse._request("batch", null, null, "POST", {
            requests: _.map(batch, function(object) {
              return {
                method: "DELETE",
                path: "/1/classes/" + object.className + "/" + object.id
              };
            })
          });
        }).then(function(responses, status, xhr) {
          Parse._arrayEach(batch, function(object, i) {
            if (responses[i].success && options.wait) {
              triggerDestroy(object);
            } else if (responses[i].error) {
              var error = new Parse.Error(responses[i].error.code,
                                          responses[i].error.error);
              error.object = object;

              errors.push(error);
            }
          });
        });
      }

      return promise;
    };

    Parse._arrayEach(list, function(object, i) {
      if (!object.id || !options.wait) {
        triggerDestroy(object);
      }

      if (object.id) {
        batch.push(object);
      }

      if (batch.length === 20 || i+1 === list.length) {
        var thisBatch = batch;
        batch = [];

        promise = promise.then(function() {
          return destroyBatch(thisBatch);
        });
      }
    });

    return promise.then(function() {
      if (errors.length === 0) {
        return true;
      } else {
        var error = new Parse.Error(Parse.Error.AGGREGATE_ERROR,
                                    "Error deleting an object in destroyAll");
        error.errors = errors;

        return Parse.Promise.error(error);
      }
    })._thenRunCallbacks(options);
  };

  // Attach all inheritable methods to the Parse.Object prototype.
  _.extend(Parse.Object.prototype, Parse.Events,
           /** @lends Parse.Object.prototype */ {
    _existed: false,

    /**
     * Initialize is an empty function by default. Override it with your own
     * initialization logic.
     */
    initialize: function(){},

    /**
     * Returns a JSON version of the object suitable for saving to Parse.
     * @return {Object}
     */
    toJSON: function() {
      var json = this._toFullJSON();
      Parse._arrayEach(["__type", "className"],
                       function(key) { delete json[key]; });
      return json;
    },

    _toFullJSON: function(seenObjects) {
      var json = _.clone(this.attributes);
      Parse._objectEach(json, function(val, key) {
        json[key] = Parse._encode(val, seenObjects);
      });
      Parse._objectEach(this._operations, function(val, key) {
        json[key] = val;
      });

      if (_.has(this, "id")) {
        json.objectId = this.id;
      }
      if (_.has(this, "createdAt")) {
        if (_.isDate(this.createdAt)) {
          json.createdAt = this.createdAt.toJSON();
        } else {
          json.createdAt = this.createdAt;
        }
      }

      if (_.has(this, "updatedAt")) {
        if (_.isDate(this.updatedAt)) {
          json.updatedAt = this.updatedAt.toJSON();
        } else {
          json.updatedAt = this.updatedAt;
        }
      }
      json.__type = "Object";
      json.className = this.className;
      return json;
    },

    /**
     * Updates _hashedJSON to reflect the current state of this object.
     * Adds any changed hash values to the set of pending changes.
     */
    _refreshCache: function() {
      var self = this;
      if (self._refreshingCache) {
        return;
      }
      self._refreshingCache = true;
      Parse._objectEach(this.attributes, function(value, key) {
        if (value instanceof Parse.Object) {
          value._refreshCache();
        } else if (_.isObject(value)) {
          if (self._resetCacheForKey(key)) {
            self.set(key, new Parse.Op.Set(value), { silent: true });
          }
        }
      });
      delete self._refreshingCache;
    },

    /**
     * Returns true if this object has been modified since its last
     * save/refresh.  If an attribute is specified, it returns true only if that
     * particular attribute has been modified since the last save/refresh.
     * @param {String} attr An attribute name (optional).
     * @return {Boolean}
     */
    dirty: function(attr) {
      this._refreshCache();

      var currentChanges = _.last(this._opSetQueue);

      if (attr) {
        return (currentChanges[attr] ? true : false);
      }
      if (!this.id) {
        return true;
      }
      if (_.keys(currentChanges).length > 0) {
        return true;
      }
      return false;
    },

    /**
     * Gets a Pointer referencing this Object.
     */
    _toPointer: function() {
      if (!this.id) {
        throw new Error("Can't serialize an unsaved Parse.Object");
      }
      return { __type: "Pointer",
               className: this.className,
               objectId: this.id };
    },

    /**
     * Gets the value of an attribute.
     * @param {String} attr The string name of an attribute.
     */
    get: function(attr) {
      return this.attributes[attr];
    },

    /**
     * Gets a relation on the given class for the attribute.
     * @param String attr The attribute to get the relation for.
     */
    relation: function(attr) {
      var value = this.get(attr);
      if (value) {
        if (!(value instanceof Parse.Relation)) {
          throw "Called relation() on non-relation field " + attr;
        }
        value._ensureParentAndKey(this, attr);
        return value;
      } else {
        return new Parse.Relation(this, attr);
      }
    },

    /**
     * Gets the HTML-escaped value of an attribute.
     */
    escape: function(attr) {
      var html = this._escapedAttributes[attr];
      if (html) {
        return html;
      }
      var val = this.attributes[attr];
      var escaped;
      if (Parse._isNullOrUndefined(val)) {
        escaped = '';
      } else {
        escaped = _.escape(val.toString());
      }
      this._escapedAttributes[attr] = escaped;
      return escaped;
    },

    /**
     * Returns <code>true</code> if the attribute contains a value that is not
     * null or undefined.
     * @param {String} attr The string name of the attribute.
     * @return {Boolean}
     */
    has: function(attr) {
      return !Parse._isNullOrUndefined(this.attributes[attr]);
    },

    /**
     * Pulls "special" fields like objectId, createdAt, etc. out of attrs
     * and puts them on "this" directly.  Removes them from attrs.
     * @param attrs - A dictionary with the data for this Parse.Object.
     */
    _mergeMagicFields: function(attrs) {
      // Check for changes of magic fields.
      var model = this;
      var specialFields = ["id", "objectId", "createdAt", "updatedAt"];
      Parse._arrayEach(specialFields, function(attr) {
        if (attrs[attr]) {
          if (attr === "objectId") {
            model.id = attrs[attr];
          } else if ((attr === "createdAt" || attr === "updatedAt") &&
                     !_.isDate(attrs[attr])) {
            model[attr] = Parse._parseDate(attrs[attr]);
          } else {
            model[attr] = attrs[attr];
          }
          delete attrs[attr];
        }
      });
    },

    /**
     * Returns the json to be sent to the server.
     */
    _startSave: function() {
      this._opSetQueue.push({});
    },

    /**
     * Called when a save fails because of an error. Any changes that were part
     * of the save need to be merged with changes made after the save. This
     * might throw an exception is you do conflicting operations. For example,
     * if you do:
     *   object.set("foo", "bar");
     *   object.set("invalid field name", "baz");
     *   object.save();
     *   object.increment("foo");
     * then this will throw when the save fails and the client tries to merge
     * "bar" with the +1.
     */
    _cancelSave: function() {
      var self = this;
      var failedChanges = _.first(this._opSetQueue);
      this._opSetQueue = _.rest(this._opSetQueue);
      var nextChanges = _.first(this._opSetQueue);
      Parse._objectEach(failedChanges, function(op, key) {
        var op1 = failedChanges[key];
        var op2 = nextChanges[key];
        if (op1 && op2) {
          nextChanges[key] = op2._mergeWithPrevious(op1);
        } else if (op1) {
          nextChanges[key] = op1;
        }
      });
      this._saving = this._saving - 1;
    },

    /**
     * Called when a save completes successfully. This merges the changes that
     * were saved into the known server data, and overrides it with any data
     * sent directly from the server.
     */
    _finishSave: function(serverData) {
      // Grab a copy of any object referenced by this object. These instances
      // may have already been fetched, and we don't want to lose their data.
      // Note that doing it like this means we will unify separate copies of the
      // same object, but that's a risk we have to take.
      var fetchedObjects = {};
      Parse._traverse(this.attributes, function(object) {
        if (object instanceof Parse.Object && object.id && object._hasData) {
          fetchedObjects[object.id] = object;
        }
      });

      var savedChanges = _.first(this._opSetQueue);
      this._opSetQueue = _.rest(this._opSetQueue);
      this._applyOpSet(savedChanges, this._serverData);
      this._mergeMagicFields(serverData);
      var self = this;
      Parse._objectEach(serverData, function(value, key) {
        self._serverData[key] = Parse._decode(key, value);

        // Look for any objects that might have become unfetched and fix them
        // by replacing their values with the previously observed values.
        var fetched = Parse._traverse(self._serverData[key], function(object) {
          if (object instanceof Parse.Object && fetchedObjects[object.id]) {
            return fetchedObjects[object.id];
          }
        });
        if (fetched) {
          self._serverData[key] = fetched;
        }
      });
      this._rebuildAllEstimatedData();
      this._saving = this._saving - 1;
    },

    /**
     * Called when a fetch or login is complete to set the known server data to
     * the given object.
     */
    _finishFetch: function(serverData, hasData) {
      // Clear out any changes the user might have made previously.
      this._opSetQueue = [{}];

      // Bring in all the new server data.
      this._mergeMagicFields(serverData);
      var self = this;
      Parse._objectEach(serverData, function(value, key) {
        self._serverData[key] = Parse._decode(key, value);
      });

      // Refresh the attributes.
      this._rebuildAllEstimatedData();

      // Clear out the cache of mutable containers.
      this._refreshCache();
      this._opSetQueue = [{}];

      this._hasData = hasData;
    },

    /**
     * Applies the set of Parse.Op in opSet to the object target.
     */
    _applyOpSet: function(opSet, target) {
      var self = this;
      Parse._objectEach(opSet, function(change, key) {
        target[key] = change._estimate(target[key], self, key);
        if (target[key] === Parse.Op._UNSET) {
          delete target[key];
        }
      });
    },

    /**
     * Replaces the cached value for key with the current value.
     * Returns true if the new value is different than the old value.
     */
    _resetCacheForKey: function(key) {
      var value = this.attributes[key];
      if (_.isObject(value) &&
          !(value instanceof Parse.Object) &&
          !(value instanceof Parse.File)) {
        value = value.toJSON ? value.toJSON() : value;
        var json = JSON.stringify(value);
        if (this._hashedJSON[key] !== json) {
          this._hashedJSON[key] = json;
          return true;
        }
      }
      return false;
    },

    /**
     * Populates attributes[key] by starting with the last known data from the
     * server, and applying all of the local changes that have been made to that
     * key since then.
     */
    _rebuildEstimatedDataForKey: function(key) {
      var self = this;
      delete this.attributes[key];
      if (this._serverData[key]) {
        this.attributes[key] = this._serverData[key];
      }
      Parse._arrayEach(this._opSetQueue, function(opSet) {
        var op = opSet[key];
        if (op) {
          self.attributes[key] = op._estimate(self.attributes[key], self, key);
          if (self.attributes[key] === Parse.Op._UNSET) {
            delete self.attributes[key];
          } else {
            self._resetCacheForKey(key);
          }
        }
      });
    },

    /**
     * Populates attributes by starting with the last known data from the
     * server, and applying all of the local changes that have been made since
     * then.
     */
    _rebuildAllEstimatedData: function() {
      var self = this;

      var previousAttributes = _.clone(this.attributes);

      this.attributes = _.clone(this._serverData);
      Parse._arrayEach(this._opSetQueue, function(opSet) {
        self._applyOpSet(opSet, self.attributes);
        Parse._objectEach(opSet, function(op, key) {
          self._resetCacheForKey(key);
        });
      });

      // Trigger change events for anything that changed because of the fetch.
      Parse._objectEach(previousAttributes, function(oldValue, key) {
        if (self.attributes[key] !== oldValue) {
          self.trigger('change:' + key, self, self.attributes[key], {});
        }
      });
      Parse._objectEach(this.attributes, function(newValue, key) {
        if (!_.has(previousAttributes, key)) {
          self.trigger('change:' + key, self, newValue, {});
        }
      });
    },

    /**
     * Sets a hash of model attributes on the object, firing
     * <code>"change"</code> unless you choose to silence it.
     *
     * <p>You can call it with an object containing keys and values, or with one
     * key and value.  For example:<pre>
     *   gameTurn.set({
     *     player: player1,
     *     diceRoll: 2
     *   }, {
     *     error: function(gameTurnAgain, error) {
     *       // The set failed validation.
     *     }
     *   });
     *
     *   game.set("currentPlayer", player2, {
     *     error: function(gameTurnAgain, error) {
     *       // The set failed validation.
     *     }
     *   });
     *
     *   game.set("finished", true);</pre></p>
     * 
     * @param {String} key The key to set.
     * @param {} value The value to give it.
     * @param {Object} options A set of Backbone-like options for the set.
     *     The only supported options are <code>silent</code>,
     *     <code>error</code>, and <code>promise</code>.
     * @return {Boolean} true if the set succeeded.
     * @see Parse.Object#validate
     * @see Parse.Error
     */
    set: function(key, value, options) {
      var attrs, attr;
      if (_.isObject(key) || Parse._isNullOrUndefined(key)) {
        attrs = key;
        Parse._objectEach(attrs, function(v, k) {
          attrs[k] = Parse._decode(k, v);
        });
        options = value;
      } else {
        attrs = {};
        attrs[key] = Parse._decode(key, value);
      }

      // Extract attributes and options.
      options = options || {};
      if (!attrs) {
        return this;
      }
      if (attrs instanceof Parse.Object) {
        attrs = attrs.attributes;
      }

      // If the unset option is used, every attribute should be a Unset.
      if (options.unset) {
        Parse._objectEach(attrs, function(unused_value, key) {
          attrs[key] = new Parse.Op.Unset();
        });
      }

      // Apply all the attributes to get the estimated values.
      var dataToValidate = _.clone(attrs);
      var self = this;
      Parse._objectEach(dataToValidate, function(value, key) {
        if (value instanceof Parse.Op) {
          dataToValidate[key] = value._estimate(self.attributes[key],
                                                self, key);
          if (dataToValidate[key] === Parse.Op._UNSET) {
            delete dataToValidate[key];
          }
        }
      });

      // Run validation.
      if (!this._validate(attrs, options)) {
        return false;
      }

      this._mergeMagicFields(attrs);

      options.changes = {};
      var escaped = this._escapedAttributes;
      var prev = this._previousAttributes || {};

      // Update attributes.
      Parse._arrayEach(_.keys(attrs), function(attr) {
        var val = attrs[attr];

        // If this is a relation object we need to set the parent correctly,
        // since the location where it was parsed does not have access to
        // this object.
        if (val instanceof Parse.Relation) {
          val.parent = self;
        }

        if (!(val instanceof Parse.Op)) {
          val = new Parse.Op.Set(val);
        }

        // See if this change will actually have any effect.
        var isRealChange = true;
        if (val instanceof Parse.Op.Set &&
            _.isEqual(self.attributes[attr], val.value)) {
          isRealChange = false;
        }

        if (isRealChange) {
          delete escaped[attr];
          if (options.silent) {
            self._silent[attr] = true;
          } else {
            options.changes[attr] = true;
          }
        }

        var currentChanges = _.last(self._opSetQueue);
        currentChanges[attr] = val._mergeWithPrevious(currentChanges[attr]);
        self._rebuildEstimatedDataForKey(attr);

        if (isRealChange) {
          self.changed[attr] = self.attributes[attr];
          if (!options.silent) {
            self._pending[attr] = true;
          }
        } else {
          delete self.changed[attr];
          delete self._pending[attr];
        }
      });

      if (!options.silent) {
        this.change(options);
      }
      return this;
    },

    /**
     * Remove an attribute from the model, firing <code>"change"</code> unless
     * you choose to silence it. This is a noop if the attribute doesn't
     * exist.
     */
    unset: function(attr, options) {
      options = options || {};
      options.unset = true;
      return this.set(attr, null, options);
    },

    /**
     * Atomically increments the value of the given attribute the next time the
     * object is saved. If no amount is specified, 1 is used by default.
     *
     * @param attr {String} The key.
     * @param amount {Number} The amount to increment by.
     */
    increment: function(attr, amount) {
      if (_.isUndefined(amount) || _.isNull(amount)) {
        amount = 1;
      }
      return this.set(attr, new Parse.Op.Increment(amount));
    },

    /**
     * Atomically add an object to the end of the array associated with a given
     * key.
     * @param attr {String} The key.
     * @param item {} The item to add.
     */
    add: function(attr, item) {
      return this.set(attr, new Parse.Op.Add([item]));
    },

    /**
     * Atomically add an object to the array associated with a given key, only
     * if it is not already present in the array. The position of the insert is
     * not guaranteed.
     *
     * @param attr {String} The key.
     * @param item {} The object to add.
     */
    addUnique: function(attr, item) {
      return this.set(attr, new Parse.Op.AddUnique([item]));
    },

    /**
     * Atomically remove all instances of an object from the array associated
     * with a given key.
     *
     * @param attr {String} The key.
     * @param item {} The object to remove.
     */
    remove: function(attr, item) {
      return this.set(attr, new Parse.Op.Remove([item]));
    },

    /**
     * Returns an instance of a subclass of Parse.Op describing what kind of
     * modification has been performed on this field since the last time it was
     * saved. For example, after calling object.increment("x"), calling
     * object.op("x") would return an instance of Parse.Op.Increment.
     *
     * @param attr {String} The key.
     * @returns {Parse.Op} The operation, or undefined if none.
     */
    op: function(attr) {
      return _.last(this._opSetQueue)[attr];
    },

    /**
     * Clear all attributes on the model, firing <code>"change"</code> unless
     * you choose to silence it.
     */
    clear: function(options) {
      options = options || {};
      options.unset = true;
      var keysToClear = _.extend(this.attributes, this._operations);
      return this.set(keysToClear, options);
    },

    /**
     * Returns a JSON-encoded set of operations to be sent with the next save
     * request.
     */
    _getSaveJSON: function() {
      var json = _.clone(_.first(this._opSetQueue));
      Parse._objectEach(json, function(op, key) {
        json[key] = op.toJSON();
      });
      return json;
    },

    /**
     * Returns true if this object can be serialized for saving.
     */
    _canBeSerialized: function() {
      return Parse.Object._canBeSerializedAsValue(this.attributes);
    },

    /**
     * Fetch the model from the server. If the server's representation of the
     * model differs from its current attributes, they will be overriden,
     * triggering a <code>"change"</code> event.
     *
     * @param {Object} options A Backbone-style callback object.
     * Valid options are:<ul>
     *   <li>success: A Backbone-style success callback.
     *   <li>error: An Backbone-style error callback.
     * </ul>
     * @return {Parse.Promise} A promise that is fulfilled when the fetch
     *     completes.
     */
    fetch: function(options) {
      var self = this;
      var request = Parse._request("classes", this.className, this.id, 'GET');
      return request.then(function(response, status, xhr) {
        self._finishFetch(self.parse(response, status, xhr), true);
        return self;
      })._thenRunCallbacks(options, this);
    },

    /**
     * Set a hash of model attributes, and save the model to the server.
     * updatedAt will be updated when the request returns.
     * You can either call it as:<pre>
     *   object.save();</pre>
     * or<pre>
     *   object.save(null, options);</pre>
     * or<pre>
     *   object.save(attrs, options);</pre>
     * or<pre>
     *   object.save(key, value, options);</pre>
     *
     * For example, <pre>
     *   gameTurn.save({
     *     player: "Jake Cutter",
     *     diceRoll: 2
     *   }, {
     *     success: function(gameTurnAgain) {
     *       // The save was successful.
     *     },
     *     error: function(gameTurnAgain, error) {
     *       // The save failed.  Error is an instance of Parse.Error.
     *     }
     *   });</pre>
     * or with promises:<pre>
     *   gameTurn.save({
     *     player: "Jake Cutter",
     *     diceRoll: 2
     *   }).then(function(gameTurnAgain) {
     *     // The save was successful.
     *   }, function(error) {
     *     // The save failed.  Error is an instance of Parse.Error.
     *   });</pre>
     * 
     * @param {Object} options A Backbone-style callback object.
     * Valid options are:<ul>
     *   <li>wait: Set to true to wait for the server to confirm a successful
     *   save before modifying the attributes on the object.
     *   <li>silent: Set to true to avoid firing the `set` event.
     *   <li>success: A Backbone-style success callback.
     *   <li>error: An Backbone-style error callback.
     * </ul>
     * @return {Parse.Promise} A promise that is fulfilled when the save
     *     completes.
     * @see Parse.Error
     */
    save: function(arg1, arg2, arg3) {
      var i, attrs, current, options, saved;
      if (_.isObject(arg1) || Parse._isNullOrUndefined(arg1)) {
        attrs = arg1;
        options = arg2;
      } else {
        attrs = {};
        attrs[arg1] = arg2;
        options = arg3;
      }

      // Make save({ success: function() {} }) work.
      if (!options && attrs) {
        var extra_keys = _.reject(attrs, function(value, key) {
          return _.include(["success", "error", "wait"], key);
        });
        if (extra_keys.length === 0) {
          var all_functions = true;
          if (_.has(attrs, "success") && !_.isFunction(attrs.success)) {
            all_functions = false;
          }
          if (_.has(attrs, "error") && !_.isFunction(attrs.error)) {
            all_functions = false;
          }
          if (all_functions) {
            // This attrs object looks like it's really an options object,
            // and there's no other options object, so let's just use it.
            return this.save(null, attrs);
          }
        }
      }

      options = _.clone(options) || {};
      if (options.wait) {
        current = _.clone(this.attributes);
      }

      var setOptions = _.clone(options) || {};
      if (setOptions.wait) {
        setOptions.silent = true;
      }
      var setError;
      setOptions.error = function(model, error) {
        setError = error;
      };
      if (attrs && !this.set(attrs, setOptions)) {
        return Parse.Promise.error(setError)._thenRunCallbacks(options, this);
      }

      var model = this;

      // If there is any unsaved child, save it first.
      model._refreshCache();

      // TODO(klimt): Refactor this so that the save starts now, not later.

      var unsavedChildren = [];
      var unsavedFiles = [];
      Parse.Object._findUnsavedChildren(model.attributes,
                                        unsavedChildren,
                                        unsavedFiles);
      if (unsavedChildren.length + unsavedFiles.length > 0) {
        return Parse.Object._deepSaveAsync(this.attributes).then(function() {
          return model.save(null, options);
        }, function(error) {
          return Parse.Promise.error(error)._thenRunCallbacks(options, model);
        });
      }

      this._startSave();
      this._saving = (this._saving || 0) + 1;

      this._allPreviousSaves = this._allPreviousSaves || Parse.Promise.as();
      this._allPreviousSaves = this._allPreviousSaves._continueWith(function() {
        var method = model.id ? 'PUT' : 'POST';

        var json = model._getSaveJSON();

        var route = "classes";
        var className = model.className;
        if (model.className === "_User" && !model.id) {
          // Special-case user sign-up.
          route = "users";
          className = null;
        }
        var request = Parse._request(route, className, model.id, method, json);

        request = request.then(function(resp, status, xhr) {
          var serverAttrs = model.parse(resp, status, xhr);
          if (options.wait) {
            serverAttrs = _.extend(attrs || {}, serverAttrs);
          }
          model._finishSave(serverAttrs);
          if (options.wait) {
            model.set(current, setOptions);
          }
          return model;

        }, function(error) {
          model._cancelSave();
          return Parse.Promise.error(error);

        })._thenRunCallbacks(options, model);

        return request;
      });
      return this._allPreviousSaves;
    },

    /**
     * Destroy this model on the server if it was already persisted.
     * Optimistically removes the model from its collection, if it has one.
     * If `wait: true` is passed, waits for the server to respond
     * before removal.
     *
     * @param {Object} options A Backbone-style callback object.
     * Valid options are:<ul>
     *   <li>wait: Set to true to wait for the server to confirm successful
     *   deletion of the object before triggering the `destroy` event.
     *   <li>success: A Backbone-style success callback
     *   <li>error: An Backbone-style error callback.
     * </ul>
     * @return {Parse.Promise} A promise that is fulfilled when the destroy
     *     completes.
     */
    destroy: function(options) {
      options = options || {};
      var model = this;

      var triggerDestroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      if (!this.id) {
        return triggerDestroy();
      }

      if (!options.wait) {
        triggerDestroy();
      }

      var request =
          Parse._request("classes", this.className, this.id, 'DELETE');
      return request.then(function() {
        if (options.wait) {
          triggerDestroy();
        }
        return model;
      })._thenRunCallbacks(options, this);
    },

    /**
     * Converts a response into the hash of attributes to be set on the model.
     * @ignore
     */
    parse: function(resp, status, xhr) {
      var output = _.clone(resp);
      _(["createdAt", "updatedAt"]).each(function(key) {
        if (output[key]) {
          output[key] = Parse._parseDate(output[key]);
        }
      });
      if (!output.updatedAt) {
        output.updatedAt = output.createdAt;
      }
      if (status) {
        this._existed = (status !== 201);
      }
      return output;
    },

    /**
     * Creates a new model with identical attributes to this one.
     * @return {Parse.Object}
     */
    clone: function() {
      return new this.constructor(this.attributes);
    },

    /**
     * Returns true if this object has never been saved to Parse.
     * @return {Boolean}
     */
    isNew: function() {
      return !this.id;
    },

    /**
     * Call this method to manually fire a `"change"` event for this model and
     * a `"change:attribute"` event for each changed attribute.
     * Calling this will cause all objects observing the model to update.
     */
    change: function(options) {
      options = options || {};
      var changing = this._changing;
      this._changing = true;

      // Silent changes become pending changes.
      var self = this;
      Parse._objectEach(this._silent, function(attr) {
        self._pending[attr] = true;
      });

      // Silent changes are triggered.
      var changes = _.extend({}, options.changes, this._silent);
      this._silent = {};
      Parse._objectEach(changes, function(unused_value, attr) {
        self.trigger('change:' + attr, self, self.get(attr), options);
      });
      if (changing) {
        return this;
      }

      // This is to get around lint not letting us make a function in a loop.
      var deleteChanged = function(value, attr) {
        if (!self._pending[attr] && !self._silent[attr]) {
          delete self.changed[attr];
        }
      };

      // Continue firing `"change"` events while there are pending changes.
      while (!_.isEmpty(this._pending)) {
        this._pending = {};
        this.trigger('change', this, options);
        // Pending and silent changes still remain.
        Parse._objectEach(this.changed, deleteChanged);
        self._previousAttributes = _.clone(this.attributes);
      }

      this._changing = false;
      return this;
    },

    /**
     * Returns true if this object was created by the Parse server when the
     * object might have already been there (e.g. in the case of a Facebook
     * login)
     */
    existed: function() {
      return this._existed;
    },

    /**
     * Determine if the model has changed since the last <code>"change"</code>
     * event.  If you specify an attribute name, determine if that attribute
     * has changed.
     * @param {String} attr Optional attribute name
     * @return {Boolean}
     */
    hasChanged: function(attr) {
      if (!arguments.length) {
        return !_.isEmpty(this.changed);
      }
      return this.changed && _.has(this.changed, attr);
    },

    /**
     * Returns an object containing all the attributes that have changed, or
     * false if there are no changed attributes. Useful for determining what
     * parts of a view need to be updated and/or what attributes need to be
     * persisted to the server. Unset attributes will be set to undefined.
     * You can also pass an attributes object to diff against the model,
     * determining if there *would be* a change.
     */
    changedAttributes: function(diff) {
      if (!diff) {
        return this.hasChanged() ? _.clone(this.changed) : false;
      }
      var changed = {};
      var old = this._previousAttributes;
      Parse._objectEach(diff, function(diffVal, attr) {
        if (!_.isEqual(old[attr], diffVal)) {
          changed[attr] = diffVal;
        }
      });
      return changed;
    },

    /**
     * Gets the previous value of an attribute, recorded at the time the last
     * <code>"change"</code> event was fired.
     * @param {String} attr Name of the attribute to get.
     */
    previous: function(attr) {
      if (!arguments.length || !this._previousAttributes) {
        return null;
      }
      return this._previousAttributes[attr];
    },

    /**
     * Gets all of the attributes of the model at the time of the previous
     * <code>"change"</code> event.
     * @return {Object}
     */
    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    /**
     * Checks if the model is currently in a valid state. It's only possible to
     * get into an *invalid* state if you're using silent changes.
     * @return {Boolean}
     */
    isValid: function() {
      return !this.validate(this.attributes);
    },

    /**
     * You should not call this function directly unless you subclass
     * <code>Parse.Object</code>, in which case you can override this method
     * to provide additional validation on <code>set</code> and
     * <code>save</code>.  Your implementation should return 
     *
     * @param {Object} attrs The current data to validate.
     * @param {Object} options A Backbone-like options object.
     * @return {} False if the data is valid.  An error object otherwise.
     * @see Parse.Object#set
     */
    validate: function(attrs, options) {
      if (_.has(attrs, "ACL") && !(attrs.ACL instanceof Parse.ACL)) {
        return new Parse.Error(Parse.Error.OTHER_CAUSE,
                               "ACL must be a Parse.ACL.");
      }
      return false;
    },

    /**
     * Run validation against a set of incoming attributes, returning `true`
     * if all is well. If a specific `error` callback has been passed,
     * call that instead of firing the general `"error"` event.
     */
    _validate: function(attrs, options) {
      if (options.silent || !this.validate) {
        return true;
      }
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validate(attrs, options);
      if (!error) {
        return true;
      }
      if (options && options.error) {
        options.error(this, error, options);
      } else {
        this.trigger('error', this, error, options);
      }
      return false;
    },

    /**
     * Returns the ACL for this object.
     * @returns {Parse.ACL} An instance of Parse.ACL.
     * @see Parse.Object#get
     */
    getACL: function() {
      return this.get("ACL");
    },

    /**
     * Sets the ACL to be used for this object.
     * @param {Parse.ACL} acl An instance of Parse.ACL.
     * @param {Object} options Optional Backbone-like options object to be
     *     passed in to set.
     * @return {Boolean} Whether the set passed validation.
     * @see Parse.Object#set
     */
    setACL: function(acl, options) {
      return this.set("ACL", acl, options);
    }

  });

  /**
   * Returns the appropriate subclass for making new instances of the given
   * className string.
   */
  Parse.Object._getSubclass = function(className) {
    if (!_.isString(className)) {
      throw "Parse.Object._getSubclass requires a string argument.";
    }
    var ObjectClass = Parse.Object._classMap[className];
    if (!ObjectClass) {
      ObjectClass = Parse.Object.extend(className);
      Parse.Object._classMap[className] = ObjectClass;
    }
    return ObjectClass;
  };

  /**
   * Creates an instance of a subclass of Parse.Object for the given classname.
   */
  Parse.Object._create = function(className, attributes, options) {
    var ObjectClass = Parse.Object._getSubclass(className);
    return new ObjectClass(attributes, options);
  };

  // Set up a map of className to class so that we can create new instances of
  // Parse Objects from JSON automatically.
  Parse.Object._classMap = {};

  Parse.Object._extend = Parse._extend;

  /**
   * Creates a new subclass of Parse.Object for the given Parse class name.
   *
   * <p>Every extension of a Parse class will inherit from the most recent
   * previous extension of that class. When a Parse.Object is automatically
   * created by parsing JSON, it will use the most recent extension of that
   * class.</p>
   *
   * <p>You should call either:<pre>
   *     var MyClass = Parse.Object.extend("MyClass", {
   *         <i>Instance properties</i>
   *     }, {
   *         <i>Class properties</i>
   *     });</pre>
   * or, for Backbone compatibility:<pre>
   *     var MyClass = Parse.Object.extend({
   *         className: "MyClass",
   *         <i>Other instance properties</i>
   *     }, {
   *         <i>Class properties</i>
   *     });</pre></p>
   *
   * @param {String} className The name of the Parse class backing this model.
   * @param {Object} protoProps Instance properties to add to instances of the
   *     class returned from this method.
   * @param {Object} classProps Class properties to add the class returned from
   *     this method.
   * @return {Class} A new subclass of Parse.Object.
   */
  Parse.Object.extend = function(className, protoProps, classProps) {
    // Handle the case with only two args.
    if (!_.isString(className)) {
      if (className && _.has(className, "className")) {
        return Parse.Object.extend(className.className, className, protoProps);
      } else {
        throw new Error(
            "Parse.Object.extend's first argument should be the className.");
      }
    }

    // If someone tries to subclass "User", coerce it to the right type.
    if (className === "User") {
      className = "_User";
    }

    var NewClassObject = null;
    if (_.has(Parse.Object._classMap, className)) {
      var OldClassObject = Parse.Object._classMap[className];
      // This new subclass has been told to extend both from "this" and from
      // OldClassObject. This is multiple inheritance, which isn't supported.
      // For now, let's just pick one.
      NewClassObject = OldClassObject._extend(protoProps, classProps);
    } else {
      protoProps = protoProps || {};
      protoProps.className = className;
      NewClassObject = this._extend(protoProps, classProps);
    }
    // Extending a subclass should reuse the classname automatically.
    NewClassObject.extend = function(arg0) {
      if (_.isString(arg0) || (arg0 && _.has(arg0, "className"))) {
        return Parse.Object.extend.apply(NewClassObject, arguments);
      }
      var newArguments = [className].concat(Parse._.toArray(arguments));
      return Parse.Object.extend.apply(NewClassObject, newArguments);
    };
    Parse.Object._classMap[className] = NewClassObject;
    return NewClassObject;
  };

  Parse.Object._findUnsavedChildren = function(object, children, files) {
    Parse._traverse(object, function(object) {
      if (object instanceof Parse.Object) {
        object._refreshCache();
        if (object.dirty()) {
          children.push(object);
        }
        return;
      }

      if (object instanceof Parse.File) {
        if (!object.url()) {
          files.push(object);
        }
        return;
      }
    });
  };

  Parse.Object._canBeSerializedAsValue = function(object) {
    // TODO(klimt): We should rewrite _traverse so that it can be used here.
    if (object instanceof Parse.Object) {
      return !!object.id;
    }
    if (object instanceof Parse.File) {
      // Don't recurse indefinitely into files.
      return true;
    }

    var canBeSerializedAsValue = true;

    if (_.isArray(object)) {
      Parse._arrayEach(object, function(child) {
        if (!Parse.Object._canBeSerializedAsValue(child)) {
          canBeSerializedAsValue = false;
        }
      });
    } else if (_.isObject(object)) {
      Parse._objectEach(object, function(child) {
        if (!Parse.Object._canBeSerializedAsValue(child)) {
          canBeSerializedAsValue = false;
        }
      });
    }
    return canBeSerializedAsValue;
  };

  Parse.Object._deepSaveAsync = function(object) {
    var unsavedChildren = [];
    var unsavedFiles = [];
    Parse.Object._findUnsavedChildren(object, unsavedChildren, unsavedFiles);

    var promise = Parse.Promise.as();
    _.each(unsavedFiles, function(file) {
      promise = promise.then(function() {
        return file.save();
      });
    });

    var objects = _.uniq(unsavedChildren);
    var remaining = _.uniq(objects);

    return promise.then(function() {
      return Parse.Promise._continueWhile(function() {
        return remaining.length > 0;
      }, function() {

        // Gather up all the objects that can be saved in this batch.
        var batch = [];
        var newRemaining = [];
        Parse._arrayEach(remaining, function(object) {
          // Limit batches to 20 objects.
          if (batch.length > 20) {
            newRemaining.push(object);
            return;
          }

          if (object._canBeSerialized()) {
            batch.push(object);
          } else {
            newRemaining.push(object);
          }
        });
        remaining = newRemaining;

        // If we can't save any objects, there must be a circular reference.
        if (batch.length === 0) {
          return Parse.Promise.error(
            new Parse.Error(Parse.Error.OTHER_CAUSE,
                            "Tried to save a batch with a cycle."));
        }

        // Reserve a spot in every object's save queue.
        var readyToStart = Parse.Promise.when(_.map(batch, function(object) {
          return object._allPreviousSaves || Parse.Promise.as();
        }));
        var batchFinished = new Parse.Promise();
        Parse._arrayEach(batch, function(object) {
          object._allPreviousSaves = batchFinished;
        });

        // Save a single batch, whether previous saves succeeded or failed.
        return readyToStart._continueWith(function() {
          return Parse._request("batch", null, null, "POST", {
            requests: _.map(batch, function(object) {
              var json = object._getSaveJSON();
              var method = "POST";

              var path = "/1/classes/" + object.className;
              if (object.id) {
                path = path + "/" + object.id;
                method = "PUT";
              }

              object._startSave();

              return {
                method: method,
                path: path,
                body: json
              };
            })

          }).then(function(response, status, xhr) {
            var error;
            Parse._arrayEach(batch, function(object, i) {
              if (response[i].success) {
                object._finishSave(
                  object.parse(response[i].success, status, xhr));
              } else {
                error = error || response[i].error;
                object._cancelSave();
              }
            });
            if (error) {
              return Parse.Promise.error(
                new Parse.Error(error.code, error.error));
            }

          }).then(function(results) {
            batchFinished.resolve(results);
            return results;
          }, function(error) {
            batchFinished.reject(error);
            return Parse.Promise.error(error);
          });
        });
      });
    }).then(function() {
      return object;
    });
  };

/* END PARSE OBJECT */

































/* PARSE USER */

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

console.log('End of Script.');
/* END PARSE USER */