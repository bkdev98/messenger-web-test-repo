const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const _ = require('lodash');
const hbs = require('hbs');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const MomentHandler = require("handlebars.moment");
MomentHandler.registerHelpers(hbs);

//  Firebase Configuration

const firebase = require('firebase');

const firebaseConfig = {
    apiKey: "AIzaSyDt6RXCwFDaOiAT8QhZyU3iOKGrAiRPxNU",
    authDomain: "messenger-app-6fb8e.firebaseapp.com",
    databaseURL: "https://messenger-app-6fb8e.firebaseio.com",
    storageBucket: "messenger-app-6fb8e.appspot.com",
    messagingSenderId: "250437655467"
};

firebase.initializeApp(firebaseConfig);

const messagesRef = firebase.database().ref("messages/");
const usersRef = firebase.database().ref("users/");
const conversationRef = firebase.database().ref("conversation/");

// var newConver = {
//     'xBgJudz05xTzqpoJw5JMuNbUqn42': 'dSp5eGLgUgbzdEDBybQaxaTO6bT2'
// };

// var newConverRef = conversationRef.push(newConver);
// conversationId = newConverRef.key;
// conversationRef.child(conversationId).set(newConver).then(() => {
//     console.log("ss");
// });

// var newMess = {
//     sender: "xBgJudz05xTzqpoJw5JMuNbUqn42",
//     content: "hi",
//     conversationId: "-KfqT0jbqOxPv0AYXelJ",
//     createdAt: "123"
// }

// var newMessRef = messagesRef.push(newMess);
// messagesRef.child(newMessRef.key).set(newMess);

const middleware = {
    authenticate: (req, res, next) => {
        var token = req.cookies.token;
        if (token) {
            usersRef.orderByChild("idToken").equalTo(token).once("value", (snapshot) => {
                var uid = Object.keys(snapshot.val())[0];
                user = {
                    uid,
                    email: snapshot.val()[uid].email,
                    fullname: snapshot.val()[uid].fullname
                }
                req.currentUser = user;
                next();
            }, (e) => {
                res.redirect('/login');
            })
        } else {
            res.redirect('/login');
        }
    },
    info: (req, res, next) => {
        var token = req.cookies.token;
        // console.log(token);
        if (token) {
            usersRef.orderByChild("idToken").equalTo(token).once("value", (snapshot) => {
                if (snapshot.val().fullname !== null) {
                    next();
                } else {
                    res.redirect('/info');
                }
            }, (e) => {
                res.redirect('/login');
            })
        } else {
            res.redirect('/login');
        }
    },
    gettargetuser: (req, res, next) => {
        var targetUser = {};
        var id = req.params.id;

        usersRef.orderByKey().equalTo(id).once("value", (snapshot) => {
            if (!snapshot) {
                res.redirect('/');
            } else {
                req.targetUser = snapshot.val()[id];
                next();
            }
        });
    },
    getuserlist: (req, res, next) => {
        var userList = [];
        usersRef.once('value', (snapshot) => {
            Object.keys(snapshot.val()).map((key) => {
                var { email, fullname } = snapshot.val()[key];
                var user = {
                    email,
                    fullname,
                    uid: key
                }
                userList.push(user);
            });
        })
            .then(() => {
                var filteredUserList = [];

                filteredUserList = userList.filter((user) => {
                    return user.uid !== req.currentUser.uid
                });

                req.userList = filteredUserList;
                next();
            })
    },
    getmessagelist: (req, res, next) => {
        targetUserId = req.params.id;
        currentUserId = req.currentUser.uid;
        var conversationId = null;
        var messageList = [];

        conversationRef.orderByChild(currentUserId).equalTo(targetUserId).once("value", (snapshot) => {
            if (snapshot.val() !== null) {
                conversationId = Object.keys(snapshot.val())[0];
                //  GET messages
                return messagesRef.once('value').then((snapshot) => {
                    var messages = snapshot.val() || {};
                    
                    Object.keys(messages).forEach((key) => {
                        if (messages[key].conversationId === conversationId) {
                            messageList.push(messages[key]);
                        }
                    });
                    // console.log('mess 1', messageList);
                    req.messageList = messageList;
                    req.conversationId = conversationId;
                    next();
                });
            } else {
                conversationRef.orderByChild(targetUserId).equalTo(currentUserId).once("value", (snapshot) => {
                    if (snapshot.val() !== null) {
                        conversationId = Object.keys(snapshot.val())[0];
                        // console.log('conver', conversationId);
                        //  GET messages
                        return messagesRef.once("value").then((snapshot) => {
                            var messages = snapshot.val() || {};
                            
                            Object.keys(messages).forEach((key) => {
                                if (messages[key].conversationId === conversationId) {
                                    messageList.push(messages[key]);
                                }
                            });
                            // console.log('mess 2', messageList);
                            req.messageList = messageList;
                            req.conversationId = conversationId;
                            next();
                        });
                    } else {
                        var newConver = {};
                        newConver[currentUserId] = targetUserId;

                        var newConverRef = conversationRef.push(newConver);
                        conversationId = newConverRef.key;
                        conversationRef.child(conversationId).set(newConver)
                            .then(() => {
                                return messagesRef.once("value").then((snapshot) => {
                                    var messages = snapshot.val() || {};
                                    
                                    Object.keys(messages).forEach((key) => {
                                        if (messages[key].conversationId === conversationId) {
                                            messageList.push(messages[key]);
                                        }
                                    });
                                    // console.log('mess 3', messageList);
                                    req.messageList = messageList;
                                    req.conversationId = conversationId;
                                    next();
                                });
                            });
                    }
                });
            }
        });

    }
}

// messagesRef.set({
//     content: "Test message"
// });

var API_URL = null;

if (process.env.URL) {
    API_URL = process.env.URL + '/api'
} else {
    API_URL = 'http://localhost:3000/api'
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT || 3001;

app.use('/css', express.static(__dirname + '/../public/css'));
app.use('/js', express.static(__dirname + '/../public/js'));
app.use('/fonts', express.static(__dirname + '/../public/fonts'));

app.use(cookieParser());

app.use(bodyParser.urlencoded({
  extended: true
}));

hbs.registerPartials(__dirname + '/../views/partials');
app.set('view engine', 'hbs');

hbs.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
        case '===':
            return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!==':
            return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        default:
            return options.inverse(this);
    }
});

//  SocketIO

//  Express Routers

app.get('/', [middleware.authenticate, middleware.info, middleware.getuserlist], (req, res) => {
    res.render('index.hbs', {
        userList: req.userList,
        title: "Messenger | Home"
    }); 
});

app.get('/test', (req, res) => {
    res.render('test.hbs');
});

app.get('/messengers/:id', [middleware.authenticate, middleware.gettargetuser, middleware.getuserlist, middleware.getmessagelist], (req, res) => {
    var conversationId = req.conversationId;

    io.on('connection', (socket) => {
        // console.log(`${result.data.currentUser.username} connected`);
        //  Waiting for new message

        socket.on('join', function (room) {

            if (socket.room) {
                console.log(req.currentUser.fullname + " left room" + socket.room);
                socket.leave(socket.room);
            }

            socket.room = room;
            console.log(req.currentUser.fullname + " joined room" + conversationId);
            socket.join(room);
        });

        // console.log(socket.id);
        socket.on('createMessage', (newEmail) => {
            var newMessage = {
                sender: req.currentUser.fullname,
                createdAt: new Date().getTime(),
                content: newEmail.content,
                conversationId
            };
            var newMessRef = messagesRef.push(newMessage);
            messagesRef.child(newMessRef.key).set(newMessage);
            messagesRef.on("child_added").then((snapshot) => {
                console.log('success', snapshot.key);
            });
        });

        socket.on('disconnect', () => {
            console.log(req.currentUser.fullname + ' disconnected to server');
        });
    });


    res.render('conversation.hbs', {
        messages: req.messageList,
        userList: req.userList,
        targetUser: req.targetUser,
        currentUser: req.currentUser,
        conversationId
    });

    // //  GET data from API
    // axios.get(`${API_URL}/messenger/${req.params.id}`, {
    //         headers: {
    //             'x-auth': req.cookies.token
    //         }
    //     })
    //     .then((result) => {
    //         conversationId = result.data.conversationId;

    //         res.render('conversation.hbs', result.data);
    //     }).catch((e) => {
    //         // console.log(e);
    //         res.redirect('/login');
    //     });
});

app.get('/login', (req, res) => {
    res.render('login.hbs');
});

app.post('/login', (req, res) => {
    const { uid, idToken } = req.body;

    usersRef.child(uid).update({ idToken })
        .then((user) => {
            res.send({redirect: '/'});
        })
        .catch((e) => {
            res.redirect('/login');
        })
})

app.get('/register', (req, res) => {
    res.render('register.hbs');
});

app.get('/info', [middleware.authenticate, middleware.info], (req, res) => {
    res.render('info.hbs', {
        uid: req.currentUser.uid
    });
});

app.post('/register', (req, res) => {
    const newUser = {
        email: req.body.email,
        idToken: req.cookies.token,
        fullname: null
    }

    usersRef.child(req.body.uid).once("value", (snapshot) => {
        if(snapshot.val()) {
            usersRef.child(req.body.uid).update({idToken: req.cookies.token})
                .then(() => {
                    res.send({redirect: '/'});
                });
        } else {
            usersRef.child(req.body.uid).set(newUser)
                .then((user) => {
                    res.send({redirect: '/info'});
                })
                .catch((e) => {
                    res.redirect('/register');
                });
        }
    });
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

server.listen(port, () => {
    console.log(`Started on port ${port}`);
});
