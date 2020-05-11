var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var game_active = false;
var players = {};
function nicknameList() {
  var nicknames = [];
  for(var p in players) {
    if(players[p].introduced==true) {
       nicknames.push(players[p].nickname);
    }
  }
  return nicknames;
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
  //what to do upon new user appearing
  if (!game_active) {
    io.emit('playerListUpdate', nicknameList()); //give them current lobby details

    playerID = socket.id;
    socket.nickname = 'unnamed player'; //default username
    socket.introduced = false;
    players[playerID] = socket; //track all users
    console.log('new user has joined with player id ' + playerID);

    socket.on('nicknameUpdate', (newName) => {
      players[playerID].nickname = newName;
      players[playerID].introduced = true;
      console.log('player ' + playerID + ' has assigned themself nickname ' + newName);
      io.emit('playerListUpdate', nicknameList());
      socket.emit('updateMessage', socket.nickname)
    })

    socket.on('wordSubmission', (word) => {
      if (socket.introduced == true) {
        submitted_word = sanitizeString(word.trim()).toUpperCase();
        socket.emit('cleansedWord', submitted_word)
      }
      else {
        socket.emit('needName');
      }
    })

    socket.on('startGame', (gameword) => {
      play_word = sanitizeString(gameword.trim()).toUpperCase();
      //ghostword = word but hidden; characters replaced with underscores.
      ghostword = play_word.replace(/[A-Z]/g, '~')
      console.log('starting game');
      io.emit('gameStart', ghostword);
      game_active = true;
    })

    socket.on('disconnect', () => {
    	//what to do upon new user disappearing
      delete players[playerID];
      io.emit('playerListUpdate', nicknameList());
      console.log('user ' + playerID + ' disconnected');
    });


  }
});

http.listen(port, () => {
  console.log('listening on *:'+port);
});