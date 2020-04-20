const mysql = require('mysql');

const conn = {
    mysql_pool: mysql.createPool({
        connectionLimit: 250,
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USERNAME,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        debug: false,
        supportBigNumbers: true,
    }),
};

module.exports = conn;
