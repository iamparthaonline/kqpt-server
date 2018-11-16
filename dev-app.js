
/*jslint node: true, nomen: true*/
"use strict";

var express = require('express');
var cors = require('cors')
var app = express(cors());
var http = require('http');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var clone = require('./utilities/clone');
const io = require('socket.io')(http);
var LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./storage');

const getCachedData = (key, callback) => {
	const data = localStorage && localStorage.getItem( key );
	callback( !data, JSON.parse( data ) );
}

const setCacheData = (key, data) => {
	localStorage && localStorage.setItem( key, JSON.stringify( data ) );
}





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
	console.log("Socket hit!")
	socket.on( SOCKET_LIST.JOIN_GAME, function (data) {
		socket.join(data.username);
		createGame(data.gameId, data.instanceId, { username: data.username } );
	});

	socket.on( SOCKET_LIST.GAME_MOVE, function (data) {
		gameMovePlayed( data );
	});
});





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

const APP_PORT = (process.env.PORT || 3000);
http.createServer(function(req,res){
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if ( req.method === 'OPTIONS' ) {
		res.writeHead(200);
		res.end();
		return;
	}
}).listen( APP_PORT, function(){
	console.log('KQPT server is listening on '+ APP_PORT);
});

// http.createServer((req, res) => {
// 	const headers = {
// 	  'Access-Control-Allow-Origin': '*',
// 	  'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
// 	  'Access-Control-Max-Age': 2592000, // 30 days
// 	  /** add other headers as per requirement */
// 	};
  
// 	if (req.method === 'OPTIONS') {
// 	  res.writeHead(204, headers);
// 	  res.end();
// 	  return;
// 	}
  
// 	if (['GET', 'POST'].indexOf(req.method) > -1) {
// 	  res.writeHead(200, headers);
// 	  res.end('Hello World');
// 	  return;
// 	}
  
// 	res.writeHead(405, headers);
// 	res.end(`${req.method} is not allowed for the request.`);

//   }).listen(APP_PORT);
