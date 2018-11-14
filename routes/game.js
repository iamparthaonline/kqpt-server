/*jslint node: true, nomen: true*/
"use strict";

module.exports = function (express, logger, config) {
	
	var path = require('path'),
	    router = express.Router(),
	    gameController = require(path.join('..', 'controllers', 'game'))(logger, config);

	/* GET users listing. */
	router.get('/details/:gameId', function (req, res) {
		gameController.getGameDetails(req.query.gameId, function (err, gameDetails) {
			if (err) {
				res.status(err.status).json({
					message: err.message
				});
			} else {
				res.status(200).json(gameDetails);
			}

		});
	});
	
	return router;
};