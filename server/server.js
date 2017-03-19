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
    axios.get('http://localhost:3000/api', {
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

app.get('/messengers/:id', (req, res) => {
    //  GET data from API
    axios.get(`http://localhost:3000/api/messenger/${req.params.id}`, {
            headers: {
                'x-auth': req.cookies.token
            }
        })
        .then((result) => {
            io.on('connection', (socket) => {
                console.log(`${result.data.currentUser.username} connected`);
                //  Waiting for new message
                socket.on('createMessage', (newEmail) => {
                    //  POST data to API
                    axios({
                        method: 'post',
                        url: `http://localhost:3000/api/messenger/${req.params.id}`,
                        headers: {
                            'x-auth': req.cookies.token
                        },
                        data: {
                            'content': newEmail.content
                        }
                    }).then((mess) => {
                        //  Emit event to clients
                        socket.broadcast.emit('newMessage', mess.data);
                    }).catch((e) => {
                        console.log(e);
                    });
                });

                socket.on('disconnect', () => {
                    console.log('Disconnected to server');
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

    axios.post('http://localhost:3000/api/auth/login', { email, password })
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

    axios.post('http://localhost:3000/api/auth/register', { username, email, password })
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
    axios.delete('http://localhost:3000/api/auth/logout', {
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
