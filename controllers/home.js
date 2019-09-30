"use strict";

const Snooper = require('reddit-snooper');
const mysql = require('../config/mysql').mysql_pool;
const marked = require('marked');

let app = null;
exports.passApp = function (_app) {
    app = _app;
};

// Setup reddit snooper
const redditSnooper = new Snooper({
	// credential information is not needed for snooper.watcher
	username: 'reddit_username',
	password: 'reddit_password',
	app_id: process.env.REDDIT_APP_ID,
	api_secret: process.env.REDDIT_API_SECRET,
	user_agent: 'GOTrade.plus Bot',

	automatic_retries: true,
	requests_per_minuite: 1 // yes, minute is misspelled
});

// Watch for new posts on our subreddit
redditSnooper.watcher.getPostWatcher('GlobalOffensiveTrade')

	.on('post', function(post) {

		let title = post.data.title;
		let _title = title.toLocaleLowerCase();
		let type = 0;
		let have = '';
		let want = '';

		if (_title.indexOf('[h]') == 0 && _title.indexOf('[w]') != -1) {
			// [have] / [want]
			type = 1;
			have =
				title.substring(
					_title.lastIndexOf('[h]')+3,
					_title.lastIndexOf('[w]')
				).trim();

			want = title.substring(_title.lastIndexOf('[w]')+3).trim();

		} else if (_title.indexOf('[lph]') == 0 && _title.indexOf('[w]') != -1) {
			// [LPH] / [want]
			type = 1;
			have =
				title.substring(
					_title.lastIndexOf('[lph]')+5,
					_title.lastIndexOf('[w]')
				).trim();

			want = title.substring(_title.lastIndexOf('[w]')+3).trim();

		} else if (_title.indexOf('[w]') == 0 && _title.indexOf('[h]') != -1) {
			// [want] / [have]
			type = 2;
			want =
				title.substring(
					_title.lastIndexOf('[w]')+3,
					_title.lastIndexOf('[h]')
				).trim();

			have = title.substring(_title.lastIndexOf('[h]')+3).trim();

		} else if (_title.indexOf('[store]') == 0) {
			// [store]
			type = 3;
			have = title.substring(_title.lastIndexOf('[store]')+7).trim();

		} else if (_title.indexOf('[pc]') == 0) {
			// [price-check]
			type = 4;
			have = title.substring(_title.lastIndexOf('[pc]')+4).trim();
		}

		// we only care about trade related *type* of posts (any type other than 0)
		if (type != 0) {
			let body = post.data.selftext;
			// if the body is empty, the post was most likely deleted
			if (body != '') {
				addPost(type,have,want,post.data);
			}
		}

	})
	.on('error', console.error);

// Add trade post to database
function addPost(type,have,want,data) {

	let time = data.created_utc;
	let username = data.author;
    let steamProfileLink = data.author_flair_text;
    let steamid = 0;
	let body = data.selftext;
	let link = data.permalink;

	if (steamProfileLink != null) {
        steamid = steamProfileLink.split('/').pop();
	}

	// remove already-known part of link
	link = link.split('/r/GlobalOffensiveTrade/comments/').pop();

	let trade_data = {
		type: type,
		username: username,
        steamid: steamid,
		link: link,
		have: have,
		want: want,
		body: body,
		time: time
	};

	// store trade post in DB
	mysql.getConnection(function (err, conn) {

		if (err || conn == 'undefined') {
			console.log('Error: Failed to conn to DB: ' + err);
		}

		conn.query('INSERT INTO trades SET ?', trade_data, function (err, results) {
			conn.release();

			if (err || (results == undefined)) {
				console.log('Error: Failed while inserting trade into DB: ' + err);
				return false;
			}

			if (results.insertId != undefined && type != 4) {
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

	let trade_id = req.body.id;

	if (trade_id != undefined) {

		mysql.getConnection(function (err, conn) {

			if (err || conn == 'undefined') {
				console.log('Error: Failed to conn to DB: ' + err);
				res.json({status: 0});
				return false;
			}

			conn.query('SELECT body FROM trades WHERE id = ? ', trade_id, function (err, results) {

				conn.release();

				if (
					err || (results == undefined)
					|| (results[0] == undefined)
					|| (results[0].body == undefined)
				) {
					console.log('Error: Failed while selecting trade_body from DB: ' + err);
					res.json({status: 0});
					return false;
				}

				// success
				res.json({
					status: 1,
					trade_body: parseTradeBody(results[0].body)
				});

				return false;
			});
		});

	} else {
		res.json({status: 0});
	}

};

function parseTradeBody(trade_body) {
	// &nbsp; shows up as a string instead of a space in trade body
	trade_body = trade_body.split('&amp;nbsp;').join(' ');
	return marked(trade_body);
}

exports.getTradeLiveData = (req, res) => {

	let trade_id = req.body.id;
	let article_id = req.body.article_id;

	if (trade_id != undefined && article_id != undefined) {

		let get_article_endpoint = 'r/GlobalOffensiveTrade/comments/'+article_id+'/_';

		redditSnooper.api.get(get_article_endpoint, {}, function(err, responseCode, responseData) {

			if (err) {
				console.error("snooper get article api request failed: " + err);
				res.json({status: 0});
				return;
			}

			let trade_closed = 0;
			let trade_body = '';
			let steamid = 0;

			if (responseCode == 200) {
				// Trades are closed by marking them as NSFW (over-18)
				trade_closed = responseData[0].data.children[0].data.over_18;
				// Close it if body is [removed] (by mods) or [deleted] (by user)
				trade_body = responseData[0].data.children[0].data.selftext;
				// Get author flair, which is really their steam profile url
                var steamProfileLink = responseData[0].data.children[0].data.author_flair_text;
                if (steamProfileLink != null) {
                	// Just get the last part after / which is their steam64 id
                    steamid = steamProfileLink.split('/').pop();
                }

				if (trade_closed || trade_body == '[removed]' || trade_body == '[deleted]') {
					// mark as closed in DB
					trade_closed = 1;
                    updateTradeLiveData(trade_id, trade_closed, steamid);
				} else {
                	// Not closed but lets still update the steamid
                    updateTradeLiveData(trade_id, trade_closed, steamid);
				}
			}

			res.json({status: 1, closed: trade_closed, steamid: steamid});
		});

	} else {
		res.json({status: 0});
	}

};

function updateTradeLiveData(tradeid, closed, steamid) {
	mysql.getConnection(function (err, conn) {
		if (err || conn == 'undefined') {
			console.log('Error: Failed to conn to DB: ' + err);
		} else {
			conn.query('UPDATE trades SET closed=?, steamid=? WHERE id=?', [closed, steamid, tradeid], function () {
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
	mysql.getConnection(function (err, conn) {

		if (err || conn == 'undefined') {
			console.log('Error: Failed to conn to DB (select trades): ' + err);
		}

		let countSql = 'SELECT count(*) as num_rows FROM trades';

		// pagination
		let totalRec = 0, pageSize = 50, pageCount = 0, start = 0, currentPage = 1;

		conn.query(countSql, function (err, countrows, fields) {

			if (err || (fields == undefined)) {
				conn.release();
				console.log('Error: Failed while inserting trade into DB: ' + err);
			}
			totalRec = countrows[0]['num_rows'];
			pageCount = Math.ceil(totalRec /  pageSize);

			if (typeof req.query.page !== 'undefined')
				currentPage = req.query.page;

			if (currentPage > 1)
				start = (currentPage - 1) * pageSize;

			let selectSql =
				'SELECT id,username,steamid,type,closed,link,have,want,time ' +
				'FROM trades WHERE type IN (1,2,3) ' +
				'ORDER BY id DESC LIMIT '+start+' ,'+pageSize;

			conn.query(selectSql, function (err, trades) {

				conn.release();

				if (err || (trades == undefined)) {
					console.log('Error: Failed while selecting trades from DB: ' + err);
				}

				res.render('home', {
					title: '',
					trades: trades,

					// pagination
					pageSize: pageSize,
					pageCount: pageCount,
					currentPage: currentPage,
					searchShowStore: 1,
					darkMode: req.app.locals.darkMode
				});

			});
		});
	});
};