
var app = require('cloud/app.js'),
    fs = require('fs'),
    router = require('cloud/choreographer.js').router(),
    _ = require('underscore')._,
    rack = require('cloud/hat.js').rack();


function notLoggedIn(response) {
	header(response, 200, 'text/plain');
	response.end('NOT LOGGED IN');
}

