var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var session = require('express-session');

const port = process.env.PORT || 69;

//const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
var rooms = {};

function generateRoomCode() {
    let code = Math.random().toString(36).substr(2, 4).toLowerCase();
    while (Object.keys(rooms).includes(code)) {
        code = Math.random().toString(36).substr(2, 4).toLowerCase();
    }
	return code;
}

class Room {
    constructor(host_id, host_name, code=null) {
        this.players = {};
        this.players[host_id] = host_name;
        this.players_here = {};
        code == null ? this.code = generateRoomCode() : this.code = code;
        this.game = null;
        console.log('room created: ' + this.code)
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
        //see if it's the host giving a hint
        if (guesser == this.host) {
            if (this.word.includes(guess)) {
                //log the hint
                this.log.push(guesser + ' gave a hint: ' + guess);
            }
            else {
                //host is attempting to sabotage. disallow
                return null
            }
        }
        else {
            //log the guess
            this.log.push(guesser + ' guessed the letter ' + guess);
        }

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

function sanitizeRoomCode(str){
    str = str.replace(/[^a-zA-Z0-9-\s]/g, '');
    return str.trim().replace(/[\s]/g,'-').toLowerCase();
}

app.use('/styles',express.static(__dirname + '/styles')); //provide client with (static) stylesheets
app.use('/images',express.static(__dirname + '/images')); //provide client with (static) images

sessionDef = session({
	secret: 'sOOPER SECRET !',
	saveUninitialized: true,
	resave: true,
});

//initialize express session
app.use(sessionDef);

app.get('/', (req, res) => {
    req.session.intendedDestination = null;
    res.sendFile(__dirname + '/index.html');
});

app.get('/*', (req, res) => {
    //note: in this context, req.session refers to same object as socket.request.session in socket context. unsure if by value or reference
    //let them into the game if room exists & they have been added via homepage already
    let destination = rooms[req.path.substr(1)];
    req.session.intendedDestination = null;
    if (destination) {
        if (destination.players[req.session.id]) {
            req.session.roomToJoin = req.path.substr(1);
            console.log('user accessing game page: ' + req.path);
            res.sendFile(__dirname + '/play.html');
        }
        else {
            req.session.intendedDestination = req.path.substr(1);
            console.log('user attempted to access active game ' + req.path + ' by link; redirecting to homepage')
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

    if (socket.request.session.intendedDestination) {
        socket.emit('fill placeholder', socket.request.session.intendedDestination);
    }

    socket.on('join game', (config, errorback) => {
        //info = [name, roomcode]
        //check if roomcode valid
        let [username, roomcode] = config;
        let code = sanitizeRoomCode(roomcode);
        if (!(username.length > 0)) {
            errorback('Please enter a username')
        }
        else if (!rooms[code]) {
            console.log('join error - invalid room code: ' + code);
            errorback('Invalid room code');
        }
        else if(Object.values(rooms[code].players).includes(username)) {
            console.log('join error - duplicate username ' + username + ' in room ' + code);
            errorback('Sorry, that username is already in use in that room');
        } 
        else {
            rooms[code].players[socket.request.session.id] = username; //set player name by express session id
            socket.emit('go to room', code); //tell client to go to game page
        }
    });

    socket.on('create game', (config, errorback) => {
        let username = config[0];
        let roomcode = sanitizeRoomCode(config[1]);
        let userid = socket.request.session.id;
        if (!(username.length > 0)) {
            errorback('Please enter a username')
        }
        else if (roomcode == '') {
            let new_room = new Room(userid, username);
            rooms[new_room.code] = new_room;
            socket.emit('go to room', new_room.code);
        }
        else if (rooms[roomcode]) {
            errorback('A room already exists with that name');
        }
        else {
            let new_room = new Room(userid, username, roomcode);
            rooms[new_room.code] = new_room;
            socket.emit('go to room', new_room.code);
        }
    });
});

gamesocket.on('connection', (socket) => {
    //note: in this context, socket.request.session refers to same object as req.session in express context. unsure if by value or reference
    //check if the room still exists
    let active_room_code = socket.request.session.roomToJoin;
    if (rooms[active_room_code]) { //if the room exists...
        let active_room = rooms[active_room_code];
        socket.join(active_room_code);
        active_room.players_here[active_room.players[socket.request.session.id]] = true;
        socket.emit('tell room code', active_room.code);
        gamesocket.in(active_room_code).emit('playerListUpdate', active_room.players_here); //give them current lobby details
        if (active_room.game != null) {
            socket.emit('game status update', active_room.game.status()); //render the game on clientside if a game is ongoing
        }
        console.log('new user has reached a gamepage');

        socket.on('wordSubmission', (word) => {
            if (word.length != 0) {
                submitted_word = sanitizeString(word.trim()).toUpperCase();
                socket.emit('cleansedWord', submitted_word)
            }
        });

        socket.on('startGame', (gameword) => {
            if (sanitizeString(gameword).length != 0) {
                console.log('starting game');
                play_word = sanitizeString(gameword.trim()).toUpperCase();
                active_room.game = new Game(play_word, active_room.players[socket.request.session.id]);
                // gamesocket.emit('game page setup');
                gamesocket.in(active_room_code).emit('game status update', active_room.game.status());
            }
        });

        socket.on('letter guess', (letter) => {
            if (!active_room.game.isOver) { //ensure game isn't over
                if (active_room.game.available_letters.includes(letter)) { //ensure valid input
                    active_room.game.guessLetter(letter, active_room.players[socket.request.session.id]);
                    gamesocket.in(active_room_code).emit('game status update', active_room.game.status());
                }
            }
        });

        socket.on('disconnect', () => {
            // show that they're offline
            active_room.players_here[active_room.players[socket.request.session.id]] = false;
            gamesocket.emit('playerListUpdate', active_room.players_here);
            console.log('user ' + socket.request.session.id + ' disconnected from ' + active_room_code);
        });		
    }

});

http.listen(port, () => {
  console.log('listening on *:'+port);
});