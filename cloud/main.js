/** Login With Github
 * An example web application implementing OAuth in Cloud Code
 * 
 * There will be four routes:
 * / - The main route will show a page with a Login with Github button
 *       Javascript will detect if it's logged in and navigate to /main
 * /authorize - This url will start the OAuth process and redirect to Github
 * /oauthCallback - Sent back from Github, this will validate 
 * /main - The application displays some of the users Github data
 * /
 * @author Fosco Marotto (Facebook) <fjm@fb.com>
 */

// Load the http and express modules.
var http = require('http'),
    express = require('express');

// Create an express application instance
var app = express();

// GitHub specific details, including application id and secret
var github_client_id = '7a18d87d0b52321c67fb';
var github_client_secret = 'f88e50dbc479c798e369c6a6a6deba5753681558';

var github_redirect_endpoint = 'https://github.com/login/oauth/authorize?';
var github_validate_endpoint = 'https://github.com/login/oauth/access_token';
var github_user_endpoint = 'https://api.github.com/user?';

// Set the Class Permissions for these 2 classes to disallow public access
//   for Get/Find/Create/Update/Delete operations.
// Only the master key should be able to query or write to these classes.
var TokenRequest = Parse.Object.extend("TokenRequests");
var TokenStorage = Parse.Object.extend("TokenStorage");

// Global app configuration section
app.set('views', 'cloud/views');  // Specify the folder to find templates
app.set('view engine', 'ejs');    // Set the template engine
app.use(express.bodyParser());    // Middleware for reading request body

// Main route.  When called, render the hello.ejs view
app.get('/', function(req, res) {
  res.render('hello', {});
});

// Login with Github route.  When called, will generate a token and redirect 
//   the browser to Github.
app.get('/authorize', function(req, res) {

	// Save this request in a Parse Object for validation when Github responds
	// Use the master key because this class is protected
	Parse.Cloud.useMasterKey();
	var token_request = new TokenRequest();
	// Secure the object against public access.
	var acl = new Parse.ACL();
	acl.setPublicReadAccess(false);
	acl.setPublicWriteAccess(false);
	token_request.setACL(acl);
	token_request.save().then(function (obj) {
		// Redirect the browser to Github for authorization.
		// This uses the objectId of the new TokenRequest as the 'state'
		//   variable in the Github redirect.
		res.redirect(github_redirect_endpoint 
			+ 'client_id=' + github_client_id 
			+ '&state=' + obj.id);
	}, function (obj, error) {
		// error route not implemented in this example.  redirect to /
		res.redirect('/');
	});
});

// Authorization route.  This is intended to be accessed via redirect from
//   Github.  The request will be validated against a previously stored
//   TokenRequest and against another Github endpoint, and if valid, a User 
//   will be created and/or updated with details from Github.  A page will be
//   rendered which will 'become' the user on the client-side and redirect to
//   the /main page.
app.get('/oauthCallback', function(req, res) {

	var data = req.query;
	var token;
	// Validate that code and state have been passed in as query parameters.
	if (data && data.code && data.state) {
		// Use the master key because this class is protected.
		Parse.Cloud.useMasterKey();
		var query = new Parse.Query(TokenRequest);
		// Check if the provided state object exists as a TokenRequest
		query.get(data.state).then(function (obj) {
			// Destroy the TokenRequest before continuing.
			return obj.destroy();
		}).then(function() {
			// Validate the code parameter with Github and return the response.
			return get_github_access_token(data.code);
		}).then(function(access) {
			// Process the response from Github and validate it, returning
			//   either the users Github details or rejecting the promise.
			var jsdata = JSON.parse(access.text);
			if (jsdata && jsdata.access_token && jsdata.token_type) {
				token = jsdata.access_token;
				return get_github_user_details(jsdata.access_token);
			} else {
				return Parse.Promise.reject("Invalid access.");
			}
		}).then(function(user_data) {
			// Process the users Github details, returning either the
			//   upsertGHUser promise, or rejecting the promise.
			var udata = JSON.parse(user_data.text);
			if (udata && udata.login && udata.id) {
				return upsertGHUser(token, udata);
			} else {
				return Parse.Promise.reject("Unable to parse Github data");
			}
		}).then(function (user) {
			// Render a page which sets the current user on the client-side.
			res.render('store_auth', user);
		}, function (err) {
			// Redirect back to the main page, or add an error page.
			res.redirect('/');
		});
	} else {
		res.redirect('/');
	}

});

// Logged in route.  Validate login and display logged in users
//   Github details.
app.get('/main', function(req, res) {
  res.render('main', {});
});

// Attach the express app to Cloud Code to process the inbound request.
app.listen();

/*
Functions used by the above routes.
*/

// This function is called when GitHub redirects the user back after 
//   authorization.  It calls back to GitHub to validate and exchange the code 
//   for an access token.
// It returns a Parse.Promise
var get_github_access_token = function(code) {
  var body = 'client_id=' + github_client_id 
  	+ '&client_secret=' + github_client_secret 
    + '&code=' + code;
  return Parse.Cloud.httpRequest({
    method:'POST',
    url:github_validate_endpoint,
    headers:{
      'Accept':'application/json',
      'User-Agent':'Parse.com Cloud Code'
    },
    body:body
  });
}

// This function calls the github_user_endpoint to get the user details for 
//   the provided access token.
// It returns a Parse.Promise
var get_github_user_details = function(access_token) {
  return Parse.Cloud.httpRequest({
    method:'GET',
    url:github_user_endpoint + 'access_token=' + access_token,
    headers:{
    	'User-Agent':'Parse.com Cloud Code'
    }
  });
}

// This function checks to see if this user has logged in with GitHub before.
// If the user is found, it updates the access_token and returns the 
//   get_github_user_details promise.
// If the user is not found, it returns the newGHUser promise
var upsertGHUser = function(access_token, jsdata) {
  var promise = new Parse.Promise();
  // Master Key is used because the TokenStorage objects should be protected
  Parse.Cloud.useMasterKey();
  var query = new Parse.Query(TokenStorage);
  query.equalTo('githubId', jsdata.id);
  // Check if this githubId has previously logged in
  query.first().then(function (obj) {
	if (!obj) {
	  	// If not, create a new user and return the user response.
	    return newGHUser(access_token, jsdata).then(function (u) {
        	promise.resolve(u);
	    }, function (e) {
	        promise.reject(e);
	    });
	} else {
	  	// If so, fetch the user and return it.
	    var user = obj.get('user');
	    user.fetch().then(function (user) {
	  	  // Update the access_token and github_data and save the object, resolving
	  	  //   the promise with the response data for the user.
		  obj.set('access_token', access_token);
		  user.set('github_data', jsdata);
		  return obj.save().then(function (obj) {
		    promise.resolve(getUserResponse(user));
		  }, function (error) { 
		    promise.reject(error);
		  });
	    });
	}
  });
  return promise;
}

// This function creates a Parse User with a random login and password, and 
//   associates it with an object in the TokenStorage class.  
// It returns the getUserResponse promise if successful.
var newGHUser = function(access_token, jsdata) {
  console.log('making new user');
  var promise = new Parse.Promise();
  var user = new Parse.User();
  // implement a different strategy for username creation, this is just for
  //   simplicity and reduction of 3rd-party code.
  var login = access_token.substring(0,8);
  var pass = access_token.substring(8,16);
  user.set("username", login);
  user.set("password", pass);
  user.set("github_data", jsdata);
  // Protect the User object from public access.
  var acl = new Parse.ACL();
  acl.setPublicReadAccess(false);
  acl.setPublicWriteAccess(false);
  user.setACL(acl);
  // Sign up the new User
  user.signUp().then(function (user) {
  	// create a new TokenStorage object to store the user+github association.
  	// Use the master key because TokenStorage objects should be protected.
  	Parse.Cloud.useMasterKey();
    var ts = new TokenStorage();
    ts.set('githubId', jsdata.id);
    ts.set('githobLogin', jsdata.login);
    ts.set('access_token', access_token);
    ts.set('user', user);
    return ts.save()
  }).then(function(a) {
  	// Resolve the promise the response data for the user.
    promise.resolve(getUserResponse(user));
  },
  function(e) {
    promise.reject(e);
  });
  return promise;
}

// Response data to be used for rendering in view template store_auth.ejs
var getUserResponse = function(user) {
  var o = {};
  o.sessionToken = user._sessionToken;
  return o;
}





