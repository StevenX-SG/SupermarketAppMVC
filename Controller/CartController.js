const Cart = require('../Model/Cart');
const Product = require('../Model/Product');
const db = require('../db');

// === Display Cart ===
exports.getCart = (req, res) => {
  const cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
  res.render('cart', {
    cart: cart.getItemsArray(),
    total: cart.totalPrice,
    user: req.session.user
  });
};

// === Add Single Item to Cart ===
exports.addToCart = (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const qty = parseInt(req.body.quantity, 10) || 1;

  Product.getProductById(productId, (err, product) => {
    if (err || !product) return res.redirect('/shopping');

    let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
    cart.add(product, productId, qty);

    req.session.cart = cart.serialize();
    res.redirect('/cart');
  });
};

// === Update Item Quantity ===
exports.updateCartItem = (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const newQty = parseInt(req.body.quantity, 10);

  let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
  cart.updateQuantity(productId, newQty);

  req.session.cart = cart.serialize();
  res.redirect('/cart');
};

// === Remove Cart Item ===
exports.removeCartItem = (req, res) => {
  const productId = parseInt(req.params.id, 10);

  let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
  cart.remove(productId);

  req.session.cart = cart.serialize();
  res.redirect('/cart');
};

// === Clear Cart ===
exports.clearCart = (req, res) => {
  req.session.cart = null;
  res.redirect('/cart');
};

exports.showCheckout = (req, res) => {
  // Use current session cart
  const cart = req.session.cart ? new Cart(req.session.cart) : null;

  // If cart empty, go back to cart page
  if (!cart || Object.keys(cart.items).length === 0) {
    return res.redirect('/cart');
  }

  // Data for checkout.ejs
  const cartItems = cart.getItemsArray();
  const subtotal = cart.totalPrice;

  res.render('checkout', {
    user: req.session.user,
    cartItems,
    subtotal
  });
};

