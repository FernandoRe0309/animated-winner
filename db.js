const connection = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost', // <--- IMPORTANTE
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'shop_db',
    port: process.env.MYSQLPORT || 3306
});
