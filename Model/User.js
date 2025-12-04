// Model/User.js
const db = require('../db');

// Get all users
exports.getAllUsers = (callback) => {
  const sql = 'SELECT * FROM users';
  db.query(sql, callback);
};

// Get user by ID
exports.getUserById = (id, callback) => {
  const sql = 'SELECT * FROM users WHERE id = ?';
  db.query(sql, [id], callback);
};

// Add new user (Create)
// Table columns: id, username, email, password, address, contact, role, loyaltyPoints, createdAt, updatedAt
exports.addUser = (username, email, password, address, contact, role, callback) => {
  const sql = `
    INSERT INTO users (username, email, password, address, contact, role, loyaltyPoints, createdAt, updatedAt)
    VALUES (?, ?, SHA1(?), ?, ?, ?, 0, NOW(), NOW())
  `;
  db.query(sql, [username, email, password, address, contact, role], callback);
};

// Update user (Update)
exports.updateUser = (id, username, email, password, address, contact, role, callback) => {
  let sql;
  let params;

  if (password && password.trim() !== '') {
    sql = `
      UPDATE users
      SET username = ?, email = ?, password = SHA1(?), address = ?, contact = ?, role = ?, updatedAt = NOW()
      WHERE id = ?
    `;
    params = [username, email, password, address, contact, role, id];
  } else {
    sql = `
      UPDATE users
      SET username = ?, email = ?, address = ?, contact = ?, role = ?, updatedAt = NOW()
      WHERE id = ?
    `;
    params = [username, email, address, contact, role, id];
  }

  db.query(sql, params, callback);
};

// Delete user (Delete)
exports.deleteUser = (id, callback) => {
  const sql = 'DELETE FROM users WHERE id = ?';
  db.query(sql, [id], callback);
};
