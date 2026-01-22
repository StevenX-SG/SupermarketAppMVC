const express = require('express');
const mysql = require('mysql2');
const bodyParser = require("body-parser");
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const Product = require('./Model/Product');
const netsQr= require("./services/nets");
const axios = require('axios');
const app = express();

// CONTROLLERS
const userController = require('./Controller/UserController');
const productController = require('./Controller/ProductController');
const cartController = require('./Controller/CartController');
const profileController = require('./Controller/profileController');
const orderController = require('./Controller/OrderController');
const wishlistController = require('./Controller/WishlistController');
const paypal = require('./services/paypal');

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
  password: 'Republic_C207',
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
app.use(bodyParser.json());
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
// PayPal capture callback
app.post('/orders/paypal-complete', async (req, res) => {
  try {
    console.log('\n[ROUTE] POST /orders/paypal-complete received');
    console.log('[ROUTE] Session user:', req.session.user ? { id: req.session.user.id, email: req.session.user.email } : 'NO SESSION');
    
    // Check authentication
    if (!req.session || !req.session.user) {
      console.error('[ROUTE] ✗ No valid session');
      return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
    }
    
    console.log('[ROUTE] req.body:', req.body);
    console.log('[ROUTE] req.session.cart items:', req.session.cart ? Object.keys(req.session.cart.items).length : 0);
    
    const { paypalOrderId } = req.body;
    if (!paypalOrderId) {
      console.error('[ROUTE] ERROR: No paypalOrderId in request body');
      return res.status(400).json({ error: 'Missing paypalOrderId' });
    }
    
    console.log('[ROUTE] Browser already captured the payment. Fetching order details to get capture info...');
    const orderDetails = await paypal.getOrderDetails(paypalOrderId);
    
    console.log('[ROUTE] ✓ Order details received');
    console.log('[ROUTE] Order status:', orderDetails.status);
    
    if (orderDetails.status !== 'COMPLETED') {
      console.error('[ROUTE] ✗ Order not completed. Status:', orderDetails.status);
      return res.status(400).json({ 
        error: 'Order not completed',
        received_status: orderDetails.status,
        details: orderDetails
      });
    }
    
    console.log('[ROUTE] Delegating to orderController.payWithPaypal with order details containing capture info');
    orderController.payWithPaypal(req, res, orderDetails);
  } catch (err) {
    console.error('[ROUTE] CATCH ERROR in /orders/paypal-complete:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});
// Admin: update order status
app.post('/orders/updateStatus/:id',checkAuthenticated,checkAdmin,orderController.updateOrderStatus);
app.post('/orders/delete/:id',checkAuthenticated,checkAdmin,orderController.deleteOrder);
// Customer: request refund
app.post('/orders/:id/refund-request', checkAuthenticated, orderController.requestRefund);
// Admin: approve refund
app.post('/admin/orders/:id/refund-approve', checkAuthenticated, checkAdmin, orderController.approveRefund);
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

  const orderQuery = `
    SELECT o.* 
    FROM orders o
    WHERE o.id = ?
  `;
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

// ---------- PAYPAL API ----------
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await paypal.createOrder(amount);
    if (order && order.id) {
      res.json({ id: order.id });
    } else {
      res.status(500).json({ error: 'Failed to create PayPal order', details: order });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
  }
});

app.post('/api/paypal/capture-order', async (req, res) => {
  try {
    console.log('\n>>> POST /api/paypal/capture-order received');
    const { orderID, localOrderId } = req.body; // localOrderId = your MySQL order.id
    console.log('Request body:', { orderID, localOrderId });
    
    console.log('Calling paypal.captureOrder with orderID:', orderID);
    const capture = await paypal.captureOrder(orderID);
    
    console.log('PayPal captureOrder response received:', {
      status: capture.status,
      id: capture.id,
      httpStatusCode: capture.httpStatusCode
    });

    if (capture.status === 'COMPLETED') {
      console.log('Payment status is COMPLETED. Delegating to orderController.payWithPaypal\n');
      // Delegate to a controller method that marks your supermarket order as paid
      await orderController.payWithPaypal(req, res, capture, localOrderId);
    } else {
      const msg = 'Payment not completed. Status: ' + capture.status;
      console.error('ERROR: ' + msg);
      console.error('Full response:', capture);
      res.status(400).json({ 
        error: msg,
        details: capture,
        received_status: capture.status
      });
    }
  } catch (err) {
    console.error('EXCEPTION in /api/paypal/capture-order:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ 
      error: 'Failed to capture PayPal order', 
      message: err.message,
      exception: true
    });
  }
});

// ---------- USER INVOICE ----------
app.get('/my-invoice/:orderId', checkAuthenticated, orderController.getUserInvoice);

//-----------Nets QR code payment-----------
app.post('/generateNETSQR', netsQr.generateQrCode);

app.get("/nets-qr/success", checkAuthenticated, (req, res) => {
    // For GET request, we need to set paymentMethod via body manually
    // because GET requests don't have a traditional body
    req.body = { paymentMethod: 'NETS' };
    // Call controller to create order and show success page
    orderController.netsQrSuccess(req, res);
});

app.get("/nets-qr/fail", (req, res) => {
    res.render('netsTxnFailStatus', { message: 'Transaction Failed. Please try again.' });
})

app.get('/401', (req, res) => {
    res.render('401', { errors: req.flash('error') });
});

app.get('/sse/payment-status/:txnRetrievalRef', async (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const txnRetrievalRef = req.params.txnRetrievalRef;
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes if polling every 5s
    let frontendTimeoutStatus = 0;

    const interval = setInterval(async () => {
        pollCount++;

        try {
            // Call the NETS query API
            const response = await axios.post(
                'https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query',
                { txn_retrieval_ref: txnRetrievalRef, frontend_timeout_status: frontendTimeoutStatus },
                {
                    headers: {
                        'api-key': process.env.API_KEY,
                        'project-id': process.env.PROJECT_ID,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("Polling response:", response.data);
            // Send the full response to the frontend
            res.write(`data: ${JSON.stringify(response.data)}\n\n`);
        
          const resData = response.data.result.data;

            // Decide when to end polling and close the connection
            //Check if payment is successful
            if (resData.response_code == "00" && resData.txn_status === 1) {
                // Payment success: send a success message
                res.write(`data: ${JSON.stringify({ success: true })}\n\n`);
                clearInterval(interval);
                res.end();
            } else if (frontendTimeoutStatus == 1 && resData && (resData.response_code !== "00" || resData.txn_status === 2)) {
                // Payment failure: send a fail message
                res.write(`data: ${JSON.stringify({ fail: true, ...resData })}\n\n`);
                clearInterval(interval);
                res.end();
            }

        } catch (err) {
            clearInterval(interval);
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }


        // Timeout
        if (pollCount >= maxPolls) {
            clearInterval(interval);
            frontendTimeoutStatus = 1;
            res.write(`data: ${JSON.stringify({ fail: true, error: "Timeout" })}\n\n`);
            res.end();
        }
    }, 5000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// ==================================================
// SERVER START
// ==================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
