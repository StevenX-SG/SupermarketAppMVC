const Order = require('../Model/Order');
const Cart = require('../Model/Cart');
const Product = require('../Model/Product');
const Voucher = require('../Model/Voucher');
const db = require('../db');
const paypalService = require('../services/paypal');

// ================= Request Refund (Customer) =================
exports.requestRefund = (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user?.id;
  const { refundReason, refundNotes } = req.body;

  console.log('[OrderController.requestRefund] Refund request initiated:', {
    orderId,
    userId,
    refundReason,
    refundNotes: refundNotes ? refundNotes.substring(0, 50) + '...' : '(empty)'
  });

  // Verify order belongs to user
  Order.getOrdersByUser(userId, (err, orders) => {
    if (err) {
      console.error('[OrderController.requestRefund] ✗ Failed to fetch orders:', err.message);
      return res.status(500).send('Error fetching orders');
    }

    const order = (orders || []).find(o => o.id == orderId);
    if (!order) {
      console.error('[OrderController.requestRefund] ✗ Order not found for user:', { orderId, userId });
      return res.status(403).send('Order not found or unauthorized');
    }

    // Check if order is eligible for refund (must be Delivered)
    if (order.status !== 'Delivered') {
      console.warn('[OrderController.requestRefund] ✗ Order not eligible for refund:', {
        orderId,
        currentStatus: order.status
      });
      return res.status(400).send('Only delivered orders can be refunded');
    }

    // Validate refund reason
    if (!refundReason) {
      console.warn('[OrderController.requestRefund] ✗ No refund reason provided');
      return res.status(400).send('Refund reason is required');
    }

    // Update order status to "Refund Requested" with reason and notes
    Order.requestRefund(orderId, refundReason, refundNotes || '', (err, result) => {
      if (err) {
        console.error('[OrderController.requestRefund] ✗ Failed to update status:', err.message);
        return res.status(500).send('Error requesting refund');
      }

      console.log('[OrderController.requestRefund] ✓ Refund requested successfully:', {
        orderId,
        newStatus: 'Refund Requested',
        reason: refundReason
      });
      res.redirect('/orders');
    });
  });
};

// ================= Approve Refund (Admin) =================
exports.approveRefund = (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user?.id;

  console.log('\n[Admin.approveRefund] ╔════════════════════════════════════════╗');
  console.log('[Admin.approveRefund] ║ REFUND APPROVAL WORKFLOW STARTED      ║');
  console.log('[Admin.approveRefund] ╚════════════════════════════════════════╝');
  console.log('[Admin.approveRefund] Request details:', {
    orderId,
    adminId: userId,
    timestamp: new Date().toISOString()
  });

  // Step 1: Fetch order to verify it's in "Refund Requested" status
  console.log('[Admin.approveRefund] Step 1: Fetching order details...');
  Order.getOrderDetailsOnly(orderId, (err, order) => {
    if (err) {
      console.error('[Admin.approveRefund] ✗ Step 1 FAILED: Could not fetch order:', err.message);
      return res.status(500).send('Error fetching order');
    }

    if (!order) {
      console.error('[Admin.approveRefund] ✗ Step 1 FAILED: Order not found:', { orderId });
      return res.status(404).send('Order not found');
    }

    console.log('[Admin.approveRefund] ✓ Step 1 complete: Order found');
    console.log('[Admin.approveRefund]   Order details:', {
      id: order.id,
      userId: order.userId,
      status: order.status,
      totalAmount: order.totalAmount
    });

    // Check if order is in "Refund Requested" status
    if (order.status !== 'Refund Requested') {
      console.error('[Admin.approveRefund] ✗ Step 1 validation FAILED: Invalid status:', {
        orderId,
        currentStatus: order.status,
        expectedStatus: 'Refund Requested'
      });
      return res.status(400).send('Only orders with "Refund Requested" status can be approved');
    }

    // Check if order is already refunded (double refund prevention)
    if (order.status === 'Refunded') {
      console.warn('[Admin.approveRefund] ✗ Step 1 validation FAILED: Order already refunded', {
        orderId,
        currentStatus: order.status
      });
      return res.status(400).send('This order has already been refunded');
    }

    // Step 2: Fetch PayPal transaction details
    console.log('[Admin.approveRefund] Step 2: Fetching PayPal transaction...');
    Order.getTransactionByOrderId(orderId, async (err, transactions) => {
      if (err) {
        console.error('[Admin.approveRefund] ✗ Step 2 FAILED:', err.message);
        return res.status(500).send('Error fetching transaction details');
      }

      const transaction = transactions && transactions[0];
      
      if (!transaction) {
        console.warn('[Admin.approveRefund] ⚠ No transaction found for order (may be manual order)');
        console.log('[Admin.approveRefund]   Proceeding to update status without PayPal refund');
      } else {
        console.log('[Admin.approveRefund] ✓ Step 2 complete: Transaction found');
        console.log('[Admin.approveRefund]   Transaction details:', {
          orderId: transaction.orderId,
          paypalOrderId: transaction.paypalOrderId,
          captureId: transaction.captureId || 'NOT STORED',
          amount: transaction.amount,
          currency: transaction.currency,
          payerEmail: transaction.payerEmail
        });
      }

      let paypalRefundResult = null;

      // Step 3: If this is a PayPal order, process the refund
      if (transaction && transaction.captureId && transaction.captureId !== 'N/A') {
        console.log('[Admin.approveRefund] Step 3: Processing PayPal refund...');
        console.log('[Admin.approveRefund]   Transaction from database:', {
          orderId: transaction.orderId,
          amount: transaction.amount,
          amountType: typeof transaction.amount,
          currency: transaction.currency,
          payment_currency: transaction.payment_currency,
          captureId: transaction.captureId
        });
        console.log('[Admin.approveRefund]   Calling PayPal refund API with:');
        console.log('[Admin.approveRefund]   - captureId:', transaction.captureId);
        console.log('[Admin.approveRefund]   - amount:', transaction.amount, '(type:', typeof transaction.amount + ')');
        console.log('[Admin.approveRefund]   - currency:', transaction.payment_currency || transaction.currency || 'SGD');
        
        try {
          // Use payment_currency if available (user's selected currency), otherwise fall back to captured currency or SGD
          const refundCurrency = transaction.payment_currency || transaction.currency || 'SGD';
          
          paypalRefundResult = await paypalService.refundCapture(
            transaction.captureId,
            transaction.amount,
            refundCurrency
          );

          if (paypalRefundResult.success) {
            console.log('[Admin.approveRefund] ✓ Step 3 complete: PayPal refund successful');
            console.log('[Admin.approveRefund]   PayPal refund details:', {
              refundId: paypalRefundResult.refundId,
              status: paypalRefundResult.status,
              amount: paypalRefundResult.amount
            });
          } else {
            console.error('[Admin.approveRefund] ✗ Step 3 FAILED: PayPal refund rejected');
            console.error('[Admin.approveRefund]   PayPal error:', paypalRefundResult);
            console.error('[Admin.approveRefund] ✗ WORKFLOW STOPPED - Local order NOT updated');
            return res.status(500).send(`PayPal refund failed: ${paypalRefundResult.error}`);
          }
        } catch (paypalErr) {
          console.error('[Admin.approveRefund] ✗ Step 3 EXCEPTION: PayPal call threw error');
          console.error('[Admin.approveRefund]   Exception details:', {
            message: paypalErr.message,
            code: paypalErr.code
          });
          console.error('[Admin.approveRefund] ✗ WORKFLOW STOPPED - Local order NOT updated');
          return res.status(500).send('Error processing PayPal refund');
        }
      } else {
        console.log('[Admin.approveRefund] Step 3: Skipped - No PayPal capture to refund');
        console.log('[Admin.approveRefund]   This appears to be a non-PayPal order');
      }

      // Step 4: Update order status to "Refunded"
      console.log('[Admin.approveRefund] Step 4: Updating order status...');
      Order.approveRefund(orderId, (err, result) => {
        if (err) {
          console.error('[Admin.approveRefund] ✗ Step 4 FAILED: Could not update status');
          console.error('[Admin.approveRefund]   Database error:', err.message);
          return res.status(500).send('Error approving refund');
        }

        console.log('[Admin.approveRefund] ✓ Step 4 complete: Order status updated');
        console.log('[Admin.approveRefund] ╔════════════════════════════════════════╗');
        console.log('[Admin.approveRefund] ║ ✓✓✓ REFUND WORKFLOW COMPLETED ✓✓✓   ║');
        console.log('[Admin.approveRefund] ╚════════════════════════════════════════╝');
        console.log('[Admin.approveRefund] Final summary:', {
          orderId,
          newStatus: 'Refunded',
          approvedBy: userId,
          paypalRefundId: paypalRefundResult?.refundId || 'N/A',
          paypalStatus: paypalRefundResult?.status || 'N/A',
          timestamp: new Date().toISOString()
        });

        res.redirect('/admin?tab=orders&refundSuccess=true&orderId=' + orderId);
      });
    });
  });
};

// ================= Shared helper: create order from session cart =================
function createOrderFromSessionCart(req, callback) {
  console.log('\n[HELPER] === [CART HELPER START] ===');
  console.log('[HELPER] req.session.user:', req.session.user ? { id: req.session.user.id } : 'null');
  console.log('[HELPER] req.session.cart:', req.session.cart ? 'exists' : 'null');
  
  const cart = req.session.cart ? new Cart(req.session.cart) : null;
  
  if (!cart || Object.keys(cart.items).length === 0) {
    const err = new Error('Cart is empty');
    console.error('[HELPER] ERROR: Cart validation failed:', err.message);
    return callback(err);
  }

  const userId = req.session.user?.id;
  if (!userId) {
    const err = new Error('User ID not found in session');
    console.error('[HELPER] ERROR: User validation failed:', err.message);
    return callback(err);
  }

  const subtotal = cart.totalPrice;
  
  // Handle wallet payment first (if selected as payment method)
  const paymentMethod = req.body?.paymentMethod || null;
  let walletPaymentAmount = 0;
  let newWalletBalance = req.session.user.walletBalance || 0;
  
  if (paymentMethod === 'Wallet') {
    // For wallet payment, the entire order total is paid from wallet
    // No coins or voucher discounts apply - wallet IS the payment
    walletPaymentAmount = subtotal;
    
    // Check if user has sufficient balance
    if (newWalletBalance < walletPaymentAmount) {
      const err = new Error('Insufficient wallet balance');
      console.error('[HELPER] ERROR: Wallet payment failed - insufficient balance', {
        userId,
        required: walletPaymentAmount,
        available: newWalletBalance
      });
      return callback(err);
    }
    
    newWalletBalance -= walletPaymentAmount;
  }
  
  // Handle coin discount (only if NOT using wallet payment)
  const coinsToUse = (paymentMethod !== 'Wallet') ? (req.body?.coinsToUse ? parseInt(req.body.coinsToUse) : 0) : 0;
  let coinDiscount = 0;
  let discountedSubtotal = subtotal;
  
  if (coinsToUse > 0) {
    coinDiscount = coinsToUse / 100; // 100 coins = $1
    discountedSubtotal = Math.max(0, subtotal - coinDiscount); // Apply discount to subtotal
  }

  // Handle voucher discount (only if NOT using wallet payment)
  const voucherId = (paymentMethod !== 'Wallet') ? (req.body?.voucherId ? parseInt(req.body.voucherId) : null) : null;
  const voucherDiscount = (paymentMethod !== 'Wallet') ? (req.body?.voucherDiscount ? parseFloat(req.body.voucherDiscount) : 0) : 0;
  let finalSubtotal = discountedSubtotal - voucherDiscount;
  finalSubtotal = Math.max(0, finalSubtotal);

  // Calculate GST on the final discounted subtotal
  const gstRate = 0.09; // 9% GST
  const gst = finalSubtotal * gstRate;
  let totalAmount = finalSubtotal + gst;
  
  // If wallet payment, total is just the subtotal with GST (no discounts)
  if (paymentMethod === 'Wallet') {
    totalAmount = subtotal * (1 + gstRate);
  }
  
  const pointsEarned = Math.floor(subtotal); // earn 1 point per $1 before any discounts
  
  console.log('[HELPER] Cart validated. Details:', {
    userId,
    paymentMethod,
    subtotal,
    walletPaymentAmount,
    coinDiscount,
    voucherDiscount,
    discountedSubtotal,
    finalSubtotal,
    gst,
    totalAmount,
    pointsEarned,
    coinsToUse,
    voucherId,
    itemCount: Object.keys(cart.items).length
  });

  // 1. Insert order into orders table
  console.log('[HELPER] Step 1/5: Creating order in DB...');
  let orderId; // Declare orderId in outer scope so finish() can access it
  const createCallback = (err, result) => {
    if (err) {
      console.error('[HELPER] ERROR at Step 1: Order creation failed', { error: err.message, code: err.code, errno: err.errno, sqlState: err.sqlState });
      return callback(err);
    }

    orderId = result.insertId;
    const cartItems = Object.values(cart.items);
    let processedCount = 0;

    console.log('[HELPER] ✓ Step 1 complete: Order created', { orderId, userId, totalAmount });

    cartItems.forEach(item => {
      console.log('Step 2: Inserting order item for orderId:', orderId, {
        productId: item.id,
        quantity: item.quantity,
        price: item.price
      });

      // 2. Insert each item into order_items table
      Order.addOrderItem(orderId, item.id, item.quantity, item.price, (err2) => {
        if (err2) {
          console.error('ERROR at Step 2: Order item insert failed', {
            orderId,
            productId: item.id,
            error: err2.message,
            code: err2.code
          });
        } else {
          console.log('✓ Step 2 complete: Order item inserted', { orderId, productId: item.id });
        }

        // 3. Update product stock
        console.log('Step 3: Fetching product for stock update', { productId: item.id });
        Product.getProductById(item.id, (err3, product) => {
          if (err3 || !product) {
            console.error('ERROR at Step 3: Product fetch failed', {
              productId: item.id,
              error: err3 ? err3.message : 'Product not found',
              code: err3?.code
            });
            processedCount++;
            if (processedCount === cartItems.length) {
              console.log('All items processed, moving to finish()');
              finish();
            }
            return;
          }

          const newStock = product.quantity - item.quantity;
          console.log('Updating stock for product:', { productId: item.id, newStock });

          Product.updateProduct(
            item.id,
            product.productName,
            newStock,
            product.price,
            product.image,
            product.category || '',
            product.tags || '',
            product.brand || '',
            (err4) => {
              if (err4) {
                console.error('ERROR at Step 3: Stock update failed', {
                  productId: item.id,
                  error: err4.message,
                  code: err4.code
                });
              } else {
                console.log('✓ Step 3 complete: Product stock updated', { productId: item.id, newStock });
              }

              processedCount++;
              console.log('Progress: ' + processedCount + ' of ' + cartItems.length + ' items processed');
              if (processedCount === cartItems.length) {
                console.log('All items processed, calling finish()');
                finish();
              }
            }
          );
        });
      });
    });
  };
  Order.createOrder(userId, totalAmount, createCallback, paymentMethod);

    function finish() {
      console.log('[HELPER] --- [FINISH: All items processed, updating loyalty points, coins, and vouchers] ---');
      
      // 4. Update user loyalty points and coins
      const newPoints = (req.session.user.loyaltyPoints || 0) + pointsEarned;
      const newCoinBalance = coinsToUse > 0 
        ? (req.session.user.coinBalance || 0) - coinsToUse 
        : (req.session.user.coinBalance || 0);
      
      console.log('[HELPER] Step 4: Updating loyalty points and coins', {
        userId,
        currentPoints: req.session.user.loyaltyPoints || 0,
        pointsEarned,
        newPoints,
        coinsUsed: coinsToUse,
        newCoinBalance
      });

      db.query(
        'UPDATE users SET loyaltyPoints = ?, coinBalance = ?, walletBalance = ? WHERE id = ?',
        [newPoints, newCoinBalance, newWalletBalance, userId],
        (err5) => {
          if (err5) {
            console.error('[HELPER] ERROR at Step 4: User update failed', {
              userId,
              error: err5.message,
              code: err5.code,
              errno: err5.errno,
              sqlState: err5.sqlState
            });
            // Continue anyway
          } else {
            console.log('[HELPER] ✓ Step 4 complete: User account updated', { userId, newPoints, newCoinBalance, newWalletBalance });
          }

          req.session.user.loyaltyPoints = newPoints;
          req.session.user.coinBalance = newCoinBalance;
          req.session.user.walletBalance = newWalletBalance;

          // 5. Mark voucher as used if provided
          if (voucherId) {
            console.log('[HELPER] Step 5: Marking voucher as used', { voucherId });
            db.query(
              'UPDATE vouchers SET isUsed = TRUE, usedDate = NOW(), updatedAt = NOW() WHERE id = ? AND userId = ?',
              [voucherId, userId],
              (err6) => {
                if (err6) {
                  console.warn('[HELPER] WARNING at Step 5: Voucher update failed', {
                    voucherId,
                    error: err6.message
                  });
                  // Continue anyway
                } else {
                  console.log('[HELPER] ✓ Step 5 complete: Voucher marked as used', { voucherId });
                }

                finalizeOrder();
              }
            );
          } else {
            console.log('[HELPER] Step 5: Skipped - No voucher to mark');
            finalizeOrder();
          }

          function finalizeOrder() {
            req.session.cart = null;

            console.log('[HELPER] === [CART HELPER SUCCESS] ===');
            console.log('[HELPER] Final result:', { 
              orderId, 
              totalAmount, 
              pointsEarned, 
              coinsUsed: coinsToUse, 
              coinDiscount,
              walletPaymentAmount,
              voucherUsed: !!voucherId,
              voucherDiscount,
              paymentMethod
            });
            // done
            callback(null, { 
              orderId, 
              totalAmount, 
              coinDiscount, 
              coinsUsed: coinsToUse,
              voucherDiscount,
              voucherUsed: !!voucherId,
              walletPaymentAmount,
              paymentMethod
            });
          }
        }
      );
    }
}

// ================= Display all orders for a user (with items) =================
exports.getOrdersByUser = (req, res) => {
  const userId = req.session.user.id;

  Order.getOrdersByUser(userId, (err, orders) => {
    if (err) return res.status(500).send('Error loading orders');

    Order.getOrderItemsByUser(userId, (err2, items) => {
      if (err2) return res.status(500).send('Error loading order items');

      const itemsByOrder = {};
      (items || []).forEach(item => {
        const oid = item.orderId;
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(item);
      });

      const ordersWithItems = (orders || []).map(o => ({
        ...o,
        items: itemsByOrder[o.id] || []
      }));

      res.render('orders', {
        orders: ordersWithItems,
        user: req.session.user
      });
    });
  });
};

// ================= Display a single order with items =================
exports.getOrderDetails = (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user.id;

  const orderQuery = 'SELECT * FROM orders WHERE id = ? AND userId = ?';
  const itemsQuery = `
    SELECT oi.*, p.productName, p.price
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    WHERE oi.orderId = ?
  `;

  db.query(orderQuery, [orderId, userId], (err, orderRows) => {
    if (err || !orderRows.length) return res.send('Order not found');

    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) return res.send('Error loading order items');

      const order = orderRows[0];
      order.items = items || [];

      res.render('orders', {
        orders: [order],
        user: req.session.user
      });
    });
  });
};

// ================= Checkout: create order from cart (POST /checkout) =================
exports.createOrderFromCart = (req, res) => {
  console.log('\n✓ POST /checkout called');
  createOrderFromSessionCart(req, (err, result) => {
    if (err) {
      console.error('Error creating order from cart:', err);
      return res.status(500).send('Error creating order: ' + err.message);
    }
    console.log('Redirecting to order:', result.orderId);
    res.redirect('/orders/' + result.orderId);
  });
};

// ================= Update order status (admin only) =================
exports.updateOrderStatus = (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  Order.updateOrderStatus(orderId, status, (err) => {
    if (err) return res.status(500).send(err);
    res.redirect('/admin?tab=orders');
  });
};

// ================= Delete an order (admin only) =================
exports.deleteOrder = (req, res) => {
  const orderId = req.params.id;

  Order.deleteOrder(orderId, (err) => {
    if (err) return res.status(500).send(err);
    res.redirect('/admin?tab=orders');
  });
};

// ================= User invoice =================
exports.getUserInvoice = (req, res) => {
  const orderId = req.params.orderId;
  const userId = req.session.user.id;

  const orderQuery = `
    SELECT o.*
    FROM orders o
    WHERE o.id = ? AND o.userId = ?
  `;
  const itemsQuery = `
    SELECT oi.*, p.productName, p.image
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    WHERE orderId = ?
  `;
  const transactionQuery = `
    SELECT payment_currency, amount
    FROM transactions
    WHERE orderId = ?
  `;

  db.query(orderQuery, [orderId, userId], (err, orderRows) => {
    if (err || !orderRows.length) return res.send('Order not found');

    const order = orderRows[0];

    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) return res.send('Error loading order items');

      // Fetch transaction details for payment currency
      db.query(transactionQuery, [orderId], (err3, transactionRows) => {
        const transaction = transactionRows && transactionRows[0] ? transactionRows[0] : null;
        const paymentCurrency = transaction?.payment_currency || 'SGD';
        const paidAmount = transaction?.amount || order.totalAmount;

        let subtotal = 0;
        (items || []).forEach(it => {
          subtotal += Number(it.price) * Number(it.quantity);
        });

        const gstRate = 0.09;
        const gst = subtotal * gstRate;
        const grandTotal = subtotal + gst;

        res.render('invoice', {
          order,
          items,
          subtotal,
          gst,
          grandTotal,
          paymentCurrency,
          paidAmount,
          user: req.session.user
        });
      });
    });
  });
};

// ================= PayPal: create order + transaction =================
exports.payWithPaypal = (req, res, capture) => {
  console.log('\n[PAYPAL HANDLER] ╔════════════════════════════════════════╗');
  console.log('[PAYPAL HANDLER] ║ PAYPAL PAYMENT CALLBACK RECEIVED       ║');
  console.log('[PAYPAL HANDLER] ╚════════════════════════════════════════╝');
  
  const paypalOrderId = capture.id || capture.orderID || null;
  console.log('[PAYPAL HANDLER] PayPal Order ID:', paypalOrderId);
  console.log('[PAYPAL HANDLER] Capture Status:', capture.status);
  console.log('[PAYPAL HANDLER] User ID:', req.session.user?.id);
  console.log('[PAYPAL HANDLER] Cart items count:', req.session.cart ? Object.keys(req.session.cart.items).length : 0);

  // Extract payment currency from request body (sent by frontend)
  const paymentCurrency = req.body?.paymentCurrency || 'SGD';
  const paymentAmount = req.body?.paymentAmount || null;
  const fxId = req.body?.fxId || null;
  console.log('[PAYPAL HANDLER] Payment Currency from frontend:', paymentCurrency);
  console.log('[PAYPAL HANDLER] Payment Amount from frontend:', paymentAmount);
  console.log('[PAYPAL HANDLER] FX Quote ID:', fxId);

  // Set payment method to PayPal before creating order
  req.body = req.body || {};
  req.body.paymentMethod = 'PayPal';

  // 1. Create local order from session cart (basic order only)
  console.log('[PAYPAL HANDLER] Delegating to createOrderFromSessionCart...');
  createOrderFromSessionCart(req, (err, result) => {
    if (err) {
      console.error('[PAYPAL HANDLER] ✗ PAYPAL FLOW FAILED at createOrderFromSessionCart');
      console.error('[PAYPAL HANDLER] Error:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      return res.redirect(`/payment-failed?reason=Order%20Creation%20Failed&errorMessage=${encodeURIComponent(err.message)}&transactionId=${encodeURIComponent(paypalOrderId || 'N/A')}`);
    }

    const orderId = result.orderId;
    console.log('[PAYPAL HANDLER] ✓ Order created successfully. Local Order ID:', orderId);

    // 2. Extract payer info from capture response
    console.log('\n[PAYPAL HANDLER] ═══════ EXTRACTING PAYPAL DATA ═══════');
    console.log('[PAYPAL HANDLER] Full capture response object keys:', Object.keys(capture || {}));
    
    let payerId = 'N/A';
    let payerEmail = 'N/A';
    let paidAmount = result.totalAmount || 0;
    let captureId = 'N/A';
    
    // Extract payerId
    console.log('[PAYPAL HANDLER] Extracting payerId...');
    if (capture?.payer) {
      console.log('[PAYPAL HANDLER]   ✓ capture.payer exists:', Object.keys(capture.payer));
      if (capture.payer.payer_id) {
        payerId = capture.payer.payer_id;
        console.log('[PAYPAL HANDLER]   ✓ Found payerId:', payerId);
      } else {
        console.warn('[PAYPAL HANDLER]   ✗ capture.payer.payer_id NOT found. Available keys:', Object.keys(capture.payer));
      }
    } else {
      console.warn('[PAYPAL HANDLER]   ✗ capture.payer does NOT exist');
    }
    
    // Extract payerEmail
    console.log('[PAYPAL HANDLER] Extracting payerEmail...');
    if (capture?.payer) {
      if (capture.payer.email_address) {
        payerEmail = capture.payer.email_address;
        console.log('[PAYPAL HANDLER]   ✓ Found payerEmail:', payerEmail);
      } else {
        console.warn('[PAYPAL HANDLER]   ✗ capture.payer.email_address NOT found. Available keys:', Object.keys(capture.payer));
      }
    } else {
      console.warn('[PAYPAL HANDLER]   ✗ capture.payer does NOT exist (already logged above)');
    }
    
    // Extract amount
    console.log('[PAYPAL HANDLER] Extracting amount...');
    if (capture?.purchase_units?.[0]) {
      console.log('[PAYPAL HANDLER]   ✓ capture.purchase_units[0] exists:', Object.keys(capture.purchase_units[0]));
      if (capture.purchase_units[0].amount) {
        paidAmount = capture.purchase_units[0].amount.value;
        console.log('[PAYPAL HANDLER]   ✓ Found amount:', paidAmount, 'currency:', capture.purchase_units[0].amount.currency_code);
      } else {
        console.warn('[PAYPAL HANDLER]   ✗ capture.purchase_units[0].amount NOT found');
      }
    } else {
      console.warn('[PAYPAL HANDLER]   ✗ capture.purchase_units[0] does NOT exist');
    }
    
    // Extract captureId - THIS IS CRITICAL FOR REFUNDS
    console.log('[PAYPAL HANDLER] Extracting captureId (CRITICAL FOR REFUNDS)...');
    if (capture?.purchase_units?.[0]) {
      console.log('[PAYPAL HANDLER]   ✓ purchase_units[0] exists');
      
      if (capture.purchase_units[0].payments) {
        console.log('[PAYPAL HANDLER]   ✓ payments object exists');
        
        if (capture.purchase_units[0].payments.captures) {
          console.log('[PAYPAL HANDLER]   ✓ captures array exists, length:', capture.purchase_units[0].payments.captures.length);
          
          if (capture.purchase_units[0].payments.captures[0]) {
            console.log('[PAYPAL HANDLER]   ✓ captures[0] exists:', Object.keys(capture.purchase_units[0].payments.captures[0]));
            
            if (capture.purchase_units[0].payments.captures[0].id) {
              captureId = capture.purchase_units[0].payments.captures[0].id;
              console.log('[PAYPAL HANDLER]   ✓✓✓ FOUND CAPTURE ID:', captureId);
            } else {
              console.error('[PAYPAL HANDLER]   ✗ captures[0].id NOT found. Available:', Object.keys(capture.purchase_units[0].payments.captures[0]));
            }
          } else {
            console.error('[PAYPAL HANDLER]   ✗ captures[0] is empty or undefined');
          }
        } else {
          console.error('[PAYPAL HANDLER]   ✗ payments.captures does NOT exist. Available in payments:', Object.keys(capture.purchase_units[0].payments));
        }
      } else {
        console.error('[PAYPAL HANDLER]   ✗ purchase_units[0].payments does NOT exist. Available in purchase_units[0]:', Object.keys(capture.purchase_units[0]));
      }
    } else {
      console.error('[PAYPAL HANDLER]   ✗ purchase_units or purchase_units[0] does NOT exist');
    }

    console.log('[PAYPAL HANDLER] ═══════ EXTRACTION COMPLETE ═══════\n');
    
    console.log('[PAYPAL HANDLER] Step 5: Creating transaction record...');
    console.log('[PAYPAL HANDLER] PayPal Details:', {
      payerId,
      payerEmail,
      amount: paidAmount,
      currency: capture.purchase_units?.[0]?.amount?.currency_code || 'SGD',
      captureId
    });
    
    // VERIFICATION: Ensure captureId was actually extracted (not 'N/A')
    if (captureId === 'N/A') {
      console.error('[PAYPAL HANDLER] ⚠️  WARNING: captureId is N/A - refunds via PayPal will be skipped');
      console.error('[PAYPAL HANDLER] This order will only support status-only refunds, not actual PayPal refunds');
      console.error('[PAYPAL HANDLER] Full capture response keys:', Object.keys(capture || {}));
      console.error('[PAYPAL HANDLER] Check PayPal captureOrder logging above to debug');
    } else {
      console.log('[PAYPAL HANDLER] ✓✓✓ captureId verified - PayPal refunds will be ENABLED for this order');
    }
    
    // 3. Create transaction record (including captureId for later refunds and payment currency)
    Order.createTransaction(
      orderId, 
      payerId, 
      payerEmail, 
      paidAmount, 
      capture.purchase_units?.[0]?.amount?.currency_code || 'SGD',
      capture.status,
      paypalOrderId,
      captureId,
      paymentCurrency, // Pass selected payment currency
      (err2) => {
        if (err2) {
          console.error('[PAYPAL HANDLER] ERROR at Step 5: createTransaction failed', {
            orderId,
            paypalOrderId,
            captureId,
            paymentCurrency,
            error: err2.message,
            code: err2.code,
            stack: err2.stack
          });
          return res.redirect(`/payment-failed?reason=Transaction%20Creation%20Failed&errorMessage=${encodeURIComponent(err2.message)}&transactionId=${encodeURIComponent(paypalOrderId || 'N/A')}`);
        }

        console.log('[PAYPAL HANDLER] ✓ Step 5 complete: Transaction created');
        console.log('[PAYPAL HANDLER] ╔════════════════════════════════════════╗');
        console.log('[PAYPAL HANDLER] ║ PAYPAL FLOW COMPLETED SUCCESSFULLY!    ║');
        console.log('[PAYPAL HANDLER] ║ Order ID: ' + orderId + ' | Transaction linked ║');
        console.log('[PAYPAL HANDLER] ║ Capture ID: ' + (captureId !== 'N/A' ? captureId.substring(0, 15) + '...' : 'NOT CAPTURED') + ' ║');
        console.log('[PAYPAL HANDLER] ╚════════════════════════════════════════╝');
        
        // Redirect to success page with order details (including payment currency)
        const successUrl = `/payment-success?orderId=${orderId}&transactionId=${encodeURIComponent(paypalOrderId)}&amount=${encodeURIComponent(paidAmount)}&paymentMethod=paypal&paymentCurrency=${encodeURIComponent(paymentCurrency)}`;
        console.log('[PAYPAL HANDLER] Redirecting to:', successUrl);
        return res.redirect(successUrl);
      }
    );
  });
};

// ================= Handle NETS QR Success =================
exports.netsQrSuccess = (req, res) => {
  console.log('[NETS SUCCESS] Handling NETS QR success...');
  
  // Create order from session cart
  createOrderFromSessionCart(req, (err, result) => {
    if (err) {
      console.error('[NETS SUCCESS] ✗ Order creation failed:', err.message);
      return res.status(500).send('Error creating order: ' + err.message);
    }
    
    console.log('[NETS SUCCESS] ✓ Order created:', result.orderId);
    
    // Render success page with orderId
    res.render('netsTxnSuccessStatus', { 
      user: req.session.user,
      message: 'Transaction Successful!',
      orderId: result.orderId
    });
  });
};
