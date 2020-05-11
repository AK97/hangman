var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var players = {};
function nicknameList() {
  var nicknames = [];
  for(var p in players) {
    nicknames.push(players[p].nickname)
  }
  return nicknames;
}

const port = 69; //port for hosting site on local system. will probably be invalidated once hosted elsewhere.

app.use('/styles',express.static(__dirname + '/styles')); //provide client with (static) stylesheets

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});


io.on('connection', (socket) => {
  //what to do upon new user appearing
  io.emit('playerListUpdate', nicknameList()); //give them current lobby details

  playerID = socket.id;
  socket.nickname = 'unnamed player'; //default username
  players[playerID] = socket; //track all users
  console.log('new user has joined with player id ' + playerID);

  socket.on('nicknameUpdate', (newName) => {
    players[playerID].nickname = newName;
    console.log('player ' + playerID + ' has assigned themself nickname ' + newName);
    io.emit('playerListUpdate', nicknameList());
  })

  socket.on('disconnect', () => {
  	//what to do upon new user disappearing
    delete players[playerID];
    io.emit('playerListUpdate', nicknameList());
    console.log('user ' + playerID + ' disconnected');
  });
});

http.listen(port, () => {
  console.log('listening on *:'+port);
});