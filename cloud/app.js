// Example web application that uses Login With Github
// 
//

var http = require('http'),
    express = require('express'),
    app = express(),
    hat = require('cloud/hat.js');

// GitHub specific details, including application id and secret
var github_client_id = '7a18d87d0b52321c67fb';
var github_client_secret = 'f88e50dbc479c798e369c6a6a6deba5753681558';
var github_redirect_endpoint = 'https://github.com/login/oauth/authorize?';
var github_validate_endpoint = 'https://github.com/login/oauth/access_token';
var github_user_endpoint = 'https://api.github.com/user?';

// Using these two classes which should use Class level security
// Either create them with the data browser or secure them after testing
// Only the master key should be able to query or write to these classes.
var TokenRequest = Parse.Object.extend("TokenRequests");
var TokenStorage = Parse.Object.extend("TokenStorage");

// This function is called when GitHub redirects the user back after authorization
// It calls back to GitHub to validate and exchange the code for an access token
// It returns a Parse.Promise
var get_github_access_token = function(code) {
	var body = 'client_id=' + github_client_id + '&client_secret=' + github_client_secret + '&code=' + code;
	return Parse.Cloud.httpRequest({
		method:'POST',
		url:github_validate_endpoint,
		headers:{
			'Accept':'application/json'
		},
		body:body
	});
}

// This function calls the github_user_endpoint to get the user details for the provided access token.
// It returns a Parse.Promise
var get_github_user_details = function(access_token) {
	return Parse.Cloud.httpRequest({
		method:'GET',
		url:github_user_endpoint + 'access_token=' + access_token
	});
}

// This function checks to see if this user has logged in with GitHub before.
// If the user is found, it updates the access_token and returns the get_github_user_details promise
// If the user is not found, it returns the newGHUser promise
var upsertGHUser = function(access_token, jsdata) {
	var promise = new Parse.Promise();
	// Master Key is used because the TokenStorage and TokenRequest classes should be restricted
	Parse.Cloud.useMasterKey();
	var query = new Parse.Query(TokenStorage);
	query.equalTo('githubId', jsdata.id);
	query.include('user');
	query.first().then(function (obj) {
		if (obj) {
			var user = obj.get('user');
			obj.set('access_token', access_token);
			user.set('github_data', jsdata);
			user.save();
			obj.save().then(function (obj) {
				promise.resolve(getUserResponse(user));
			});
		} else {
			newGHUser(access_token, jsdata).then(function (u) {
				promise.resolve(u);
			}, function (e) {
				promise.reject(e);
			});
		}
	});
	return promise;
}

// This function creates a Parse User with a random login and password, and associates it with
// an object in the TokenStorage class.  It returns the getUserResponse promise if successful.
var newGHUser = function(access_token, jsdata) {
	var promise = new Parse.Promise();
	var user = new Parse.User();
	// The hat module is used to generate a random username and password
	var login = hat();
	var pass = hat();
	user.set("username", login);
	user.set("password", pass);
	user.set("github_data", jsdata);
	user.signUp(null, {
		success: function (u) {
			console.log('Signup finished');
			console.log(u._toFullJSON());
			console.log(u.get('authData'));
			var ts = new TokenStorage();
			ts.set('githubId', jsdata.id);
			ts.set('githobLogin', jsdata.login);
			ts.set('access_token', access_token);
			ts.set('user', u);
			ts.save(null, {
				success: function(a) {
					console.log('TokenStorage succeeded.');
					promise.resolve(getUserResponse(u));
				},
				error: function(e) {
					console.log('TokenStorage failed.');
					promise.reject(e);
				}
			});
		}, error: function(u, e) {
			console.log('Signup failed.');
			promise.reject(e);
		}
	});
	return promise;
}

var getUserResponse = function(user) {
	var o = {};
	o.userId = user.id;
	o.sessionToken = user._sessionToken;
	return o;
}

// Global app configuration section
app.set('views', 'cloud/views');  // Specify the folder to find templates
app.set('view engine', 'ejs');    // Set the template engine
app.use(express.bodyParser());    // Middleware for reading request body

app.get('/', function(req, res) {
  res.render('hello', {});
});

app.get('/main', function(req, res) {
  res.render('main', {});
});

app.get('/authorize', function(req, res) {
	// create a random string for the 'state' request variable to match requests.
	var state = hat();
	// save this request in a parse object for matching on callback.
	var token_request = new TokenRequest();
	token_request.set("state", state);
	token_request.save().then(function (obj) {
		// Redirect the browser to GitHub for authorization.
		res.redirect(github_redirect_endpoint + 'client_id=' + github_client_id + '&state=' + state);
	}, function (obj, error) {
		// error route not implemented in this example.
		res.redirect('/error');
	});
});

app.get('/oauthCallback', function(req, res) {

	var data = req.query;
	var token;
	if (data && data.code && data.state) {
		var query = new Parse.Query(TokenRequest);
		query.equalTo("state", data.state);
		query.first().then(function (obj) {
			if (!obj) return res.redirect('/');
			return obj.destroy();
		}).then(function() {
			return get_github_access_token(data.code);
		}).then(function(access) {
			//console.log(access.text);
			var jsdata = JSON.parse(access.text);
			if (jsdata && jsdata.access_token && jsdata.token_type) {
				token = jsdata.access_token;
				return get_github_user_details(jsdata.access_token);
			} else {
				return Parse.Promise.reject("Invalid access.");
			}
		}).then(function(user_data) {
			//console.log(user_data.text);
			var udata = JSON.parse(user_data.text);
			if (udata && udata.login && udata.id) {
				return upsertGHUser(token, udata);
			} else {
				console.log('Failed to parse GH data.');
				res.redirect('/');				
			}
		}).then(function (user) {
			console.log(user);
			res.render('store_auth', user);
		}, function (err) {
			console.log(err);
			res.redirect('/');
		});
	} else {
		res.redirect('/');
	}

});


// Attach the Express app to Cloud Code.
app.listen();
