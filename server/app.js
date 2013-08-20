var io = require('socket.io').listen(3000);
var uuid = require('node-uuid');
var User = require('../shared/user.js').User;
var Room = require('../shared/room.js').Room;
var Lobby = require('./includes/lobby.js').Lobby;

Room.prototype.findUser = function(id, callback){
    this.users.forEach(function(user, index, array){
        if(user.id == id){
            callback(user);
            return true;
        }
    });
    return false;
}

User.prototype.say = function(text, room){
    if(text && this.socket){
        this.socket.emit('sayRoom', {user:this.id, room:room, text:text});
    }
}

Room.prototype.say = function(text){
    this.users.forEach(function(user, index, array){
        user.say(text, this.id);
    });
}

Lobby.prototype.announce = function(text){
    this.rooms.forEach(function(room, index, array){
        room.announce(text);
    });
}

Lobby.prototype.fetchRoom = function(rid, callback){
    this.rooms.forEach(function(room, index, array){
        if(room.id == rid){
            callback(room);
            return true;
        }
    });
    return false;
}

var lobby = new Lobby();

io.sockets.on('connection', function (socket){
    socket.emit('connected', {});

    socket.on('createRoom', function(data){
        var temp = new Room();
        temp.id = uuid.v4();

        console.log(lobby);
        lobby.rooms.push(temp);
        console.log(lobby);

        socket.emit('roomCreated', {roomID: temp.id});
    });

    socket.on('registerClient', function(data){
        var room = lobby.fetchRoom(data.roomID, function(room){

            var user = new User();

            user.id = uuid.v4();
            user.name = data.name;
            user.socket = socket;

            if(room){
                room.users.push(user);

                if(room.users.length == 1){
                    room.admins.push(user.id);
                    user.admin = true;
                }

                socket.set('userID', user.id);
                socket.set('roomID', room.id);
                room.users.forEach(function(user){
                    user.socket.emit('updateClients', {});
                });
                socket.emit('clientRegistered', {userID: user.id, admin:user.admin});
            }
        });

    });

    socket.on('doSay', function(data){
        var room = lobby.fetchRoom(data.roomID, function(room){
            if(room){
                var user = room.findUser(data.sender, function(user){
                    if(user){
                        room.say(user.name + ":" + data.text);
                    }
                });
            }
        });
    });

    socket.on('doCmd', function(data){
        console.log(data);
        if(data.sender && data.roomID){
            lobby.fetchRoom(data.roomID, function(room){
                if(room){
                    room.findUser(data.sender, function(user){
                       if(user){
                            tokenize(data.text, room, user); 
                       }
                    });
                }
            });
        }
    });

    socket.on('getClients', function(data){
         var room = lobby.fetchRoom(data.roomID, function(room){
            if(room){
                var users = [];
                room.users.forEach(function(user, index, array){
                    users.push(user.name);
                })
                socket.emit('sendClients', {room:data.roomID, clients: users});
            }
        });
    });

    socket.on('disconnect', function(){
        socket.get('userID', function(err, userID){
            socket.get('roomID', function(err, roomID){
                var room = lobby.fetchRoom(roomID, function(room){
                    room.users.forEach(function(user, index, array){
                        if(user.id == userID){
                            delete room.users[index];
                            room.users.forEach(function(user){
                                user.socket.emit('updateClients', {});
                            });
                            console.log('User Disconnected: ' + user.name)
                        }
                    });
                });
            })
        })
    });

    setTimeout(function(){
        lobby.rooms.forEach(function(room, index, array){
            if(room.users.length == 0){
                delete lobby.rooms[index];
            }
        });
    }, 1000 * 60 * 5);

    function tokenize(cmdString, room, user){
        var raw = cmdString.split(' ');
        var proc = cmdString.toLowerCase().split(' ');
        var cmd = proc[0].substr(1);

        cmdProcessor(cmd, proc, raw, room, user);
    }

    function resolveDice(diceString){
        var dice = diceString.split('d');
        var number = dice[0];
        var face = dice[1];
        var output = {};
        output.rolls = [];
        output.total = 0;

        number = number ? number : 1;
        face = face ? face : 6;

        for(var i = 0; i < number; i++){
            var roll = Math.max(Math.round(Math.random() * face), 1);
            output.rolls.push(roll);
            output.total += roll;
        }

        return output;
    }

    function cmdProcessor(cmd, proc, raw, room, user){
        if(!user){
            user = {};
            user.name = "A Ghost";
        }
        switch(cmd){
            case 'roll':
                var output = resolveDice(proc[1]);
                room.say(user.name + ' rolls the dice and gets ' + JSON.stringify(output.rolls) + ' (' + output.total + ').');
                return true;
            break;
            case 'proll':

            break;
            default:
                return false;
            break;
        }
    }

});