// Model/Voucher.js
const db = require('../db');

// Get all vouchers for a user
exports.getVouchersByUserId = (userId, callback) => {
  const sql = `
    SELECT * FROM vouchers
    WHERE userId = ?
    ORDER BY expiryDate ASC
  `;
  db.query(sql, [userId], callback);
};

// Get active (unused and not expired) vouchers for a user
exports.getActiveVouchers = (userId, callback) => {
  const sql = `
    SELECT * FROM vouchers
    WHERE userId = ? AND isUsed = FALSE AND expiryDate > CURDATE()
    ORDER BY expiryDate ASC
  `;
  db.query(sql, [userId], callback);
};

// Get a specific voucher by code
exports.getVoucherByCode = (code, userId, callback) => {
  const sql = `
    SELECT * FROM vouchers
    WHERE code = ? AND userId = ?
  `;
  db.query(sql, [code, userId], callback);
};

// Add a new voucher for a user
// discountType: 'fixed' (discountAmount) or 'percentage' (discountPercentage)
exports.addVoucher = (userId, code, discountAmount, discountPercentage, expiryDate, callback) => {
  if (!code || code.trim() === '') {
    return callback(new Error('Voucher code is required'));
  }

  if (!expiryDate) {
    return callback(new Error('Expiry date is required'));
  }

  if (!discountAmount && !discountPercentage) {
    return callback(new Error('Either discountAmount or discountPercentage must be provided'));
  }

  const sql = `
    INSERT INTO vouchers (userId, code, discountAmount, discountPercentage, expiryDate, isUsed, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, FALSE, NOW(), NOW())
  `;
  db.query(sql, [userId, code, discountAmount || 0, discountPercentage || 0, expiryDate], callback);
};

// Mark voucher as used
exports.useVoucher = (voucherId, callback) => {
  const sql = `
    UPDATE vouchers
    SET isUsed = TRUE, usedDate = NOW(), updatedAt = NOW()
    WHERE id = ?
  `;
  db.query(sql, [voucherId], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('Voucher not found'));
    }
    callback(null);
  });
};

// Delete a voucher
exports.deleteVoucher = (voucherId, userId, callback) => {
  const sql = `
    DELETE FROM vouchers
    WHERE id = ? AND userId = ?
  `;
  db.query(sql, [voucherId, userId], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows === 0) {
      return callback(new Error('Voucher not found or unauthorized'));
    }
    callback(null);
  });
};

// Get voucher by ID and validate it's still valid
exports.validateVoucher = (voucherId, userId, callback) => {
  const sql = `
    SELECT * FROM vouchers
    WHERE id = ? AND userId = ? AND isUsed = FALSE AND expiryDate > CURDATE()
  `;
  db.query(sql, [voucherId, userId], (err, results) => {
    if (err) return callback(err);
    if (!results || results.length === 0) {
      return callback(new Error('Voucher is invalid, expired, or already used'));
    }
    callback(null, results[0]);
  });
};

// Calculate discount amount based on voucher type
exports.calculateDiscount = (voucher, orderTotal, callback) => {
  if (voucher.discountAmount > 0) {
    // Fixed amount discount
    const discount = Math.min(voucher.discountAmount, orderTotal);
    callback(null, discount);
  } else if (voucher.discountPercentage > 0) {
    // Percentage discount
    const discount = (orderTotal * voucher.discountPercentage) / 100;
    callback(null, discount);
  } else {
    callback(new Error('Invalid voucher discount'));
  }
};

// Get all expired vouchers for cleanup/reporting
exports.getExpiredVouchers = (userId, callback) => {
  const sql = `
    SELECT * FROM vouchers
    WHERE userId = ? AND expiryDate <= CURDATE()
    ORDER BY expiryDate DESC
  `;
  db.query(sql, [userId], callback);
};

// Bulk add vouchers (admin function - for promotional campaigns)
exports.bulkAddVouchers = (userIds, code, discountAmount, discountPercentage, expiryDate, callback) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return callback(new Error('User IDs array is required and must not be empty'));
  }

  const placeholders = userIds.map(() => '(?, ?, ?, ?, ?, FALSE, NOW(), NOW())').join(',');
  const values = [];

  userIds.forEach(userId => {
    values.push(userId, code, discountAmount || 0, discountPercentage || 0, expiryDate);
  });

  const sql = `
    INSERT INTO vouchers (userId, code, discountAmount, discountPercentage, expiryDate, isUsed, createdAt, updatedAt)
    VALUES ${placeholders}
  `;

  db.query(sql, values, callback);
};
