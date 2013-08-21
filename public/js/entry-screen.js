var user = Parse.User.current();
if (user) {
	window.location.href='/main';
} else {
	window.location.href='/authorize';
}
