const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');

const app = express();

// CONTROLLERS
const userController = require('./Controller/UserController');
const productController = require('./Controller/ProductController');
const cartController = require('./Controller/CartController');
const profileController = require('./Controller/profileController');

// MIDDLEWARE
const {
  checkAuthenticated,
  checkAdmin,
  validateRegistration
} = require('./middleware');

// ==================================================
// MYSQL CONNECTION
// ==================================================

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345678',
  database: 'c372_supermarketdb'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// ==================================================
// MULTER IMAGE UPLOAD
// ==================================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// ==================================================
// APP SETTINGS
// ==================================================
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));

app.use(flash());

// Make session user available to all views
app.use(function (req, res, next) {
  res.locals.user = req.session.user;
  next();
});

// ==================================================
// ROUTES
// ==================================================

// ---------- HOME ----------
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

// ---------- AUTH ----------
app.get('/register', (req, res) => {
  res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
  const { username, email, password, address, contact, role } = req.body;
  const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
  db.query(sql, [username, email, password, address, contact, role], (err, result) => {
    if (err) throw err;
    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
  });
});

app.get('/login', (req, res) => {
  res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }
  const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
  db.query(sql, [email, password], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      req.session.user = results[0];
      if (req.session.user.role === 'user') res.redirect('/shopping');
      else res.redirect('/inventory');
    } else {
      req.flash('error', 'Invalid email or password.');
      res.redirect('/login');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  profileController.showProfile(req, res);
});

app.post('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  profileController.updateProfile(req, res);
});

app.get('/users', checkAuthenticated, checkAdmin, userController.getAllUsers);
app.get('/users/add', checkAuthenticated, checkAdmin, userController.showAddForm);
app.post('/users/add', checkAuthenticated, checkAdmin, userController.addUser);
app.get('/users/edit/:id', checkAuthenticated, checkAdmin, userController.showEditForm);
app.post('/users/edit/:id', checkAuthenticated, checkAdmin, userController.updateUser);
app.post('/users/delete/:id', checkAuthenticated, checkAdmin, userController.deleteUser);

// ---------- SHOPPING ----------
app.get('/shopping', checkAuthenticated, productController.getAllProducts);
app.get('/product/:id', checkAuthenticated, productController.getProductById);

// ---------- ADMIN PRODUCT MANAGEMENT ----------
app.get('/inventory', (req, res) => {
  // Only allow admin
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }

  // Fetch all products
  const sql = 'SELECT * FROM products';
  db.query(sql, (err, products) => {
    if (err) return res.send('Error loading products');

    // Render inventory page with user info
    res.render('inventory', {
      products: products,
      user: req.session.user
    });
  });
});

app.get('/addProduct', checkAuthenticated, checkAdmin, productController.showAddForm);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), productController.addProduct);

app.get('/editProduct/:id', checkAuthenticated, checkAdmin, productController.showEditForm);
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, productController.showEditForm); // optional GET for /updateProduct
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), productController.updateProduct);

app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, productController.deleteProduct);

// ---------- CART ----------
app.get('/cart', checkAuthenticated, cartController.getCart);
app.post('/add-to-cart/:id', checkAuthenticated, cartController.addToCart);
app.post('/cart/update/:id', checkAuthenticated, cartController.updateCartItem);
app.post('/cart/remove/:id', checkAuthenticated, cartController.removeCartItem);
app.post('/cart/clear', checkAuthenticated, cartController.clearCart);
app.post('/checkout', checkAuthenticated, cartController.checkout);

// ==================================================
// SERVER START
// ==================================================
const PORT = 3000;
app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
