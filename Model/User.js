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
// Table columns: id, username, email, password, address, contact, role, loyaltyPoints, coinBalance, walletBalance, createdAt, updatedAt
exports.addUser = (username, email, password, address, contact, role, callback) => {
  const sql = `
    INSERT INTO users (username, email, password, address, contact, role, loyaltyPoints, coinBalance, walletBalance, createdAt, updatedAt)
    VALUES (?, ?, SHA1(?), ?, ?, ?, 0, 0, 0.00, NOW(), NOW())
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

// =====================================================
// WALLET FUNCTIONS
// =====================================================

// Get wallet information for a user
exports.getWalletInfo = (userId, callback) => {
  const sql = `
    SELECT 
      id,
      username,
      walletBalance,
      coinBalance,
      loyaltyPoints,
      payLaterLimit,
      payLaterBalance
    FROM users
    WHERE id = ?
  `;
  db.query(sql, [userId], callback);
};

// Top up wallet (add funds)
exports.topUpWallet = (userId, amount, callback) => {
  if (!amount || amount <= 0) {
    return callback(new Error('Top-up amount must be greater than 0'));
  }

  const sql = `
    UPDATE users
    SET walletBalance = walletBalance + ?
    WHERE id = ?
  `;
  db.query(sql, [amount, userId], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('User not found'));
    }
    
    // Record transaction
    const transactionSql = `
      INSERT INTO wallet_transactions (userId, transactionType, amount, balanceAfter, description)
      SELECT ?, 'top_up', ?, walletBalance, ?
      FROM users WHERE id = ?
    `;
    db.query(transactionSql, [userId, amount, `Wallet top-up of $${amount}`, userId], (err) => {
      if (err) return callback(err);
      callback(null, { success: true, message: `Wallet topped up by $${amount}` });
    });
  });
};

// Use wallet balance (subtract from wallet during checkout)
exports.useWalletBalance = (userId, amount, callback) => {
  if (!amount || amount <= 0) {
    return callback(new Error('Amount must be greater than 0'));
  }

  const sql = `
    UPDATE users
    SET walletBalance = walletBalance - ?
    WHERE id = ? AND walletBalance >= ?
  `;
  db.query(sql, [amount, userId, amount], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('Insufficient wallet balance'));
    }
    
    // Record transaction
    const transactionSql = `
      INSERT INTO wallet_transactions (userId, transactionType, amount, balanceAfter, description)
      SELECT ?, 'purchase', ?, walletBalance, ?
      FROM users WHERE id = ?
    `;
    db.query(transactionSql, [userId, amount, `Purchase - $${amount} deducted`, userId], (err) => {
      if (err) return callback(err);
      callback(null);
    });
  });
};

// Convert loyalty points to coins with conversion rule: 10 points = 1 coin
exports.convertPointsToCoinAdvanced = (userId, pointsToConvert, callback) => {
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
    if (coinsToAdd === 0) {
      return callback(new Error('You need at least 10 loyalty points to convert to a coin'));
    }

    const newLoyaltyPoints = currentLoyaltyPoints - pointsToConvert;
    const newCoinBalance = currentCoinBalance + coinsToAdd;

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
        newCoinBalance: newCoinBalance,
        message: `Successfully converted ${pointsToConvert} points to ${coinsToAdd} coin(s)!`
      });
    });
  });
};

// Set pay-later limit (admin/system function)
exports.setPayLaterLimit = (userId, limit, callback) => {
  if (!limit || limit < 0) {
    return callback(new Error('Pay-later limit must be a valid positive number'));
  }

  const sql = `
    UPDATE users
    SET payLaterLimit = ?
    WHERE id = ?
  `;
  db.query(sql, [limit, userId], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('User not found'));
    }
    callback(null, { success: true });
  });
};

// Use pay-later (increase balance owed)
exports.usePayLater = (userId, amount, callback) => {
  exports.getUserById(userId, (err, results) => {
    if (err) return callback(err);
    if (!results || results.length === 0) {
      return callback(new Error('User not found'));
    }

    const user = results[0];
    const limit = user.payLaterLimit || 0;
    const currentBalance = user.payLaterBalance || 0;

    if (currentBalance + amount > limit) {
      return callback(new Error(`Pay-later limit exceeded. Current: $${currentBalance}, Attempting: $${amount}, Limit: $${limit}`));
    }

    const newBalance = currentBalance + amount;
    const sql = `
      UPDATE users
      SET payLaterBalance = ?
      WHERE id = ?
    `;
    db.query(sql, [newBalance, userId], (err) => {
      if (err) return callback(err);
      callback(null, { payLaterBalance: newBalance });
    });
  });
};
