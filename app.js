
/**
 * Module dependencies.
 */
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const errorHandler = require('errorhandler');
const dotenv = require('dotenv');
const path = require('path');
const redis = require('redis').createClient(6379, process.env.REDIS_HOST);
const RedisStore = require('connect-redis')(session);

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load({ path: '.env' });

/**
 * Create Express server.
 */
const app = express();

/**
 * Express configuration.
 */
app.set('host', '127.0.0.1');
app.set('port', process.env.PORT || 8000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(cookieParser());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: process.env.SESSION_SECRET,
    store: new RedisStore({
        client: redis,
    }),
}));

function darkModeMiddleware(req, res, next) {
    app.locals.darkMode = 0;
    if (
        req.cookies != undefined
		&& req.cookies.darkMode != undefined
		&& req.cookies.darkMode == 1
    ) {
        app.locals.darkMode = 1;
    }
    next();
}

app.use(darkModeMiddleware);

/**
 * Routes
 */
const appRoutes = require('./routes/routes');

app.use('/', appRoutes);

/**
 * Error Handler.
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
const server = app.listen(app.get('port'), () => {
    console.log('  App is running at http://localhost:%d in %s mode', app.get('port'), app.get('env'));
});

const homeController = require('./controllers/home');

homeController.passApp(app);

/**
 * Setup socket.io
 */
app.locals.io = require('socket.io')(server);

module.exports = app;
