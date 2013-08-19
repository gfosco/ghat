
var http = require('http'),
    fs = require('fs'),
    router = require('cloud/choreographer.js').router(),
    _ = require('underscore')._,
    mp_po = require('cloud/parse_object.js').monkeyPatch(this),
    mp_pu = require('cloud/parse_user.js').monkeyPatch(this),
    mp_pg = require('cloud/parse_github.js').monkeyPatch(this);

router.get('/checkAuthorization', function c(request, response) {

	console.log(mp_po);
	console.log(mp_pu);

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







console.log(typeof Parse.GithubUtils);