const sphinx = require('../config/sphinx.js').sphinx_pool;
const helpers = require('../helpers.js');

function getSqlQueries(trade_type,query,show_store) {

	// escape query then remove single quotes (creates sphinx syntax error)
	query = sphinx.escape(query).split("'").join("");

	let countSql = 'SELECT count(*) as num_rows FROM gotrade WHERE type ';
	let selectSql = 'SELECT id,username,steamid,type,closed,link,have,want,time FROM gotrade WHERE type ';
	let _end = '';

	if (trade_type == 1) {
		// Query For: have || store (can be both type 1 and 3)

		if (show_store) {
			_end = 'IN (1,3) ';
		} else {
			_end = 'IN (1) ';
		}

		_end += 'AND MATCH(\'@(have) '+query+'\')';

	}  else if (trade_type == 2) {
		// Query For: want (can be both type 1 and 2)
		_end = 'IN (1,2) AND MATCH(\'@(want) '+query+'\')';

	} else if (trade_type == 4) {
		// Query For: price check
		_end = '=4 AND MATCH(\'@(have) '+query+'\')';
	}

	countSql += _end;
	selectSql += _end;

	return {countSql: countSql, selectSql: selectSql}
}

/**
 * GET /search
 * Search page
 */
exports.index = (req, res) => {

	let trade_type = req.query.type;
	const query = req.query.q;
	let raw_query = encodeURIComponent(query);
	let error_msg = '';

	// trade_type must be between 1 to 4
	if (trade_type == undefined || trade_type < 1 || trade_type > 4 || trade_type == 3 || trade_type == null) {
		error_msg = 'Invalid search (type) option 🤖';
	}

	// query must be 2 or more characters
	if (query == undefined || query.length < 2 || query == null) {
		error_msg = 'Search query must be 2 or more characters 🤖';
	}

	if (error_msg != '') {

		res.render('home', {
			title: '',
			trades: {},
			errorMsg: error_msg,
			searchQuery: query,
			searchType: trade_type,
			darkMode: req.app.locals.darkMode
		});
		return false;

	} else {

		// Search for query in database
		sphinx.getConnection(function (err, conn) {

			if (err || conn == 'undefined') {
				console.log('Error: Failed to conn to DB (search trades): ' + err);
			}

			let show_store = 0;
			if (
				typeof req.query.show_store != 'undefined'
				&& (req.query.show_store == 1 || req.query.show_store == 'on')
			) {
				show_store = 1;
			}

			let sqlQueries = getSqlQueries(trade_type,query,show_store);
			let countSql = sqlQueries.countSql;
			let selectSql = sqlQueries.selectSql;

			// pagination
			let totalResult = 0, pageSize = 50, pageCount = 0, start = 0, currentPage = 1;

			countSql += ' ORDER BY id DESC';

			let render_data = {
				title: '',
				trades: {},
				pageSize: pageSize,
				pageCount: pageCount,
				currentPage: currentPage,
				totalResult: totalResult,
				searchQueryRaw: raw_query,
				searchQuery: query,
				searchType: trade_type,
				searchShowStore: show_store,
				darkMode: req.app.locals.darkMode
			};

			conn.query(countSql, function (err, countrows, fields) {

				if (err || (fields == undefined)) {
					conn.release();
					console.log('DB Error: Failed while selecting search: ' + err);
					res.render('home', render_data);
					return false;
				}

				totalResult = countrows[0]['num_rows'];
				pageCount = Math.ceil(totalResult / pageSize);

				if (typeof req.query.page !== 'undefined')
					currentPage = req.query.page;

				if (currentPage > 1)
					start = (currentPage - 1) * pageSize;

				selectSql += ' ORDER BY id DESC LIMIT ' + start + ' ,' + pageSize;

				conn.query(selectSql, function (err, trades) {

					conn.release();

					if (err || (trades == undefined)) {
						console.log('DB Error: Failed while selecting search: ' + err);
						res.render('home', render_data);
						return false;
					}

					render_data.totalResult = totalResult;
					render_data.pageCount = pageCount;
					render_data.currentPage = currentPage;
					render_data.trades = trades;
					res.render('home', render_data);
					return false;
				});
			});
		});
	}
};

exports.ajax = (req, res) => {

	let type = req.body.type;
	let query = helpers.decodeURIPlus(req.body.query);

	// validate data
	if (
		type == undefined || type < 1 || type > 4 || type == 3 || type == null
		|| query == undefined || query.length < 2 || query == null
	) {
		res.json({status: 0});
		return false;
	}

	sphinx.getConnection(function (err, conn) {

		if (err || conn == 'undefined') {
			console.log('Error: Failed to conn to DB: ' + err);
			res.json({status: 0});
			return false;
		}

		let show_store = 0;
		if (typeof req.body.show_store != 'undefined' && req.body.show_store == 1) {
			show_store = 1;
		}

		let sqlQueries = getSqlQueries(type,query,show_store);
		let countSql = sqlQueries.countSql;

		conn.query(countSql, function (err, countrows, fields) {

			conn.release();

			if (err || (fields == undefined) || (countrows == undefined)) {

				console.log('DB Error: Failed while counting search trades: ' + err);
				res.json({status: 0});
				return false;

			} else {

				// success
				res.json({
					status: 1,
					count: countrows[0]['num_rows']
				});

				return false;
			}

		});
	});

};