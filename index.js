var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var session = require('express-session');

//const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
var rooms = {};

function generateRoomCode() {
	return (
		'hm' +
		Math.random()
			.toString(36)
			.substring(2, 15)
	);
}
class Room {
    constructor(host_id, host_name) {
        this.players = {};
        this.players[host_id] = host_name;
        this.code = generateRoomCode();
        this.game = null;
    }
}

class Game {
    constructor(word,gameStarter) {
        this.host = gameStarter; //eventually should use this to prevent host from being able to guess
        this.word = word; //the solution phrase
        this.log = [gameStarter+' has started the game!']; //game log history
        this.wrong_letters = [];
        this.available_letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
        this.current_progress = this.word.replace(/[A-Z]/g, '~');
        this.isOver = false;
        this.limit = 7; //how many guesses are game over. eventually chooseable by host
    }
    guessLetter(guess, guesser) {
        //log the guess
        this.log.push(guesser + ' guessed the letter ' + guess);
        //remove it from list of available letters
        this.available_letters.splice(this.available_letters.indexOf(guess),1);
        //reveal letters, updating current progress
        let isRight = false;
        for(var i=0; i < this.word.length; i++) {
            if (this.word[i] == guess) {
                let newGhost = this.current_progress.split("");
                newGhost[i] = guess;
                this.current_progress = newGhost.join("");
                isRight = true;
            }
        }
        if(!isRight) {
            this.wrong_letters.push(guess);
        }
        if(this.wrong_letters.length == this.limit) {
            this.isOver = true;
            this.log.push('Game over. The answer was ' + this.word);
        }
        else if(!this.current_progress.includes('~')) {
            this.isOver = true;
            this.log.push('Solved! Game over.');
        }
    }
    status() {
        //return an array with:
        //whether the game is over
        //game log
        //incorrectly guessed letters
        //string with current progress
        //letters remaining to guess
        return [this.isOver, this.log, this.wrong_letters, this.current_progress, this.available_letters];
    }
}

function sanitizeString(str){
    str = str.replace(/[^a-zA-Z\s]/g, '');
    return str.trim();
}

const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

app.use('/styles',express.static(__dirname + '/styles')); //provide client with (static) stylesheets
app.use('/images',express.static(__dirname + '/images')); //provide client with (static) images

sessionDef = session({
	secret: 'secret-key',
	saveUninitialized: true,
	resave: true,
});

//initialize express session
app.use(sessionDef);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/hm*', (req, res) => {
    //note: in this context, req.session refers to same object as socket.request.session in socket context. unsure if by value or reference
    //let them into the game if room exists & they have been added via homepage already
    let destination = rooms[req.path.substr(1)]
    if (destination) {
        if (destination.players[req.session.id]) {
            req.session.roomToJoin = req.path.substr(1);
            console.log('user accessing game page.');
            res.sendFile(__dirname + '/play.html');
        }
        else {
            res.sendFile(__dirname + '/index.html');
        }
    }
    else {
        res.sendFile(__dirname + '/index.html');
    }
});

var indexsocket = io.of('/home'); //clientside: socket = io('/home');
var gamesocket = io.of('/game'); //this namespace is for all game rooms. each will have its own socket room and role rooms.

io.use(function(socket, next) {
	sessionDef(socket.request, socket.request.res || {}, next);
});

indexsocket.on('connection', (socket) => {
    console.log('new user has reached homepage with player id ' + socket.id);

    socket.on('join game', (info) => {
        //info = [name, roomcode]
        //check if roomcode valid
        if (!rooms[info[1]]) {
            console.log('join error');
            socket.emit('join error', 'Sorry, that room code is invalid');
        }
        else {
            rooms[info[1]].players[socket.request.session.id] = info[0]; //set player name by express session id
            socket.emit('go to room', info[1]); //tell client to go to game page
        }
    });

    socket.on('create game', (name) => {
        let userid = socket.request.session.id;
        let new_room = new Room(userid, name);
        rooms[new_room.code] = new_room;
        socket.emit('go to room', new_room.code);
    });
});

gamesocket.on('connection', (socket) => {
    //note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
	//check if the room still exists
    if (rooms[socket.request.session.roomToJoin]) { //if the room exists...
        let active_room = rooms[socket.request.session.roomToJoin];
        gamesocket.emit('playerListUpdate', Object.values(active_room.players)); //give them current lobby details
        if (active_room.game != null) {
            gamesocket.emit('game status update', active_room.game.status()); //render the game on clientside if a game is ongoing
        }
        console.log('new user has reached a gamepage');

        socket.on('wordSubmission', (word) => {
            submitted_word = sanitizeString(word.trim()).toUpperCase();
            socket.emit('cleansedWord', submitted_word)
        });

        socket.on('startGame', (gameword) => {
            console.log('starting game');
            play_word = sanitizeString(gameword.trim()).toUpperCase();
            active_room.game = new Game(play_word, active_room.players[socket.request.session.id]);
            // gamesocket.emit('game page setup');
            gamesocket.emit('game status update', active_room.game.status());
        });

        socket.on('letter guess', (letter) => {
            if (!active_room.game.isOver) { //ensure game isn't over
                if (active_room.game.available_letters.includes(letter)) { //ensure valid input
                    active_room.game.guessLetter(letter, active_room.players[socket.request.session.id]);
                    gamesocket.emit('game status update', active_room.game.status());
                }
            }
        });

        socket.on('new game', function() {
            active_room.game = null;
            gamesocket.emit('reload page');
        });

        socket.on('disconnect', () => {
            // what to do upon new user disappearing

            // gamesocket.emit('playerListUpdate', Object.values(socket.request.session.roomToJoin.players));
            console.log('user ' + socket.request.session.id + ' disconnected');
        });		
    }

});

http.listen(port, () => {
  console.log('listening on *:'+port);
});