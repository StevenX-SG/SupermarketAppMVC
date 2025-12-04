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


// === Create new order ===
exports.createOrder = (userId, totalAmount,callback) => {
  const sql = `
    INSERT INTO orders (userId, totalAmount, status, createdAt)
    VALUES (?, ?, 'Pending', NOW())
  `;
  db.query(sql, [userId, totalAmount], callback);
};


// === Add order items ===
exports.addOrderItem = (orderId, productId, quantity, price, callback) => {
  const sql = `
    INSERT INTO order_items (orderId, productId, quantity, price)
    VALUES (?, ?, ?, ?)
  `;
  db.query(sql, [orderId, productId, quantity, price], callback);
};
// === Update order status ===
exports.updateProduct = function (id, name, quantity, price, image, category, tags, brand, callback) {
  const sql = `
    UPDATE products
    SET productName = ?, quantity = ?, price = ?, image = ?, category = ?, tags = ?, brand = ?
    WHERE id = ?
  `;
  db.query(sql, [name, quantity, price, image, category, tags, brand, id], callback);
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

module.exports = exports;