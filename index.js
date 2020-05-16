var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
var game_active = false;
var players = {};
var game;

class Game {
  constructor(word,gameStarter) {
    this.host = gameStarter; //eventually should use this to prevent host from being able to guess
    this.word = word; //the solution phrase
    this.log = [players[gameStarter]+' has started the game!']; //game log history
    this.wrong_letters = [];
    this.available_letters = alphabet;
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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});


io.on('connection', (socket) => {
  if(!game_active) {
    io.emit('playerListUpdate', Object.values(players)); //give them current lobby details

    console.log('new user has joined with player id ' + socket.id);

    socket.on('nicknameUpdate', (newName) => {
      players[socket.id] = newName;
      console.log('player ' + socket.id + ' has assigned themself nickname ' + newName);
      io.emit('playerListUpdate', Object.values(players));
      socket.emit('updateMessage', players[socket.id])
    })

    socket.on('wordSubmission', (word) => {
      if (players[socket.id]) {
        submitted_word = sanitizeString(word.trim()).toUpperCase();
        socket.emit('cleansedWord', submitted_word)
      }
      else {
        socket.emit('needName');
      }
    });

    socket.on('startGame', (gameword) => {
      console.log('starting game');
      play_word = sanitizeString(gameword.trim()).toUpperCase();
      game = new Game(play_word, socket.id);
      game_active = true;
      io.emit('game page setup');
      io.emit('game status update', game.status());
    });

    socket.on('letter guess', (letter) => {
      if (!game.isOver) { //ensure game isn't over
        if (game.available_letters.includes(letter)) { //ensure valid input
          game.guessLetter(letter, players[socket.id]);
          io.emit('game status update', game.status());
        }
      }
    });

    socket.on('disconnect', () => {
    	//what to do upon new user disappearing
      delete players[socket.id];
      io.emit('playerListUpdate', Object.values(players));
      console.log('user ' + socket.id + ' disconnected');
    });
  }
  else { //if game is already active..
    socket.emit('game status update');
    socket.emit('spectator alert');
  }
});

http.listen(port, () => {
  console.log('listening on *:'+port);
});