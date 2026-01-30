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
const { createExchangeClient } = require('./services/paypal-currency-exchange');

// ==================================================
// SUPPORTED CURRENCIES
// ==================================================
// List of currencies supported by PayPal and available in checkout
const SUPPORTED_CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];

function validateCurrency(currencyCode) {
  if (!currencyCode || typeof currencyCode !== 'string') {
    return { valid: false, error: 'Currency code is required and must be a string' };
  }
  
  const code = currencyCode.toUpperCase().trim();
  if (!SUPPORTED_CURRENCIES.includes(code)) {
    return { valid: false, error: `Currency ${code} is not supported. Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}` };
  }
  
  return { valid: true, code };
}

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
    user: req.session.user || null,
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
    user: req.session.user || null,
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

// ---------- LOYALTY POINTS & COINS ----------
// Convert loyalty points to coins
app.post('/api/loyalty/convert-points', checkAuthenticated, userController.convertPointsToCoin);

// ---------- MY WALLET ----------
app.get('/account/wallet', checkAuthenticated, profileController.showWallet);
app.post('/account/wallet/topup', checkAuthenticated, profileController.topUpWallet);
app.post('/account/wallet/convert-points', checkAuthenticated, profileController.convertPointsToCoin);
app.post('/account/wallet/use-coins', checkAuthenticated, profileController.useCoins);
app.post('/account/wallet/redeem-voucher', checkAuthenticated, profileController.redeemVoucher);
app.get('/api/wallet', checkAuthenticated, profileController.getWalletAPI);

// ---------- VOUCHER API ----------
app.post('/api/voucher/validate', checkAuthenticated, (req, res) => {
  const { voucherCode } = req.body;
  const userId = req.session.user?.id;

  if (!voucherCode || !userId) {
    return res.json({ success: false, error: 'Invalid request' });
  }

  const Voucher = require('./Model/Voucher');
  Voucher.getVoucherByCode(voucherCode, userId, (err, results) => {
    if (err) {
      console.error('[Voucher API] Error fetching voucher:', err);
      return res.json({ success: false, error: 'Database error' });
    }

    if (!results || results.length === 0) {
      return res.json({ success: false, error: 'Voucher code not found' });
    }

    const voucher = results[0];

    // Check if voucher is already used
    if (voucher.isUsed) {
      return res.json({ success: false, error: 'Voucher has already been used' });
    }

    // Check if voucher is expired
    const expiryDate = new Date(voucher.expiryDate);
    const today = new Date();
    if (expiryDate < today) {
      return res.json({ success: false, error: 'Voucher has expired' });
    }

    // Voucher is valid
    res.json({ success: true, voucher });
  });
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

// ========== PayPal Payment Success Page ==========
app.get('/payment-success', checkAuthenticated, (req, res) => {
  const { orderId, transactionId, amount, paymentMethod, paymentCurrency } = req.query;
  
  console.log('[PAYMENT SUCCESS PAGE] Rendering success page:', {
    orderId,
    transactionId: transactionId ? transactionId.substring(0, 20) + '...' : 'N/A',
    amount,
    paymentMethod,
    paymentCurrency: paymentCurrency || 'SGD'
  });

  // Calculate estimated delivery (3-5 business days)
  const estimatedDelivery = new Date();
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 4); // 4 days from now
  const deliveryDateStr = estimatedDelivery.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Fetch order details to get item count
  if (orderId) {
    const itemCountQuery = `
      SELECT COUNT(*) as itemCount, SUM(quantity) as totalQuantity
      FROM order_items
      WHERE orderId = ?
    `;
    
    db.query(itemCountQuery, [orderId], (err, results) => {
      const itemCount = results && results[0] ? results[0].totalQuantity || 0 : 0;
      
      res.render('paymentSuccess', {
        user: req.session.user || null,
        orderId: orderId || null,
        transactionId: transactionId || null,
        amount: amount || null,
        paymentMethod: paymentMethod || 'unknown',
        paymentCurrency: paymentCurrency || 'SGD',
        itemCount: itemCount,
        estimatedDelivery: deliveryDateStr,
        orderDate: new Date()
      });
    });
  } else {
    res.render('paymentSuccess', {
      user: req.session.user || null,
      orderId: orderId || null,
      transactionId: transactionId || null,
      amount: amount || null,
      paymentMethod: paymentMethod || 'unknown',
      paymentCurrency: paymentCurrency || 'SGD',
      itemCount: 0,
      estimatedDelivery: deliveryDateStr,
      orderDate: new Date()
    });
  }
});

// ========== PayPal Payment Failed/Cancelled Page ==========
app.get('/payment-failed', checkAuthenticated, (req, res) => {
  const { reason, errorMessage, transactionId } = req.query;
  
  console.log('[PAYMENT FAILED PAGE] Rendering failure page:', {
    reason: reason || 'Unknown',
    transactionId: transactionId ? transactionId.substring(0, 20) + '...' : 'N/A'
  });

  res.render('paymentFailed', {
    user: req.session.user || null,
    reason: reason || 'Payment could not be processed',
    errorMessage: errorMessage || 'Please check your payment details and try again',
    transactionId: transactionId || null
  });
});

// PayPal capture callback
app.post('/orders/paypal-complete', async (req, res) => {
  try {
    console.log('\n[ROUTE] POST /orders/paypal-complete received');
    console.log('[ROUTE] Session user:', req.session.user ? { id: req.session.user.id, email: req.session.user.email } : 'NO SESSION');
    
    // Check authentication
    if (!req.session || !req.session.user) {
      console.error('[ROUTE] ✗ No valid session');
      return res.redirect('/payment-failed?reason=Not%20authenticated&errorMessage=Please%20log%20in%20first');
    }
    
    // Extract payment info including currency
    const { paypalOrderId, paymentCurrency, paymentAmount, fxId } = req.body;
    
    console.log('[ROUTE] Payment Currency:', paymentCurrency || 'SGD');
    console.log('[ROUTE] Payment Amount:', paymentAmount);
    

    console.log('[ROUTE] req.body:', req.body);
    console.log('[ROUTE] req.session.cart items:', req.session.cart ? Object.keys(req.session.cart.items).length : 0);
    
    if (!paypalOrderId) {
      console.error('[ROUTE] ERROR: No paypalOrderId in request body');
      return res.redirect('/payment-failed?reason=Invalid%20Request&errorMessage=Missing%20PayPal%20order%20ID');
    }
    
    console.log('[ROUTE] Browser already captured the payment. Fetching order details to get capture info...');
    const orderDetails = await paypal.getOrderDetails(paypalOrderId);
    
    console.log('[ROUTE] ✓ Order details received');
    console.log('[ROUTE] Order status:', orderDetails.status);
    
    if (orderDetails.status !== 'COMPLETED') {
      console.error('[ROUTE] ✗ Order not completed. Status:', orderDetails.status);
      return res.redirect(`/payment-failed?reason=Order%20Not%20Completed&errorMessage=PayPal%20order%20status%3A%20${orderDetails.status}&transactionId=${paypalOrderId}`);
    }
    
    console.log('[ROUTE] Delegating to orderController.payWithPaypal with order details containing capture info');
    // Pass response object with success/failure handlers
    orderController.payWithPaypal(req, res, orderDetails);
  } catch (err) {
    console.error('[ROUTE] CATCH ERROR in /orders/paypal-complete:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.redirect(`/payment-failed?reason=Server%20Error&errorMessage=${encodeURIComponent(err.message)}`);
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
          tab: req.query.tab || 'products',
          refundSuccess: req.query.refundSuccess === 'true' ? true : false,
          orderId: req.query.orderId || null
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
    const { amount, currency, fxId } = req.body;
    
    console.log('[PAYPAL API] Creating order:', { amount, currency: currency || 'SGD', fxId, amountType: typeof amount });
    
    if (!amount) {
      console.error('[PAYPAL API] ✗ No amount provided');
      return res.status(400).json({ error: 'Amount is required' });
    }
    
    // Validate currency
    const currencyValidation = validateCurrency(currency || 'SGD');
    if (!currencyValidation.valid) {
      console.error('[PAYPAL API] ✗ Invalid currency:', currencyValidation.error);
      return res.status(400).json({ error: currencyValidation.error });
    }
    
    const paymentCurrency = currencyValidation.code;
    console.log('[PAYPAL API] ✓ Currency validated:', paymentCurrency);
    
    // Create order with fxId if provided (for rate locking)
    const order = await paypal.createOrder(String(amount), paymentCurrency, fxId || null);
    console.log('[PAYPAL API] PayPal response:', order);
    
    if (order && order.id) {
      res.json({ id: order.id });
    } else {
      console.error('[PAYPAL API] ✗ No order ID in response:', order);
      res.status(500).json({ error: 'Failed to create PayPal order', details: order });
    }
  } catch (err) {
    console.error('[PAYPAL API] ✗ Error:', err.message);
    console.error('[PAYPAL API] Stack:', err);
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

// ---------- PAYPAL CURRENCY EXCHANGE ----------
app.post('/api/paypal/exchange-rate', async (req, res) => {
  try {
    console.log('\n[ROUTE] POST /api/paypal/exchange-rate received');
    
    const { baseCurrency, targetCurrency, amount } = req.body;
    
    if (!baseCurrency || !targetCurrency || !amount) {
      console.error('[ROUTE] Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required parameters: baseCurrency, targetCurrency, amount' 
      });
    }

    // Validate both currencies
    const baseCurrencyValidation = validateCurrency(baseCurrency);
    const targetCurrencyValidation = validateCurrency(targetCurrency);
    
    if (!baseCurrencyValidation.valid) {
      console.error('[ROUTE] Invalid base currency:', baseCurrencyValidation.error);
      return res.status(400).json({ error: baseCurrencyValidation.error });
    }
    
    if (!targetCurrencyValidation.valid) {
      console.error('[ROUTE] Invalid target currency:', targetCurrencyValidation.error);
      return res.status(400).json({ error: targetCurrencyValidation.error });
    }

    console.log('[ROUTE] Fetching exchange rate:', { 
      baseCurrency: baseCurrencyValidation.code, 
      targetCurrency: targetCurrencyValidation.code, 
      amount 
    });

    // Create exchange client with fresh access token
    const exchangeClient = await createExchangeClient();
    
    // Get exchange rate
    const result = await exchangeClient.getExchangeRate(baseCurrencyValidation.code, targetCurrencyValidation.code, amount.toString());

    if (!result.success) {
      console.error('[ROUTE] ✗ Failed to get exchange rate:', result.error);
      console.error('[ROUTE] Full result:', result);
      return res.status(500).json({ 
        error: result.error,
        details: result.response || result
      });
    }

    console.log('[ROUTE] ✓ Exchange rate retrieved successfully');
    console.log('[ROUTE] Rate:', result.exchangeRate);

    res.json(result);
  } catch (err) {
    console.error('[ROUTE] ERROR in /api/paypal/exchange-rate:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'Failed to get exchange rate',
      message: err.message
    });
  }
});

app.post('/api/paypal/create-exchange-quote', async (req, res) => {
  try {
    console.log('\n[ROUTE] POST /api/paypal/create-exchange-quote received');
    
    const { baseCurrency, baseAmount, quoteCurrency, markupPercent } = req.body;
    
    if (!baseCurrency || !baseAmount || !quoteCurrency) {
      console.error('[ROUTE] Missing required parameters');
      return res.status(400).json({ 
        error: 'Missing required parameters: baseCurrency, baseAmount, quoteCurrency' 
      });
    }

    console.log('[ROUTE] Creating exchange quote:', { baseCurrency, baseAmount, quoteCurrency });

    // Create exchange client with fresh access token
    const exchangeClient = await createExchangeClient();
    
    // Create quote
    const result = await exchangeClient.createExchangeQuote({
      baseCurrency,
      baseAmount: baseAmount.toString(),
      quoteCurrency,
      markupPercent: markupPercent || '0'
    });

    if (!result.success) {
      console.error('[ROUTE] ✗ Failed to create exchange quote:', result.error);
      return res.status(500).json({ error: result.error });
    }

    console.log('[ROUTE] ✓ Exchange quote created successfully');
    console.log('[ROUTE] Quote ID:', result.id);

    res.json(result);
  } catch (err) {
    console.error('[ROUTE] ERROR in /api/paypal/create-exchange-quote:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'Failed to create exchange quote',
      message: err.message
    });
  }
});

app.get('/api/paypal/exchange-quote/:fxId', async (req, res) => {
  try {
    console.log('\n[ROUTE] GET /api/paypal/exchange-quote/:fxId received');
    
    const { fxId } = req.params;
    
    if (!fxId) {
      console.error('[ROUTE] Missing FX ID');
      return res.status(400).json({ error: 'FX ID is required' });
    }

    console.log('[ROUTE] Retrieving exchange quote:', fxId);

    // Create exchange client with fresh access token
    const exchangeClient = await createExchangeClient();
    
    // Get quote
    const result = await exchangeClient.getExchangeQuote(fxId);

    if (!result.success) {
      console.error('[ROUTE] ✗ Failed to get exchange quote:', result.error);
      return res.status(500).json({ error: result.error });
    }

    console.log('[ROUTE] ✓ Exchange quote retrieved successfully');

    res.json(result);
  } catch (err) {
    console.error('[ROUTE] ERROR in /api/paypal/exchange-quote/:fxId:', {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'Failed to get exchange quote',
      message: err.message
    });
  }
});

// ==================================================
// SERVER START
// ==================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
