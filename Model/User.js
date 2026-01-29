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
// Table columns: id, username, email, password, address, contact, role, loyaltyPoints, coinBalance, createdAt, updatedAt
exports.addUser = (username, email, password, address, contact, role, callback) => {
  const sql = `
    INSERT INTO users (username, email, password, address, contact, role, loyaltyPoints, coinBalance, createdAt, updatedAt)
    VALUES (?, ?, SHA1(?), ?, ?, ?, 0, 0, NOW(), NOW())
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

// Convert loyalty points to coins (10 points = 1 coin)
// pointsToConvert: number of points to convert
exports.convertPointsToCoin = (userId, pointsToConvert, callback) => {
  // Get current user data
  exports.getUserById(userId, (err, results) => {
    if (err) return callback(err);
    if (!results || results.length === 0) {
      return callback(new Error('User not found'));
    }

    const user = results[0];
    const currentLoyaltyPoints = user.loyaltyPoints || 0;
    const currentCoinBalance = user.coinBalance || 0;

    // Validate points to convert
    if (pointsToConvert > currentLoyaltyPoints) {
      return callback(new Error(`Cannot convert ${pointsToConvert} points. You only have ${currentLoyaltyPoints} points.`));
    }

    if (pointsToConvert <= 0) {
      return callback(new Error('Points to convert must be greater than 0'));
    }

    // Conversion rate: 10 points = 1 coin
    const coinsToAdd = Math.floor(pointsToConvert / 10);
    const newLoyaltyPoints = currentLoyaltyPoints - pointsToConvert;
    const newCoinBalance = currentCoinBalance + coinsToAdd;

    // Update both fields
    const sql = `
      UPDATE users
      SET loyaltyPoints = ?, coinBalance = ?, updatedAt = NOW()
      WHERE id = ?
    `;
    db.query(sql, [newLoyaltyPoints, newCoinBalance, userId], (err) => {
      if (err) return callback(err);
      callback(null, {
        pointsConverted: pointsToConvert,
        coinsAdded: coinsToAdd,
        remainingPoints: newLoyaltyPoints,
        newCoinBalance: newCoinBalance
      });
    });
  });
};

// Update coin balance (used at checkout when coins are redeemed)
exports.updateCoinBalance = (userId, coinAmount, callback) => {
  const sql = `
    UPDATE users
    SET coinBalance = coinBalance - ?
    WHERE id = ? AND coinBalance >= ?
  `;
  db.query(sql, [coinAmount, userId, coinAmount], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('Insufficient coin balance'));
    }
    callback(null);
  });
};
