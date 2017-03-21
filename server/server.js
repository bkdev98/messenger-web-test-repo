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

var API_URL = null;

if (process.env.URL) {
    API_URL = process.env.URL + '/api'
} else {
    API_URL = 'http://localhost:3000/api'
}

console.log(process.env.URL, API_URL);

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

app.get('/', (req, res) => {
    axios.get(API_URL, {
            headers: {
                'x-auth': req.cookies.token
            }
        })
        .then((result) => {
            res.render('index.hbs', result.data);
        }).catch((e) => {
            res.redirect('/login');
        });
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

app.post('/register', (req, res) => {
    const { username, email, password } = req.body;

    axios.post(`${API_URL}/auth/register`, { username, email, password })
        .then((result) => {
            res.cookie('token', result.headers['x-auth']);
            res.redirect('/');
        })
        .catch((err) => {
            res.redirect('/register');
        });
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    axios.delete(`${API_URL}/auth/logout`, {
        headers: {
            'x-auth': req.cookies.token
        }
    })
    .then(() => {
        res.redirect('/login');
    })
    .catch((e) => {
        res.redirect('/');
    });
});

server.listen(port, () => {
    console.log(`Started on port ${port}`);
});
