qs = require 'querystring'
https = require 'https'

class GitHub
	constructor: (@app_id, @app_secret) ->

	link: ->
		"https://github.com/login/oauth/authorize?client_id=" + @app_id

	login: (code, callback) ->
		obj =
			client_id: @app_id,
			client_secret: @app_secret,
			code: code

		params = qs.stringify obj

		opts =
			host: "github.com"
			path: "/login/oauth/access_token"
			method: 'POST'
			headers:
				"Content-Length": params.length

		req = https.request opts, (res) ->
			str = ''
			res.setEncoding 'utf8'
			res.on 'data', (chunk) ->
				str += chunk

			res.on 'end', ->
				access = qs.parse str
				token = access.access_token
				callback token

		req.write params
		req.end()

		req.on 'error', (e) ->
			console.error e

	get_user: (token, callback) ->

		opts =
			host: "api.github.com"
			path: "/user?access_token=" + token
			method: 'GET'

		req = https.request opts, (res) ->
			user = ''
			res.setEncoding 'utf8'
			res.on 'data', (chunk) ->
				user += chunk

			res.on 'end', ->
				callback JSON.parse user

		req.end()

		req.on 'error', (e) ->
			console.error e

module.exports = GitHub