const db = require('../db');
const User = require('../Model/User');
const Voucher = require('../Model/Voucher');

exports.showProfile = (req, res) => {
  const userId = req.session.user.id;

  const sql = "SELECT username, email, contact, address, loyaltyPoints FROM users WHERE id = ?";
  db.query(sql, [userId], (err, results) => {
    if (err) throw err;
    res.render('profile', {
      user: req.session.user,
      profile: results[0]
    });
  });
};

exports.updateProfile = (req, res) => {
  const { username, email, contact, address } = req.body;
  const userId = req.session.user.id;

  const sql = "UPDATE users SET username = ?, email = ?, contact = ?, address = ? WHERE id = ?";
  db.query(sql, [username, email, contact, address, userId], (err, results) => {
    if (err) throw err;

    // Update session so navbar shows new username
    req.session.user.username = username;
    req.session.user.email = email;

    res.redirect('/profile');
  });
};

// =====================================================
// WALLET FUNCTIONS
// =====================================================

// Show wallet page
exports.showWallet = (req, res) => {
  const userId = req.session.user.id;

  // Get user wallet info
  User.getWalletInfo(userId, (err, userResults) => {
    if (err) {
      return res.status(500).render('error', { error: 'Failed to load wallet info', user: req.session.user });
    }

    if (!userResults || userResults.length === 0) {
      return res.status(404).render('error', { error: 'User not found', user: req.session.user });
    }

    const wallet = userResults[0];

    // Get active vouchers
    Voucher.getActiveVouchers(userId, (err, vouchers) => {
      if (err) {
        console.error('Error loading vouchers:', err);
        vouchers = [];
      }

      res.render('MyWallet', {
        user: req.session.user,
        wallet: wallet,
        vouchers: vouchers || [],
        messages: req.flash('success'),
        errors: req.flash('error')
      });
    });
  });
};

// Top-up wallet (add variable amount from form selection - $10, $25, or $50)
exports.topUpWallet = (req, res) => {
  const userId = req.session.user?.id;
  const topUpAmount = parseInt(req.body.topUpAmount) || 10;

  console.log('[profileController.topUpWallet] Request received:', {
    userId,
    topUpAmount,
    sessionBalance: req.session.user.walletBalance
  });

  // Validates against whitelist
  const allowedAmounts = [10, 25, 50];
  if (!allowedAmounts.includes(topUpAmount)) {
    req.flash('error', `Invalid top-up amount. Allowed amounts: $${allowedAmounts.join(', $')}`);
    return res.redirect('/account/wallet');
  }

  // Checks user authentication
  if (!userId) {
    req.flash('error', 'You must be logged in to top up your wallet');
    return res.redirect('/login');
  }

  User.topUpWallet(userId, topUpAmount, (err, result) => {
    if (err) {
      console.error('[profileController.topUpWallet] ✗ Database error:', err.message);
      req.flash('error', 'Failed to top up wallet: ' + err.message);
      return res.redirect('/account/wallet');
    }

    // Update session wallet balance - ensure numeric conversion
    const previousBalance = parseFloat(req.session.user.walletBalance) || 0;
    const newBalance = previousBalance + topUpAmount;
    req.session.user.walletBalance = newBalance;

    console.log('[profileController.topUpWallet] ✓ Top-up successful:', {
      userId,
      topUpAmount,
      previousBalance,
      newBalance
    });

    req.flash('success', `Wallet topped up by $${topUpAmount}! New balance: $${newBalance.toFixed(2)}`);
    res.redirect('/account/wallet');
  });
};

// Convert loyalty points to coins
exports.convertPointsToCoin = (req, res) => {
  const userId = req.session.user.id;
  const { pointsToConvert } = req.body;

  const points = parseInt(pointsToConvert);
  if (isNaN(points) || points <= 0) {
    req.flash('error', 'Please enter a valid amount of points');
    return res.redirect('/account/wallet');
  }

  User.convertPointsToCoinAdvanced(userId, points, (err, result) => {
    if (err) {
      req.flash('error', 'Conversion failed: ' + err.message);
      return res.redirect('/account/wallet');
    }

    // Update session
    req.session.user.loyaltyPoints = result.remainingPoints;
    req.session.user.coinBalance = result.newCoinBalance;

    req.flash('success', result.message);
    res.redirect('/account/wallet');
  });
};

// Use coins for discount (typically at checkout, but can test here)
exports.useCoins = (req, res) => {
  const userId = req.session.user.id;
  const { coinsToUse } = req.body;

  const coins = parseInt(coinsToUse);
  if (isNaN(coins) || coins <= 0) {
    req.flash('error', 'Please enter a valid number of coins');
    return res.redirect('/account/wallet');
  }

  User.updateCoinBalance(userId, coins, (err) => {
    if (err) {
      req.flash('error', 'Failed to use coins: ' + err.message);
      return res.redirect('/account/wallet');
    }

    // Update session
    req.session.user.coinBalance = (req.session.user.coinBalance || 0) - coins;

    req.flash('success', `Successfully used ${coins} coin(s) for a discount!`);
    res.redirect('/account/wallet');
  });
};

// Redeem a voucher code
exports.redeemVoucher = (req, res) => {
  const userId = req.session.user.id;
  const { voucherCode } = req.body;

  if (!voucherCode || voucherCode.trim() === '') {
    req.flash('error', 'Please enter a valid voucher code');
    return res.redirect('/account/wallet');
  }

  Voucher.getVoucherByCode(voucherCode, userId, (err, results) => {
    if (err) {
      req.flash('error', 'Error looking up voucher: ' + err.message);
      return res.redirect('/account/wallet');
    }

    if (!results || results.length === 0) {
      req.flash('error', 'Voucher code not found');
      return res.redirect('/account/wallet');
    }

    const voucher = results[0];

    // Validate voucher
    if (voucher.isUsed) {
      req.flash('error', 'This voucher has already been used');
      return res.redirect('/account/wallet');
    }

    if (new Date(voucher.expiryDate) < new Date()) {
      req.flash('error', 'This voucher has expired');
      return res.redirect('/account/wallet');
    }

    // In a real system, you'd apply this voucher at checkout
    // For now, just show the voucher details
    req.flash('success', `Voucher "${voucherCode}" is valid! You can use this at checkout for ${voucher.discountAmount > 0 ? '$' + voucher.discountAmount + ' off' : voucher.discountPercentage + '% off'}`);
    res.redirect('/account/wallet');
  });
};

// Get wallet API endpoint (for AJAX calls)
exports.getWalletAPI = (req, res) => {
  const userId = req.session.user.id;

  User.getWalletInfo(userId, (err, userResults) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to load wallet info' });
    }

    if (!userResults || userResults.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const wallet = userResults[0];

    Voucher.getActiveVouchers(userId, (err, vouchers) => {
      if (err) {
        vouchers = [];
      }

      res.json({
        success: true,
        wallet: wallet,
        vouchersCount: (vouchers || []).length
      });
    });
  });
};
