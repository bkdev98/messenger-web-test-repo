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

const middleware = {
    authenticate: (req, res, next) => {
        var token = req.cookies.token;
        if (token) {
            usersRef.orderByChild("idToken").equalTo(token).once("value", (snapshot) => {
                req.currentUser = snapshot.val();
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
        if (token) {
            usersRef.orderByChild("idToken").equalTo(token).once("value", (snapshot) => {
                if (snapshot.val().fullname !== null) {
                    next();
                } else {
                    res.redirect('/');
                }
            }, (e) => {
                res.redirect('/login');
            })
        } else {
            res.redirect('/login');
        }
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

app.get('/', [middleware.authenticate], (req, res) => {
    // console.log("Current user: ", req.currentUser);
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
                return user.uid !== Object.keys(req.currentUser)[0]
            });
            // console.log('User List', userList);
            // console.log('Filtered List', filteredUserList);
            res.render('index.hbs', {
                userList: filteredUserList,
                title: "Messenger | Home"
            });    
        })
        
});

app.get('/test', (req, res) => {
    res.render('test.hbs');
});

var conversationId = null;
var targetUserId = null;
var authToken = null;

app.get('/messengers/:id', (req, res) => {
    targetUserId = req.params.id;
    authToken = req.cookies.token;
    //  GET data from API
    axios.get(`${API_URL}/messenger/${req.params.id}`, {
            headers: {
                'x-auth': req.cookies.token
            }
        })
        .then((result) => {
            conversationId = result.data.conversationId;


            io.on('connection', (socket) => {
                // console.log(`${result.data.currentUser.username} connected`);
                //  Waiting for new message

                socket.on('join', function (room) {

                    if (socket.room) {
                        console.log(result.data.currentUser.username + " left room" + socket.room);
                        socket.leave(socket.room);
                    }

                    socket.room = room;
                    console.log(result.data.currentUser.username + " joined room" + conversationId);
                    socket.join(room);
                });

                // console.log(socket.id);
                socket.on('createMessage', (newEmail) => {
                    //  POST data to API
                    axios({
                        method: 'post',
                        url: `${API_URL}/messenger/${targetUserId}`,
                        headers: {
                            'x-auth': authToken
                        },
                        data: {
                            'content': newEmail.content
                        }
                    }).then((mess) => {
                        //  Emit event to clients
                        socket.broadcast.to(conversationId).emit('newMessage', mess.data);
                    }).catch((e) => {
                        console.log(e);
                    });
                });

                socket.on('disconnect', () => {
                    console.log(result.data.currentUser.username + ' disconnected to server');
                });
            });




            res.render('conversation.hbs', result.data);
        }).catch((e) => {
            // console.log(e);
            res.redirect('/login');
        });
});

app.get('/login', (req, res) => {
    res.render('login.hbs');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    axios.post(`${API_URL}/auth/login`, { email, password })
        .then((result) => {
            res.cookie('token', result.headers['x-auth']);
            res.redirect('/');
        })
        .catch((err) => {
            res.redirect('/login');
        });
})

app.get('/register', (req, res) => {
    res.render('register.hbs');
});

app.get('/info', [middleware.authenticate, middleware.info], (req, res) => {
    res.render('info.hbs', {
        uid: Object.keys(req.currentUser)
    });
});

app.post('/register', (req, res) => {
    const newUser = {
        email: req.body.email,
        idToken: req.cookies.token,
        fullname: null
    }

    usersRef.child(req.body.uid).set(newUser)
        .then((user) => {
            res.send({redirect: '/info'});
        })
        .catch((e) => {
            res.redirect('/register');
        });

    // axios.post(`${API_URL}/auth/register`, { username, email, password })
    //     .then((result) => {
    //         res.cookie('token', result.headers['x-auth']);
    //         res.redirect('/');
    //     })
    //     .catch((err) => {
    //         res.redirect('/register');
    //     });
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/login');
});

server.listen(port, () => {
    console.log(`Started on port ${port}`);
});
