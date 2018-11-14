/*jslint node: true, nomen: true*/
"use strict";

const MongoClient = require('mongodb').MongoClient;
const url = 'ds257851.mlab.com:57851/kqpt_dev';
const mongoCredintials = {
  user: 'dev',
  password: 'password1'
};
const mongoUrl = 'mongodb://'+mongoCredintials.user+':'+mongoCredintials.password+'@'+url;

MongoClient.connect(mongoUrl, function(err, db) {
	db.collection("game_data").find({game: userObject.game}).toArray(function(err, result) {
		if (err) throw err;
		db.close();
	});
})

module.exports = function (logger, config) {
	var funcs = {};
	
	funcs.getGameDetails = function (gameId, instanceId, callback) {
		
	};

	funcs.saveGameDetailsToDB = function (gameId, Data) {
		console.log(gameId)
	};
	
	return funcs;
};