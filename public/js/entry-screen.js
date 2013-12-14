var user = Parse.User.current();
if (user && user.get('github_data')) {
	window.location.href='/main';
}