const db = require('../db');

// === Get all orders for a user ===
exports.getOrdersByUser = (userId, callback) => {
  const sql = "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC";
  db.query(sql, [userId], callback);
};

// === Get details for a specific order ===
exports.getOrderDetails = (orderId, callback) => {
  const sql = `
    SELECT oi.*, p.productName, p.image 
    FROM order_items oi 
    JOIN products p ON oi.productId = p.id 
    WHERE oi.orderId = ?`;
  db.query(sql, [orderId], callback);
};

// === Get basic order info (for checking status, etc.) ===
exports.getOrderDetailsOnly = (orderId, callback) => {
  const sql = 'SELECT * FROM orders WHERE id = ?';
  db.query(sql, [orderId], (err, results) => {
    if (err) return callback(err);
    callback(null, results && results[0] ? results[0] : null);
  });
};

// === Create new order (basic order without payment details) ===
exports.createOrder = (userId, totalAmount, callback, paymentMethod = null) => {
  const sql = `
    INSERT INTO orders (userId, totalAmount, status, paymentMethod, createdAt, updatedAt)
    VALUES (?, ?, 'Pending', ?, NOW(), NOW())
  `;
  console.log('[Order.createOrder] Executing INSERT (basic order):', {
    userId,
    totalAmount,
    paymentMethod,
    sql: sql.replace(/\n/g, ' ')
  });
  
  db.query(sql, [userId, totalAmount, paymentMethod], (err, result) => {
    if (err) {
      console.error('[Order.createOrder] ✗ INSERT failed:', {
        error: err.message,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      });
      return callback(err);
    }
    console.log('[Order.createOrder] ✓ INSERT succeeded:', {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    });
    callback(null, result);
  });
};


// === Add order items ===
exports.addOrderItem = (orderId, productId, quantity, price, callback) => {
  const sql = `
    INSERT INTO order_items (orderId, productId, quantity, price)
    VALUES (?, ?, ?, ?)
  `;
  console.log('[Order.addOrderItem] Executing INSERT:', {
    orderId,
    productId,
    quantity,
    price,
    sql: sql.replace(/\n/g, ' ')
  });
  
  db.query(sql, [orderId, productId, quantity, price], (err, result) => {
    if (err) {
      console.error('[Order.addOrderItem] ✗ INSERT failed:', {
        orderId,
        productId,
        error: err.message,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      });
      return callback(err);
    }
    console.log('[Order.addOrderItem] ✓ INSERT succeeded:', {
      orderId,
      productId,
      insertId: result.insertId
    });
    callback(null, result);
  });
};

// === Delete order ===
exports.deleteOrder = (orderId, callback) => {
  const sqlItems = "DELETE FROM order_items WHERE orderId = ?";
  db.query(sqlItems, [orderId], (err) => {
    if (err) return callback(err);
    const sqlOrder = "DELETE FROM orders WHERE id = ?";
    db.query(sqlOrder, [orderId], callback);
  });
};

// Get all items for all orders of a user
exports.getOrderItemsByUser = (userId, callback) => {
  const sql = `
    SELECT oi.*, p.productName, p.price, o.id AS orderId
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    JOIN orders o ON oi.orderId = o.id
    WHERE o.userId = ?
  `;
  db.query(sql, [userId], callback);
};

// Update order status (used by admin)
exports.updateOrderStatus = function (orderId, status, callback) {
  const sql = 'UPDATE orders SET status = ? WHERE id = ?';
  db.query(sql, [status, orderId], callback);
};

// Request refund (customer action - change status to 'Refund Requested')
exports.requestRefund = function (orderId, refundReason, refundNotes, callback) {
  // Try to update with reason/notes columns first (new schema)
  // If it fails, fall back to status-only update (old schema)
  const sqlWithReason = 'UPDATE orders SET status = ?, refundReason = ?, refundNotes = ?, refundRequestedAt = NOW() WHERE id = ?';
  const sqlBasic = 'UPDATE orders SET status = ? WHERE id = ?';
  
  console.log('[Order.requestRefund] Updating order with refund request:', {
    orderId,
    refundReason,
    hasNotes: !!refundNotes
  });
  
  db.query(sqlWithReason, ['Refund Requested', refundReason, refundNotes, orderId], (err, result) => {
    if (err) {
      // If error is about unknown column, try basic update (backward compatibility)
      if (err.message && err.message.includes('Unknown column')) {
        console.warn('[Order.requestRefund] ⚠️  Refund columns not found in database. Using basic status update.');
        console.warn('[Order.requestRefund] To enable refund reason/notes, add columns: refundReason, refundNotes, refundRequestedAt');
        
        // Fall back to basic status update
        db.query(sqlBasic, ['Refund Requested', orderId], (err2, result2) => {
          if (err2) {
            console.error('[Order.requestRefund] ✗ Basic UPDATE also failed:', {
              error: err2.message,
              code: err2.code
            });
            return callback(err2);
          }
          console.log('[Order.requestRefund] ✓ Status updated (without reason/notes):', { orderId });
          callback(null, result2);
        });
      } else {
        console.error('[Order.requestRefund] ✗ UPDATE failed:', {
          error: err.message,
          code: err.code,
          errno: err.errno,
          sqlState: err.sqlState
        });
        return callback(err);
      }
    } else {
      console.log('[Order.requestRefund] ✓ UPDATE succeeded with reason/notes:', {
        orderId,
        affectedRows: result.affectedRows,
        reason: refundReason
      });
      callback(null, result);
    }
  });
};

// Approve refund (admin action - change status to 'Refunded')
exports.approveRefund = function (orderId, callback) {
  const sql = 'UPDATE orders SET status = ? WHERE id = ?';
  console.log('[Order.approveRefund] Updating order status to Refunded:', { orderId });
  db.query(sql, ['Refunded', orderId], (err, result) => {
    if (err) {
      console.error('[Order.approveRefund] ✗ UPDATE failed:', {
        error: err.message,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      });
      return callback(err);
    }
    console.log('[Order.approveRefund] ✓ UPDATE succeeded:', {
      orderId,
      affectedRows: result.affectedRows
    });
    callback(null, result);
  });
};

// Mark order as paid (similar idea to Fine.markPaid)
exports.markPaidWithPaypal = (orderId, paypalOrderId, callback) => {
  const sql = `
    UPDATE orders
    SET paymentStatus = 'Paid',
        status = 'Completed',
        paymentMethod = 'paypal',
        paypalOrderId = ?,
        paidAt = NOW()
    WHERE id = ?
  `;
  console.log('[Order.markPaidWithPaypal] Executing UPDATE:', {
    orderId,
    paypalOrderId,
    sql: sql.replace(/\n/g, ' ')
  });
  
  db.query(sql, [paypalOrderId, orderId], (err, result) => {
    if (err) {
      console.error('[Order.markPaidWithPaypal] ✗ UPDATE failed:', {
        orderId,
        error: err.message,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      });
      return callback(err);
    }
    console.log('[Order.markPaidWithPaypal] ✓ UPDATE succeeded:', {
      orderId,
      paypalOrderId,
      affectedRows: result.affectedRows,
      changedRows: result.changedRows
    });
    callback(null, result);
  });
};

// === Create transaction (PayPal payment record) ===
exports.createTransaction = (orderId, payerId, payerEmail, amount, currency, paypalStatus, paypalOrderId, captureId, callback) => {
  // Handle backward compatibility - if callback is passed as 8th arg (no captureId)
  if (typeof captureId === 'function') {
    callback = captureId;
    captureId = null;
  }

  const sql = captureId 
    ? `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, paypalOrderId, captureId, time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`
    : `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, paypalOrderId, time)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`;
  
  console.log('[Order.createTransaction] Executing INSERT (PayPal transaction):', {
    orderId,
    payerId,
    payerEmail,
    amount,
    currency,
    paypalStatus,
    paypalOrderId,
    captureId: captureId || 'NULL',
    sql: sql.replace(/\n/g, ' ')
  });
  
  const params = captureId 
    ? [orderId, payerId, payerEmail, amount, currency, paypalStatus, paypalOrderId, captureId]
    : [orderId, payerId, payerEmail, amount, currency, paypalStatus, paypalOrderId];

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error('[Order.createTransaction] ✗ INSERT failed:', {
        orderId,
        error: err.message,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      });
      return callback(err);
    }
    console.log('[Order.createTransaction] ✓ INSERT succeeded:', {
      orderId,
      transactionId: result.insertId,
      affectedRows: result.affectedRows,
      captureIdStored: captureId || 'NULL'
    });
    callback(null, result);
  });
};

// === Get transactions for order ===
exports.getTransactionByOrderId = (orderId, callback) => {
  const sql = 'SELECT * FROM transactions WHERE orderId = ?';
  console.log('[Order.getTransactionByOrderId] Query:', { orderId });
  db.query(sql, [orderId], callback);
};

// === Get orders with transaction details (LEFT JOIN) ===
exports.getOrdersWithTransactions = (userId, callback) => {
  const sql = `
    SELECT o.*, t.payerId, t.payerEmail, t.amount as transactionAmount, t.currency, t.status as transactionStatus, t.paypalOrderId
    FROM orders o
    LEFT JOIN transactions t ON o.id = t.orderId
    WHERE o.userId = ?
    ORDER BY o.createdAt DESC
  `;
  console.log('[Order.getOrdersWithTransactions] Query with LEFT JOIN:', { userId });
  db.query(sql, [userId], callback);
};


module.exports = exports;