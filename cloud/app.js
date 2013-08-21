

var express = require('express');
var http = require('http');
var app = express();
var rack = require('cloud/hat.js').rack();

var gh_client_id = '7a18d87d0b52321c67fb';
var gh_client_secret = 'f88e50dbc479c798e369c6a6a6deba5753681558';
var gh_endpoint1 = 'https://github.com/login/oauth/authorize?';
var gh_endpoint2 = 'https://github.com/login/oauth/access_token';
var gh_user_endpoint = 'https://api.github.com/user?';

var TokenRequest = Parse.Object.extend("TokenRequests");
var TokenStorage = Parse.Object.extend("TokenStorage");

var get_gh_access_token = function(code) {
	var body = 'client_id=' + gh_client_id + '&client_secret=' + gh_client_secret + '&code=' + code;
	return Parse.Cloud.httpRequest({
		method:'POST',
		url:gh_endpoint2,
		headers:{
			'Accept':'application/json'
		},
		body:body
	});
}

var get_gh_user_details = function(access_token) {
	return Parse.Cloud.httpRequest({
		method:'GET',
		url:gh_user_endpoint + 'access_token=' + access_token
	});
}

var upsertGHUser = function(access_token, jsdata) {
	console.log('in upsertGHUser function');
	var promise = new Parse.Promise();
	Parse.Cloud.useMasterKey();
	var query = new Parse.Query(TokenStorage);
	query.equalTo('githubId', jsdata.id);
	query.include('user');
	query.first().then(function (obj) {
		if (obj) {
			console.log('Got existing user.');
			var user = obj.get('user');
			obj.set('access_token', access_token);
			obj.save().then(function (obj) {
				console.log('saved new access_token');
				promise.resolve(user._toFullJSON());
			});
		} else {
			console.log('Did not find existing User');
			newGHUser(access_token, jsdata).then(function (u) {
				promise.resolve(u);
			}, function (e) {
				promise.reject(e);
			});
		}
	});
	return promise;
}

var newGHUser = function(access_token, jsdata) {
	console.log('in newGHUser function');
	var promise = new Parse.Promise();
	var user = new Parse.User();
	var login = rack();
	var pass = rack();
	user.set("username", login);
	user.set("password", pass);
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
					promise.resolve(u._toFullJSON());
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

// Global app configuration section
app.set('views', 'cloud/views');  // Specify the folder to find templates
app.set('view engine', 'ejs');    // Set the template engine
app.use(express.bodyParser());    // Middleware for reading request body

app.get('/', function(req, res) {
  res.render('hello', {});
});

app.get('/authorize', function(req, res) {
	// create a random string for the 'state' request variable to match requests.
	var nonce = rack();
	// save this request in a parse object for matching on callback.
	var token_request = new TokenRequest();
	token_request.set("state", nonce);
	token_request.save().then(function (obj) {
		console.log('Saved token request ' + nonce);
		var ep = gh_endpoint1 + 'client_id=' + gh_client_id + '&state=' + nonce;
		res.redirect(ep);
	}, function (obj, error) {
		console.log('Failed to save token request. ' + nonce);
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
			return get_gh_access_token(data.code);
		}).then(function(access) {
			//console.log(access.text);
			var jsdata = JSON.parse(access.text);
			if (jsdata && jsdata.access_token && jsdata.token_type) {
				token = jsdata.access_token;
				return get_gh_user_details(jsdata.access_token);
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
			res.setHeader('Content-Type','application/json');
			res.end(JSON.stringify(user));
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
