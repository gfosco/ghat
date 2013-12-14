var user = Parse.User.current();
if (!user || !user.get('github_data')) {
	window.location.href='/';
} else {
	var obj = user.get('github_data');
	var out = '<ul class="list">' + 
		'<li class="list-divider">GITHUB USER DETAILS</li>' + 
		'<li class="list-item-two-lines"><h3>Name</h3><p>' + obj.name + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Login</h3><p>' + obj.login + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Location</h3><p>' + obj.location + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Blog</h3><p>' + obj.blog + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Company</h3><p>' + obj.company + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Followers</h3><p>' + obj.followers + '</p></li>' +
		'<li class="list-item-two-lines"><h3>Following</h3><p>' + obj.following + '</p></li>' +
		'</ul>';
	$('#gh_det').append(out);
}