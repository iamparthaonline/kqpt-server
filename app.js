
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
var users = require('./routes/users');
const io = require('socket.io')();
const redis = require('redis');
const redisClient = redis.createClient();

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
		role: 'KING',
		isTurn: true,
	  },
	  {
		role: 'QUEEN',
		isTurn: false,
	  },
	  {
		role: 'POLICE',
		isTurn: false,
	  },
	  {
		role: 'THIEF',
		isTurn: false
	  },
	],
	other: {
		totalPlayers: 0,
	}
  };

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
app.use('/users', users(express, logger, app.config));

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


// socket Connection details
// io.on('connection', (client) => {
// client.on('subscribeToTimer', (interval) => {
// 		console.log('client is subscribing to timer with interval ', interval);
// 		setInterval(() => {
// 		client.emit('timer', new Date());
// 		}, interval);
// 	});
// });

// when user joins, add him to room
io.sockets.on('connection', function (socket) {
	socket.on('join', function (data) {
		socket.join(data.username);
		console.log(io.sockets.adapter.rooms);
		createGame(data.gameId, data.instanceId, { username: data.username } );
	});
});



const socketPort = 8003;
io.listen(socketPort);
console.log('listening on port ', socketPort);


// redis 

redisClient.on('connect', function() {
    console.log('Redis client connected');
});

redisClient.on('error', function (err) {
    console.log('Redis: Something went wrong ' + err);
});

// getting data from redis

const getCachedData = (key) => {
	redisClient.get(key, function (error, result) {
		if (error) {
			console.log(error);
			return null;
		}
		return JSON.parse(result);
	});
}

//setting data at redis
const setCacheData = (key, data) => {
	redisClient.set(key, JSON.stringify(data) );
}

// create game 
const createGame = ( gameId, instanceId, playerInfo ) => {
	const gameInstance = `${gameId}_${instanceId}`;
	console.log("creategame")
	redisClient.get(gameInstance, function (error, savedGameInstanceData) {
		let gameData;

		if (error || !savedGameInstanceData) {
	console.log("error")

			error && console.log(error);
			const gameInstanceData = Object.assign(GAME_DATA, { gameId, instanceId } );
			gameData = createGameData( gameInstanceData, playerInfo );

			setCacheData(gameInstance, gameData );

		}
		else { 
			const savedGameData = JSON.parse(savedGameInstanceData);
			gameData = createGameData( savedGameData, playerInfo );
			setCacheData(gameInstance, gameData );
		}
		io.to(playerInfo.username).emit('game_created', gameData);

	});

}

const createGameData = ( gameData, playerInfo ) => {
	if(gameData.other.totalPlayers === 4 ){

		return false;
	}
	else{
		// already exists check??
		if( userExists(gameData.players, playerInfo.username) ) {
			return gameData;
		}
		else {
			
		( gameData.other.totalPlayers === 0 ) ? ( gameData.players = gameSuffle(gameData.players) ) : '';
		gameData.players[gameData.other.totalPlayers].userStatus = 'online';
		gameData.players[gameData.other.totalPlayers].username = playerInfo.username;
		gameData.other.totalPlayers += 1;
		return gameData;
		}
	}
}

const userExists = (players, username) => {
	let isUserExist = players.find(player => { return player.username === username } );
	return isUserExist;
}

// suffling game data
const gameSuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // eslint-disable-line no-param-reassign
	}
	return array;
}


module.exports = app;
