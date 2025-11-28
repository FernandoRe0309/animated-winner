const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const db = require('./db');

const app = express();

// Configuraciones
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configuración de Sesión
app.use(session({
    secret: 'mi_secreto_super_seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // false para http (localhost)
}));

// Middleware para usuario logueado
const isAuth = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

// --- RUTAS ---

// 1. Catálogo (Home)
app.get('/', (req, res) => {
    db.query('SELECT * FROM products', (err, products) => {
        if (err) throw err;
        res.render('index', { 
            products, 
            user: req.session.user, 
            cartCount: req.session.cart ? req.session.cart.length : 0 
        });
    });
});

// 2. Login y Registro
app.get('/login', (req, res) => {
    res.render('login', { message: null, user: req.session.user });
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8);
    
    db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
    [username, email, hashedPassword], (err, result) => {
        if (err) {
            return res.render('login', { message: 'El correo ya existe', user: null });
        }
        res.render('login', { message: 'Registro exitoso, inicia sesión', user: null });
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.render('login', { message: 'Credenciales incorrectas', user: null });
        }
        req.session.user = results[0];
        req.session.cart = []; // Iniciar carrito vacío
        res.redirect('/');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. Gestión del Carrito (API para AJAX)
app.post('/add-to-cart', (req, res) => {
    if (!req.session.cart) req.session.cart = [];
    const { id, name, price, image } = req.body;
    
    const existingProduct = req.session.cart.find(item => item.id == id);
    if (existingProduct) {
        existingProduct.quantity++;
    } else {
        req.session.cart.push({ id, name, price: parseFloat(price), image, quantity: 1 });
    }
    res.json({ success: true, cartCount: req.session.cart.length });
});

app.get('/cart', (req, res) => {
    const cart = req.session.cart || [];
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    res.render('cart', { cart, total, user: req.session.user });
});

app.post('/update-cart', (req, res) => {
    const { id, action } = req.body;
    const cart = req.session.cart;
    const itemIndex = cart.findIndex(item => item.id == id);

    if (itemIndex > -1) {
        if (action === 'increase') cart[itemIndex].quantity++;
        if (action === 'decrease') {
            cart[itemIndex].quantity--;
            if (cart[itemIndex].quantity <= 0) cart.splice(itemIndex, 1);
        }
        if (action === 'remove') cart.splice(itemIndex, 1);
    }
    
    req.session.cart = cart;
    const newTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    res.json({ success: true, cart, total: newTotal });
});

// 4. Checkout y PDF
app.post('/checkout', isAuth, (req, res) => {
    const cart = req.session.cart;
    if (!cart || cart.length === 0) return res.redirect('/cart');

    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const userId = req.session.user.id;

    // Insertar Orden
    db.query('INSERT INTO orders (user_id, total) VALUES (?, ?)', [userId, total], (err, result) => {
        if (err) throw err;
        const orderId = result.insertId;

        // Insertar Items
        const items = cart.map(item => [orderId, item.id, item.quantity, item.price]);
        db.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?', [items], (err) => {
            if (err) throw err;
            
            // Generar PDF
            const doc = new PDFDocument();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=ticket_${orderId}.pdf`);
            
            doc.pipe(res);
            doc.fontSize(20).text('Ticket de Compra - Tienda Online', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Orden ID: ${orderId}`);
            doc.text(`Cliente: ${req.session.user.username}`);
            doc.text(`Fecha: ${new Date().toLocaleString()}`);
            doc.moveDown();
            
            cart.forEach(item => {
                doc.text(`${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`);
            });
            
            doc.moveDown();
            doc.fontSize(16).text(`Total Pagado: $${total.toFixed(2)}`, { align: 'right' });
            doc.end();

            // Limpiar carrito
            req.session.cart = [];
        });
    });
});

// 5. Historial de Compras
app.get('/history', isAuth, (req, res) => {
    const userId = req.session.user.id;
    // Consulta JOIN para obtener productos por orden
    const sql = `
        SELECT o.id as order_id, o.date, o.total, p.name, oi.quantity, oi.price 
        FROM orders o 
        JOIN order_items oi ON o.id = oi.order_id 
        JOIN products p ON oi.product_id = p.id 
        WHERE o.user_id = ? 
        ORDER BY o.date DESC`;
        
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;
        
        // Agrupar resultados por orden
        const orders = {};
        results.forEach(row => {
            if (!orders[row.order_id]) {
                orders[row.order_id] = { id: row.order_id, date: row.date, total: row.total, items: [] };
            }
            orders[row.order_id].items.push({ name: row.name, quantity: row.quantity, price: row.price });
        });
        
        res.render('history', { orders, user: req.session.user });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});