// 1. IMPORTANTE: Estas líneas deben ir al principio
const mysql = require('mysql2'); 
require('dotenv').config();

// 2. Configuración de la conexión
const connection = mysql.createConnection({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'shop_db',
    port: process.env.MYSQLPORT || 3306
});

// 3. Conectar
connection.connect((err) => {
    if (err) {
        console.error('Error conectando a MySQL:', err);
        return;
    }
    console.log('Conectado a la base de datos MySQL');
});

module.exports = connection;
