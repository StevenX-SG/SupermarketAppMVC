const User = require('../Model/User');

// (Optional) User List – if you no longer use /users page, you can just redirect
exports.getAllUsers = (req, res) => {
  // Either redirect to admin:
  return res.redirect('/admin');

  // Or, if you still want a separate userList view, keep this instead:
  /*
  User.getAllUsers((err, users) => {
    if (err) {
      console.error('Error retrieving users:', err);
      return res.status(500).send('Error retrieving users');
    }
    res.render('userList', { users });
  });
  */
};

// Show Add User Form
exports.showAddForm = (req, res) => {
  res.render('addUser', { user: req.session.user });
};

// Add User (Create) → back to admin dashboard
exports.addUser = (req, res) => {
  const { username, email, password, address, contact, role } = req.body;
  User.addUser(username, email, password, address, contact, role, (err) => {
    if (err) {
      console.error('Error adding user:', err);
      return res.status(500).send('Error adding user');
    }
    res.redirect('/admin');
  });
};

// Show Edit User Form
exports.showEditForm = (req, res) => {
  const userId = req.params.id;
  User.getUserById(userId, (err, results) => {
    if (err) {
      console.error('Error retrieving user:', err);
      return res.status(500).send('Error retrieving user');
    }
    if (results && results.length > 0) {
      res.render('editUser', { user: results[0], currentUser: req.session.user });
    } else {
      res.status(404).send('User not found');
    }
  });
};

// Update User (Update) → back to admin dashboard
exports.updateUser = (req, res) => {
  const userId = req.params.id;
  const { username, email, password, address, contact, role } = req.body;

  User.updateUser(userId, username, email, password, address, contact, role, (err) => {
    if (err) {
      console.error('Error updating user:', err);
      return res.status(500).send('Error updating user');
    }
    res.redirect('/admin');
  });
};

// Delete User (Delete) → back to admin dashboard
exports.deleteUser = (req, res) => {
  const userId = req.params.id;
  User.deleteUser(userId, (err) => {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).send('Error deleting user');
    }
    res.redirect('/admin');
  });
};

// Convert loyalty points to coins
exports.convertPointsToCoin = (req, res) => {
  const userId = req.session.user?.id;
  const { pointsToConvert } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  if (!pointsToConvert || pointsToConvert <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid points amount' });
  }

  User.convertPointsToCoin(userId, parseInt(pointsToConvert), (err, result) => {
    if (err) {
      console.error('Error converting points to coins:', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    // Update session user data
    req.session.user.loyaltyPoints = result.remainingPoints;
    req.session.user.coinBalance = result.newCoinBalance;

    res.json({
      success: true,
      message: `Successfully converted ${result.pointsConverted} points to ${result.coinsAdded} coins!`,
      data: result
    });
  });
};
