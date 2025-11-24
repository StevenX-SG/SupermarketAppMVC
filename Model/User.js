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

// Register user
exports.registerUser = (username, email, password, callback) => {
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.query(sql, [username, email, password], callback);
};

// User login
exports.loginUser = (email, password, callback) => {
    const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
    db.query(sql, [email, password], callback);
};
