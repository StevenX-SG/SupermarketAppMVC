const User = require('../Model/User');

// User List (Read All)
exports.getAllUsers = (req, res) => {
    User.getAllUsers((err, users) => {
        if (err) {
            console.error('Error retrieving users:', err);
            return res.status(500).send('Error retrieving users');
        }
        res.render('userList', { users });
    });
};

// Show Add User Form
exports.showAddForm = (req, res) => {
    res.render('addUser');
};

// Add User (Create)
exports.addUser = (req, res) => {
    const { username, email, password } = req.body;
    User.addUser(username, email, password, (err) => {
        if (err) {
            console.error('Error adding user:', err);
            return res.status(500).send('Error adding user');
        }
        res.redirect('/users');
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
            res.render('editUser', { user: results[0] });
        } else {
            res.status(404).send('User not found');
        }
    });
};

// Update User (Update)
exports.updateUser = (req, res) => {
    const userId = req.params.id;
    const { username, email, password } = req.body;
    User.updateUser(userId, username, email, password, (err) => {
        if (err) {
            console.error('Error updating user:', err);
            return res.status(500).send('Error updating user');
        }
        res.redirect('/users');
    });
};

// Delete User (Delete)
exports.deleteUser = (req, res) => {
    const userId = req.params.id;
    User.deleteUser(userId, (err) => {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).send('Error deleting user');
        }
        res.redirect('/users');
    });
};

