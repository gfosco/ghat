
var app = require('cloud/app.js'),
    fs = require('fs'),
    _ = require('underscore')._;

function notLoggedIn(response) {
	header(response, 200, 'text/plain');
	response.end('NOT LOGGED IN');
}

