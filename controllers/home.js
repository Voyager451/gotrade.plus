const marked = require('marked');

const snoowrap = require('snoowrap');
const snoostorm = require('snoostorm');

const mysql = require('../config/mysql').mysql_pool;

let app = null;
exports.passApp = function (_app) {
    app = _app;
};

// eslint-disable-next-line new-cap
const redditClient = new snoowrap({
    userAgent: process.env.REDDIT_USER_AGENT,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
});

const redditPollTime = 5000; // 5 seconds in milliseconds
const submissions = new snoostorm.SubmissionStream(redditClient, {
    subreddit: 'GlobalOffensiveTrade',
    limit: 15,
    pollTime: redditPollTime,
});

submissions.on('item', (posts) => {
    posts.forEach((post) => {
        handleNewPost(post);
    });
});

function handleNewPost(post) {
    const { title } = post;
    const titleLowerCase = title.toLocaleLowerCase();
    let type = 0;
    let have = '';
    let want = '';

    if (titleLowerCase.indexOf('[h]') == 0 && titleLowerCase.indexOf('[w]') != -1) {
        // [have] / [want]
        type = 1;
        have =
            title.substring(
                titleLowerCase.lastIndexOf('[h]') + 3,
                titleLowerCase.lastIndexOf('[w]'),
            ).trim();

        want = title.substring(titleLowerCase.lastIndexOf('[w]') + 3).trim();

    } else if (titleLowerCase.indexOf('[lph]') == 0 && titleLowerCase.indexOf('[w]') != -1) {
        // [LPH] / [want]
        type = 1;
        have =
            title.substring(
                titleLowerCase.lastIndexOf('[lph]') + 5,
                titleLowerCase.lastIndexOf('[w]'),
            ).trim();

        want = title.substring(titleLowerCase.lastIndexOf('[w]') + 3).trim();

    } else if (titleLowerCase.indexOf('[w]') == 0 && titleLowerCase.indexOf('[h]') != -1) {
        // [want] / [have]
        type = 2;
        want =
            title.substring(
                titleLowerCase.lastIndexOf('[w]') + 3,
                titleLowerCase.lastIndexOf('[h]'),
            ).trim();

        have = title.substring(titleLowerCase.lastIndexOf('[h]') + 3).trim();

    } else if (titleLowerCase.indexOf('[store]') == 0) {
        // [store]
        type = 3;
        have = title.substring(titleLowerCase.lastIndexOf('[store]') + 7).trim();

    } else if (titleLowerCase.indexOf('[pc]') == 0) {
        // [price-check]
        type = 4;
        have = title.substring(titleLowerCase.lastIndexOf('[pc]') + 4).trim();
    }

    // we only care about trade related *type* of posts (any type other than 0)
    if (type != 0) {
        const body = post.selftext;
        // if the body is empty, the post was most likely deleted
        if (body != '') {
            addPost(type, have, want, post);
        }
    }
}

// Add trade post to database
function addPost(type, have, want, data) {

    const time = data.created_utc;
    const username = data.author.name;
    const steamProfileLink = data.author_flair_text;
    let steamid = 0;
    const body = data.selftext;
    let link = data.permalink;

    if (steamProfileLink != null) {
        steamid = steamProfileLink.split('/').pop();
    }

    // remove already-known part of link
    link = link.split('/r/GlobalOffensiveTrade/comments/').pop();

    const trade_data = {
        type,
        username,
        steamid,
        link,
        have,
        want,
        body,
        time,
    };

    // store trade post in DB
    mysql.getConnection((connErr, conn) => {

        if (connErr || conn === undefined) {
            console.log(`Error: Failed to conn to DB`);
        }

        conn.query('INSERT INTO trades SET ?', trade_data, (queryErr, results) => {
            conn.release();

            if (queryErr && queryErr.sqlMessage && queryErr.sqlMessage.includes('Duplicate entry')) {
                // We have a unique key on 'link' DB column, so sometimes we'll try to
                //      insert the exact same reddit post twice, and it will throw a duplicate error
                //      this is a hacky way to do this
                // console.log(`Ignoring duplicate DB post entry for ${link}`);
                return false;
            }

            if (queryErr || (results === undefined)) {
                // TODO:: improve MySQl error handling https://github.com/mysqljs/mysql#error-handling
                console.log(`Error: Failed while inserting trade into DB: ${queryErr.sqlMessage}`);
                return false;
            }

            if (results.insertId !== undefined && type !== 4) {
                trade_data.id = results.insertId;
                trade_data.body = null;
                // emit new trade to connected socket.io clients
                if (app) {
                    app.locals.io.emit('new trade', trade_data);
                }
            }
        });

    });
}

exports.getTradeBody = (req, res) => {

    const trade_id = req.body.id;

    if (trade_id != undefined) {

        mysql.getConnection((err, conn) => {

            if (err || conn == 'undefined') {
                console.log(`Error: Failed to conn to DB: ${err}`);
                res.json({ status: 0 });
                return false;
            }

            conn.query('SELECT body FROM trades WHERE id = ? ', trade_id, (err, results) => {

                conn.release();

                if (
                    err || (results == undefined)
                    || (results[0] == undefined)
                    || (results[0].body == undefined)
                ) {
                    console.log(`Error: Failed while selecting trade_body from DB: ${err}`);
                    res.json({ status: 0 });
                    return false;
                }

                // success
                res.json({
                    status: 1,
                    trade_body: parseTradeBody(results[0].body),
                });

                return false;
            });
        });

    } else {
        res.json({ status: 0 });
    }

};

function parseTradeBody(trade_body) {
    // &nbsp; shows up as a string instead of a space in trade body
    trade_body = trade_body.split('&amp;nbsp;').join(' ');
    return marked(trade_body);
}

exports.getTradeLiveData = (req, res) => {

    const tradeId = req.body.id;
    const { article_id: articleId } = req.body;

    if (tradeId !== undefined && articleId !== undefined) {

        redditClient
            .getSubmission(articleId)
            .fetch()
            .then((result) => {

                let tradeClosed = 0;
                let tradeBody = '';
                let steamId = 0;

                // Trades are closed by marking them as NSFW (over-18)
                tradeClosed = result.over_18;
                // Close it if body is [removed] (by mods) or [deleted] (by user)
                tradeBody = result.selftext;
                // Get author flair, which is really their steam profile url
                const steamProfileLink = result.author_flair_text;
                if (steamProfileLink != null) {
                    // Just get the last part after / which is their steam64 id
                    steamId = steamProfileLink.split('/').pop();
                }

                if (tradeClosed || tradeBody === '[removed]' || tradeBody === '[deleted]') {
                    // mark as closed in DB
                    tradeClosed = 1;
                    updateTradeLiveData(tradeId, tradeClosed, steamId);
                } else {
                    // Not closed but lets still update the steamid
                    updateTradeLiveData(tradeId, tradeClosed, steamId);
                }

                res.json({ status: 1, closed: tradeClosed, steamid: steamId });

            }, (error) => {
                console.error(`getTradeLiveData request failed: ${error}`);
                res.json({ status: 0 });
            });

    } else {
        // console.info(`getTradeLiveData request data: ${error}`);
        res.json({ status: 0 });
    }

};

function updateTradeLiveData(tradeid, closed, steamid) {
    mysql.getConnection((err, conn) => {
        if (err || conn === undefined) {
            console.log(`Error: Failed to conn to DB: ${err}`);
        } else {
            conn.query('UPDATE trades SET closed=?, steamid=? WHERE id=?', [closed, steamid, tradeid], () => {
                conn.release();
            });
        }
    });
}

/**
 * GET /
 * Home page.
 */
exports.index = (req, res) => {
    // Get existing trades
    mysql.getConnection((err, conn) => {

        if (err || conn == 'undefined') {
            console.log(`Error: Failed to conn to DB (select trades): ${err}`);
        }

        const countSql = 'SELECT count(*) as num_rows FROM trades';

        // pagination
        let totalRec = 0; const pageSize = 50; let pageCount = 0; let start = 0; let
            currentPage = 1;

        conn.query(countSql, (err, countrows, fields) => {

            if (err || (fields == undefined)) {
                conn.release();
                console.log(`Error: Failed while inserting trade into DB: ${err}`);
            }
            totalRec = countrows[0].num_rows;
            pageCount = Math.ceil(totalRec / pageSize);

            if (typeof req.query.page !== 'undefined') currentPage = req.query.page;

            if (currentPage > 1) start = (currentPage - 1) * pageSize;

            const selectSql =
                `${'SELECT id,username,steamid,type,closed,link,have,want,time '
                + 'FROM trades WHERE type IN (1,2,3) '
                + 'ORDER BY id DESC LIMIT '}${start} ,${pageSize}`;

            conn.query(selectSql, (err, trades) => {

                conn.release();

                if (err || (trades == undefined)) {
                    console.log(`Error: Failed while selecting trades from DB: ${err}`);
                }

                res.render('home', {
                    title: '',
                    trades,

                    // pagination
                    pageSize,
                    pageCount,
                    currentPage,
                    searchShowStore: 1,
                    darkMode: req.app.locals.darkMode,
                });

            });
        });
    });
};
