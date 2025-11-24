const db = require('../db');

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
