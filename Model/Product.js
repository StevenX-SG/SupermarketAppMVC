const db = require('../db');

// Get all products
exports.getAllProducts = function (callback) {
  const sql = "SELECT * FROM products WHERE isActive = 1";
  db.query(sql, callback);
};


// Get product by ID
exports.getProductById = function (id, callback) {
  const sql = "SELECT * FROM products WHERE id = ?";
  db.query(sql, [id], function (err, results) {
    if (err) return callback(err);
    callback(null, results[0] || null);
  });
};

// Add product (with category + tags)
exports.addProduct = function (productName, quantity, price, image, category, tags, brand, callback) {
  const sql = "INSERT INTO products (productName, quantity, price, image, category, tags, brand) VALUES (?, ?, ?, ?, ?, ?, ?)";
  const values = [productName, quantity, price, image, category, tags || null, brand];
  db.query(sql, values, callback);
};

// Update product (with category + tags)
exports.updateProduct = function (id, productName, quantity, price, image, category, tags, brand, callback) {
  const sql = "UPDATE products SET productName = ?, quantity = ?, price = ?, image = ?, category = ?, tags = ?, brand = ? WHERE id = ?";
  const values = [productName, quantity, price, image, category, tags || null, brand, id];
  db.query(sql, values, callback);
};

// Delete product
// exports.deleteProduct = function (id, callback) {
//   // 1) Delete any wishlist rows that reference this product
//   const sqlWishlist = 'DELETE FROM wishlist WHERE productId = ?';
//   db.query(sqlWishlist, [id], function (err) {
//     if (err) return callback(err);

//     // 2) Now safe to delete the product
//     const sqlProduct = 'DELETE FROM products WHERE id = ?';
//     db.query(sqlProduct, [id], callback);
//   });
// };

// Search (productName OR category OR tags)
exports.search = function (query, callback) {
  const sql = "SELECT * FROM products WHERE productName LIKE ? OR category LIKE ? OR tags LIKE ?";
  const value = "%" + query + "%";

  db.query(sql, [value, value, value], callback);
};

// Soft delete product (set isActive = 0)
exports.softDeleteProduct = function (id, callback) {
  const sql = "UPDATE products SET isActive = 0 WHERE id = ?";
  db.query(sql, [id], callback);
};


module.exports = exports;
