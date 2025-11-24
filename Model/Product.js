const db = require('../db');

// Get all products
exports.getAllProducts = (callback) => {
  const sql = 'SELECT * FROM products';
  db.query(sql, callback);
};

// Get product by ID
exports.getProductById = (id, callback) => {
  const sql = 'SELECT * FROM products WHERE id = ?';
  db.query(sql, [id], (err, results) => {
    if (err) return callback(err);
    callback(null, results[0] || null);
  });
};

// Add product with category and tags
exports.addProduct = (productName, quantity, price, image, category, tags, callback) => {
  const sql = 'INSERT INTO products (productName, quantity, price, image, category, tags) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(sql, [productName, quantity, price, image, category, tags], callback);
};

// Update product with category and tags
exports.updateProduct = (id, productName, quantity, price, image, category, tags, callback) => {
  const sql = 'UPDATE products SET productName = ?, quantity = ?, price = ?, image = ?, category = ?, tags = ? WHERE id = ?';
  db.query(sql, [productName, quantity, price, image, category, tags, id], callback);
};

// Delete product
exports.deleteProduct = (id, callback) => {
  const sql = 'DELETE FROM products WHERE id = ?';
  db.query(sql, [id], callback);
};

exports.search = function (query, callback) {
  const sql = "SELECT * FROM products WHERE productName LIKE ? OR category LIKE ? OR tags LIKE ?";
  const values = ['%' + query + '%', '%' + query + '%', '%' + query + '%'];

  db.query(sql, values, callback);
};
module.exports = exports;
