
/*jslint node: true, nomen: true*/
"use strict";

var express = require('express');
var path = require('path');
var morgan = require('morgan');
var winston = require('winston');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var routes = require('./routes/index');
var game = require('./routes/game');
var clone = require('./utilities/clone');
const io = require('socket.io')();
// const redis = require('redis');
// const redisClient = redis.createClient();
var LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./storage');


const getCachedData = (key, callback) => {
	const data = localStorage && localStorage.getItem( key );
	callback( !data, JSON.parse( data ) );
}

const setCacheData = (key, data) => {
	localStorage && localStorage.setItem( key, JSON.stringify( data ) );
}



// const MongoClient = require('mongodb').MongoClient;
// const url = 'ds263493.mlab.com:63493/kqpt';
// const mongoCredintials = {
//   user: 'game',
//   password: 'game00'
// };
// const mongoUrl = 'mongodb://'+mongoCredintials.user+':'+mongoCredintials.password+'@'+url;

// MongoClient.connect(mongoUrl, function(err, db) {
// 	if(err){
// 		console.log(err)
// 	}
// 	else {
// 		console.log('mongo Connected')
// 		const collection = db.collection('game');
// 		console.log(db.serverConfig)
// 		db.collection("game").insertOne({"hello": 1234}, function(err, res) {
// 			if (err) throw err;
// 			console.log("1 document inserted");
// 		});

// 		collection.find({}).toArray(function(err, docs) {
// 			console.log(err)
// 			console.log("Found the following records");
// 			console.log(docs);
// 		});
// 	}
// 	// db.collection("game_data").replaceOne( {"game": 111 }, {game: 112}, {upsert: true});
// });

// "redis://redis-18288.c90.us-east-1-3.ec2.cloud.redislabs.com:18288"
// redisClient.auth('PEtE2qRpXvH8AzrXQV6vITuoqjiRgisN', function (err) {
//     if (err) throw err;
// })

// const redisObj = {
// 					"redisHost": "redis-18288.c90.us-east-1-3.ec2.cloud.redislabs.com",
// 					"redisPort": 18288,
// 					"redisKey": "PEtE2qRpXvH8AzrXQV6vITuoqjiRgisN"
// 				};
// const redisClient = redis.createClient({ url: `redis://:${redisObj.redisKey}@${redisObj.redisHost}:${redisObj.redisPort}` }).on('error', (err) => console.error('ERR:REDIS:', err));
					  

// redisClient.on('connect', function () {
//     console.log(`redis connected ${redisClient.connected}`);
// }).on('error', function (error) {
//     console.log(error);
// });

// redisClient.on('error', function (err) {
//     console.log('Redis: Something went wrong ' + err);
// });


var app = express();

// view engine setup (not included)


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(cookieParser());

const GAME_DATA = {
	players: [
	  {
		role: "KING",
		isTurn: true,
		isRevealed: true
	  },
	  {
		role: "QUEEN",
		isTurn: false,
		isRevealed: false
	  },
	  {
		role: "POLICE",
		isTurn: false,
		isRevealed: false
	  },
	  {
		role: "THIEF",
		isTurn: false,
		isRevealed: false
	  },
	],
	other: {
		totalPlayers: 0,
	}
  };

  const ROLE_MAP = {
	"KING": {
		"CORRECT_CHOICE_SCORE": 1000,
		"CHOICE": "QUEEN",
		"WRONG_CHOICE_SCORE": 500
	},
	"QUEEN": {
		"CORRECT_CHOICE_SCORE": 750,
		"CHOICE": "POLICE",
		"WRONG_CHOICE_SCORE": 375
	},
	"POLICE": {
		"CORRECT_CHOICE_SCORE": 500,
		"CHOICE": "THIEF",
		"WRONG_CHOICE_SCORE": 250
	}
  };

  const SOCKET_LIST = {
	  "JOIN_GAME": "JOIN_GAME",
	  "GAME_UPDATE": "GAME_UPDATE",
	  "GAME_MOVE": "GAME_MOVE"
  }

// Set the ENV variable to point to the right environment

switch (process.env.NODE_ENV) {
case 'development':
	app.set('env', 'development');
	break;
case 'production':
	app.set('env', 'production');
	break;
case 'test':
	app.set('env', 'test');
	break;
default:
	console.error("NODE_ENV environment variable should have value 'development', 'test', or 'production' \nExiting");
	process.exit();
}

//load the config variables depending on the environment

var config_file_name = app.get('env') + '_config.json';
var data = fs.readFileSync(path.join(__dirname, 'config', config_file_name));
var myObj;
var configObject, property;
try {
	configObject = JSON.parse(data);
} catch (err) {
	console.log('There has been an error parsing the config file JSON.');
	console.log(err);
	process.exit();
}
app.config = {};
for (property in configObject) {
	if (configObject.hasOwnProperty(property)) {
		app.config[property] = configObject[property];
	}
}


var logLevel = process.env.LOGGING_LEVEL;
if (!(logLevel === 'info' || logLevel === 'warn' || logLevel === 'error' || logLevel === 'debug')) {
	console.warn('LOGGING_LEVEL environment variable not set to a valid logging level. Using default level info');
	logLevel = 'info';
}

try {
    fs.accessSync(app.config.LOGGING_DIRECTORY, fs.F_OK);
} catch (e) {
    console.error('Could not access LOGGING_DIRECTORY that is set in config.\nExiting');
	process.exit();
}

//logging using winston

var winstonTransports = [
    new winston.transports.File({
		name: 'fileLog',
		level: logLevel,
		filename: path.join(app.config.LOGGING_DIRECTORY, app.config.LOG_FILE_NAME_PREFIX + '.log'),
		handleExceptions: true,
		json: false,
		maxsize: 5242880, //5MB
		maxFiles: 5,
		colorize: false,
		timestamp: true
	})
];

if (logLevel === 'debug') {
	winstonTransports.push(new winston.transports.Console({
		level: 'debug',
		json: false,
		handleExceptions: true,
		colorize: true,
		timestamp: true
	}));
}

var logger = new winston.Logger({
	transports: winstonTransports,
	exitOnError: false
});

logger.level = logLevel;

logger.stream = {
	write: function (message, encoding) {
		logger.info(message);
	}
};

app.logger = logger;

app.use(require("morgan")('short', {
	"stream": logger.stream
}));

app.use('/', routes);
app.use('/game', game(express, logger, app.config));


// catch 404 and forward to error handler
app.use(function (req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

const port = 8003;
io.listen(port);
console.log('listening on port ', port);

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use(function (err, req, res, next) {
		res.status(err.status || 500);
		res.json({
			message: err.message,
			error: err
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
	res.status(err.status || 500);
	res.json({
		message: err.message,
		error: {}
	});
});


// when user joins, add him to room
io.sockets.on('connection', function (socket) {
	socket.on( SOCKET_LIST.JOIN_GAME, function (data) {
		socket.join(data.username);
		createGame(data.gameId, data.instanceId, { username: data.username } );
	});

	socket.on( SOCKET_LIST.GAME_MOVE, function (data) {
		gameMovePlayed( data );
	});
});



const socketPort = 8003;
io.listen(socketPort);
console.log('listening on port ', socketPort);




// create game 
const createGame = ( gameId, instanceId, playerInfo ) => {

	const gameKey = `GAME_${gameId}`;
	getCachedData(gameKey, function (error, savedGameInstanceData) {
		let gameData;
		if (error || !savedGameInstanceData ) {
			console.log("error");

			error && console.log(error);
			const gameInstanceData = Object.assign( { gameId, instanceId }, GAME_DATA );
			gameData = createGameData( gameInstanceData, playerInfo );

			setCacheData(gameKey, { instances: [ gameData ] } );
			// saveGameDetailsToDB(gameKey, { instances: [ gameData ] } );

			// || !savedGameInstanceData.instances[ instanceId ]
		}
		else { 
			console.log("present");

			const savedGameData = savedGameInstanceData;
			gameData = createGameData( savedGameData.instances[ savedGameData.instances.length - 1 ], playerInfo );
			savedGameData.instances[ savedGameData.instances.length - 1 ] = gameData;
			setCacheData(gameKey, savedGameData );
			// saveGameDetailsToDB(gameKey, savedGameData );

		}
			// saveGameDetailsToDB(gameKey, savedGameData );
		
		publishGameData(gameData);
	});

}

const createGameData = ( gameData, playerInfo ) => {
	const totalPlayers = gameData.other.totalPlayers;
	const userAlreadyExists = userExists(gameData.players, playerInfo.username);
	if(totalPlayers === 4 && !userAlreadyExists){

		return false;
	}
	else{
		// already exists check
		if( userAlreadyExists ) {
			return gameData;
		}
		else {
			
			( totalPlayers === 0 ) ? ( gameData.players = gameShuffle(gameData.players) ) : '';
			gameData.players[totalPlayers].userStatus = 'online';
			gameData.players[totalPlayers].username = playerInfo.username;
			if ( gameData.players[totalPlayers].isTurn ) {
				gameData.other.activeUser = playerInfo.username;
				gameData.other.status = {
					message: `${ playerInfo.username } is playing ! `,
					type: 'game',
				}
			}
			gameData.other.totalPlayers += 1;
			return gameData;
		}
	}
}

const userExists = ( players, username ) => {
	let isUserExist = players.find(player => { return player.username === username } );
	return isUserExist;
}

// shuffling game data
const gameShuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
	}
	return array;
};

const publishGameData = ( gameData ) => {

	const gameDataObject = Object.assign( {}, gameData );
	for( let i = 0; i < gameDataObject.players.length; i++ ) {
		const player = gameDataObject.players[i];
		if( player.username ) {

			const data = createPlayerSpecificPublishData( clone(gameDataObject), player.username );
			io.to( player.username ).emit( SOCKET_LIST.GAME_UPDATE, data );
		}
	}
};

const createPlayerSpecificPublishData = ( gameData, playerId ) => {
	for( let j = 0; j < gameData.players.length; j++ ) {
		let playerData = gameData.players[j];

		if( !( playerData.username === playerId || playerData.isRevealed ) || !playerData.username ){
			gameData.players[j].role = undefined;
		}
		if( playerData.username === playerId ){
			gameData.other.isMove = playerData.isTurn;  
		}
	}

	return gameData;
};

// game move played
const gameMovePlayed = ( data ) => {

	const gameKey = `GAME_${data.gameId}`;

	getCachedData(gameKey, function (error, savedGameInstanceData) {
		//check whether he belongs to same game 
		// change the instances data and save 
		if( error ) {
			console.log(error);
		}
		else {

			const savedGameData = savedGameInstanceData.instances[ savedGameInstanceData.instances.length - 1 ];
			const result = checkTurnResult( data.chosenPlayer, data.username, savedGameData.players );
			const updatedGameData = setMoveData( savedGameData, data.username, result.activeRole, data.chosenPlayer, result.targetRole, result );

			savedGameInstanceData.instances[ savedGameInstanceData.instances.length - 1 ] = updatedGameData;
		
			setCacheData(gameKey, savedGameInstanceData );
			// saveGameDetailsToDB(gameKey, savedGameData );
			
			publishGameData( updatedGameData );
		}
	});
};


/**
 * Checking wheather it is correct or not 
 * @param {String} chosenPlayer 
 * @param {String} username 
 * @param {String} players 
 */
const checkTurnResult = ( chosenPlayer, username, players ) => {
	let activePlayer, targetPlayer;
	for( let i = 0; i < players.length; i++ ) {
		if( players[i].username === username ) {
			activePlayer = players[i];
		}
		if( players[i].username === chosenPlayer ) {
			targetPlayer = players[i];
		}
	}
	
	if ( ROLE_MAP[activePlayer.role].CHOICE === targetPlayer.role ) {
		return {
			result: true,
			activeRole: activePlayer.role,
			targetRole: targetPlayer.role,
			score: ROLE_MAP[activePlayer.role].CORRECT_CHOICE_SCORE
		}
	}
	else {
		return {
			result: false,
			activeRole: activePlayer.role,
			targetRole: targetPlayer.role,
			score: ROLE_MAP[activePlayer.role].WRONG_CHOICE_SCORE
		}
	}
};
/**
 * Update the gamedata after an user has given his move.
 * @param {Object} gameData 
 * @param {String} activePlayer 
 * @param {String} targetPlayer 
 * @param {Object} turnResult 
 */
const setMoveData = ( gameData, activePlayer, activeRole, targetPlayer, targetRole, turnResult ) => {
let updatedPlayers = [];
updatedPlayers = gameData.players.map( ( player, index ) => {
		if( player.username === activePlayer ){
			player.isRevealed = turnResult.result;
			player.isTurn = false;
			if ( !turnResult.result ) 
				( player.role = targetRole );
			return player;
		}
		else if( player.username === targetPlayer ){
			player.isTurn = true;
			player.isRevealed = true;
			if ( !turnResult.result ) 
				( player.role = activeRole );
			return player;
		}
		else {
			return player;
		}
	});
	const gameMoveData = {
		players: updatedPlayers,
		gameId: gameData.gameId,
		instanceId: gameData.instanceId,
		other: {
			status: {
				message: `${ targetPlayer } is playing ! `,
				type: 'game',
			},
			activeUser: targetPlayer,
			totalPlayers: gameData.other.totalPlayers
		}

	};
	console.log(gameMoveData)
	return gameMoveData;
}


module.exports = app;
