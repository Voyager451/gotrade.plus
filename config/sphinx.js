const mysql = require('mysql');

const conn = {
	sphinx_pool : mysql.createPool({
		connectionLimit : 250,
		host            : process.env.SPHINX_HOST,
		port            : process.env.SPHINX_PORT,
		debug           :  false,
		supportBigNumbers : true
	})
};

module.exports = conn;