// middleware.js

// Checks if the user is authenticated
const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to view this resource');
  return res.redirect('/login');
};

// Checks if user is an admin (for strict admin routes)
const checkAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') return next();
  req.flash('error', 'Access denied');
  return res.redirect('/shopping');
};

// Flexible authorization: restricts route to specified roles
const checkAuthorised = (roles = []) => {
  return (req, res, next) => {
    if (roles.length === 0 || (req.session.user && roles.includes(req.session.user.role))) {
      return next();
    }
    req.flash('error', 'You do not have permission to view this resource');
    return res.redirect('/');
  };
};

// Registration validation
const validateRegistration = (req, res, next) => {
  const { username, email, password, address, contact, role } = req.body;
  if (!username || !email || !password || !address || !contact || !role) {
    return res.status(400).send('All fields are required.');
  }
  if (password.length < 6) {
    req.flash('error', 'Password should be at least 6 or more characters long');
    req.flash('formData', req.body);
    return res.redirect('/register');
  }
  next();
};

// Export all middleware functions
module.exports = {
  checkAuthenticated,
  checkAdmin,
  checkAuthorised,
  validateRegistration
};
