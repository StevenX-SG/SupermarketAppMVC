const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const Product = require('./Model/Product');
const app = express();

// CONTROLLERS
const userController = require('./Controller/UserController');
const productController = require('./Controller/ProductController');
const cartController = require('./Controller/CartController');
const profileController = require('./Controller/profileController');
const orderController = require('./Controller/OrderController');
const wishlistController = require('./Controller/WishlistController');

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
app.use(express.json());

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
app.get('/', (req, res) => {
  Product.getAllProducts((err, products) => {
    if (err) return res.status(500).send('Error loading products');

    const featured = products.slice(0, 4); // limit to 8 items
    res.render('index', {
      user: req.session.user || null,
      products: featured
    });
  });
});

// ---------- AUTH ----------
app.get('/register', (req, res) => {
  res.render('register', {
    messages: req.flash('error'),
    formData: req.flash('formData')[0]
  });
});

app.post('/register', validateRegistration, (req, res) => {
  const { username, email, password, address, contact, role } = req.body;
  const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
  db.query(sql, [username, email, password, address, contact, role], (err) => {
    if (err) throw err;
    req.flash('success', 'Registration successful! Please log in.');
    res.redirect('/login');
  });
});

app.get('/login', (req, res) => {
  res.render('login', {
    messages: req.flash('success'),
    errors: req.flash('error')
  });
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
      if (req.session.user.role === 'user') {
        res.redirect('/shopping');
      } else {
        res.redirect('/inventory');
      }
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

// ---------- PROFILE ----------
app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  profileController.showProfile(req, res);
});

app.post('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  profileController.updateProfile(req, res);
});

// ---------- USERS (ADMIN) ----------
app.get('/users', checkAuthenticated, checkAdmin, userController.getAllUsers);
app.get('/users/add', checkAuthenticated, checkAdmin, userController.showAddForm);
app.post('/users/add', checkAuthenticated, checkAdmin, userController.addUser);
app.get('/users/edit/:id', checkAuthenticated, checkAdmin, userController.showEditForm);
app.post('/users/edit/:id', checkAuthenticated, checkAdmin, userController.updateUser);
app.post('/users/delete/:id', checkAuthenticated, checkAdmin, userController.deleteUser);

// ---------- SHOPPING ----------
app.get('/search', productController.getAllProducts);
app.get('/shopping',productController.getAllProducts);
app.get('/product/:id',productController.getProductById);

// ---------- ADMIN PRODUCT MANAGEMENT ----------
app.get('/inventory', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }

  const sql = 'SELECT * FROM products';
  db.query(sql, (err, products) => {
    if (err) return res.send('Error loading products');

    res.render('inventory', {
      products,
      user: req.session.user
    });
  });
});

app.get('/addProduct', checkAuthenticated, checkAdmin, productController.showAddForm);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), productController.addProduct);

app.get('/editProduct/:id', checkAuthenticated, checkAdmin, productController.showEditForm);
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, productController.showEditForm);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), productController.updateProduct);
app.post('/deleteProduct/:id', checkAuthenticated, checkAdmin, productController.deleteProduct);

// ---------- CART ----------
app.get('/cart', checkAuthenticated, cartController.getCart);
app.post('/add-to-cart/:id', checkAuthenticated, cartController.addToCart);
app.post('/cart/update/:id', checkAuthenticated, cartController.updateCartItem);
app.post('/cart/remove/:id', checkAuthenticated, cartController.removeCartItem);
app.post('/cart/clear', checkAuthenticated, cartController.clearCart);
// New: show checkout page
app.get('/checkout', checkAuthenticated, cartController.showCheckout);
app.post('/checkout', checkAuthenticated, orderController.createOrderFromCart);

// ---------- ORDERS ----------
app.get('/orders', checkAuthenticated, orderController.getOrdersByUser);
app.get('/orders/:id', checkAuthenticated, orderController.getOrderDetails);
// Admin: update order status
app.post('/orders/updateStatus/:id',checkAuthenticated,checkAdmin,orderController.updateOrderStatus);
app.post('/orders/delete/:id',checkAuthenticated,checkAdmin,orderController.deleteOrder);
// ---------- WISHLIST ----------
app.get('/wishlist', checkAuthenticated, wishlistController.getWishlist);
app.post('/wishlist/add/:id', checkAuthenticated, wishlistController.addToWishlist);
app.post('/wishlist/remove/:id', checkAuthenticated, wishlistController.removeFromWishlist);
app.post('/wishlist/add-to-cart/:wishlistId/:productId',checkAuthenticated,wishlistController.addToCartAndRemove);


// ---------- ADMIN DASHBOARD ----------
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
  const usersQuery = 'SELECT * FROM users';
  const productsQuery = 'SELECT * FROM products';
  const ordersQuery = `
    SELECT o.id, o.userId, o.totalAmount, o.status, o.createdAt, u.username
    FROM orders o
    JOIN users u ON o.userId = u.id
    ORDER BY o.createdAt DESC
  `;

  db.query(usersQuery, (err, users) => {
    if (err) return res.send('Error loading users');

    db.query(productsQuery, (err2, products) => {
      if (err2) return res.send('Error loading products');

      db.query(ordersQuery, (err3, orders) => {
        if (err3) return res.send('Error loading orders');

        res.render('adminDashboard', {
          user: req.session.user,
          users,
          products,
          orders,
          tab: req.query.tab || 'products'
        });
      });
    });
  });
});

// ---------- INVOICE ----------
app.get('/invoice/:orderId', checkAuthenticated, checkAdmin, (req, res) => {
  const orderId = req.params.orderId;

  const orderQuery = 'SELECT * FROM orders WHERE id = ?';
  const itemsQuery = `
    SELECT oi.*, p.productName, p.image
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    WHERE orderId = ?
  `;

  db.query(orderQuery, [orderId], (err, orderRows) => {
    if (err || !orderRows.length) return res.send('Order not found');

    const order = orderRows[0];

    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) return res.send('Error loading order items');

      // Compute subtotal, gst, grandTotal from items
      let subtotal = 0;
      (items || []).forEach(it => {
        subtotal += Number(it.price) * Number(it.quantity);
      });

      const gstRate = 0.09; // 9% GST
      const gst = subtotal * gstRate;
      const grandTotal = subtotal + gst;

      res.render('invoice', {
        order,
        items,
        subtotal,
        gst,
        grandTotal,
        user: req.session.user
      });
    });
  });
});
// ---------- USER INVOICE ----------
app.get('/my-invoice/:orderId', checkAuthenticated, orderController.getUserInvoice);


// ==================================================
// SERVER START
// ==================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
