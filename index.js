var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var game_active = false;
var players = {};
var introduced = {};

function sanitizeString(str){
  str = str.replace(/[^a-zA-Z\s]/g, '');
  return str.trim();
}
var current_game = {
  wordmaster:"",
  phrase:"",
  ghostphrase:""
};

const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

app.use('/styles',express.static(__dirname + '/styles')); //provide client with (static) stylesheets
app.use('/images',express.static(__dirname + '/images')); //provide client with (static) images

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});


io.on('connection', (socket) => {
  //what to do upon new user appearing
    io.emit('playerListUpdate', Object.values(players)); //give them current lobby details

    //players[socket.id] = 'unnamed player';
    introduced[socket.id] = false;

    console.log('new user has joined with player id ' + socket.id);

    socket.on('nicknameUpdate', (newName) => {
      players[socket.id] = newName;
      introduced[socket.id] = true;
      console.log('player ' + socket.id + ' has assigned themself nickname ' + newName);
      io.emit('playerListUpdate', Object.values(players));
      socket.emit('updateMessage', players[socket.id])
    })

    socket.on('wordSubmission', (word) => {
      if (introduced[socket.id] == true) {
        submitted_word = sanitizeString(word.trim()).toUpperCase();
        socket.emit('cleansedWord', submitted_word)
      }
      else {
        socket.emit('needName');
      }
    })

    socket.on('startGame', (gameword) => {
      play_word = sanitizeString(gameword.trim()).toUpperCase();
      //ghostword = word but hidden; characters replaced with ~, ideally underscores later?.
      ghostword = play_word.replace(/[A-Z]/g, '~')
      console.log('starting game');
      io.emit('gameStart', ghostword);
      socket.broadcast.emit('setupGuessing');
      io.emit('logEvent', players[socket.id]+' has started the game!')
      game_active = true;
    })

    socket.on('disconnect', () => {
    	//what to do upon new user disappearing
      delete players[socket.id];
      io.emit('playerListUpdate', Object.values(players));
      console.log('user ' + socket.id + ' disconnected');
    });

  // else { //if game is already active,...
  //   //build the ongoing game on client page
  //   //disallow participation, label them a spectator
  // }
});

http.listen(port, () => {
  console.log('listening on *:'+port);
});