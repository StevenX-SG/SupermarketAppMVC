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
    if (err || !product) {
      console.error('Error retrieving product:', err);
      return res.redirect('/shopping');
    }

    let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
    cart.add(product, productId, qty);

    req.session.cart = cart.serialize ? cart.serialize() : {
      items: cart.items,
      totalQty: cart.totalQty,
      totalPrice: cart.totalPrice
    };
    res.redirect('/cart');
  });
};

// === Update Item Quantity ===
exports.updateCartItem = (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const newQty = parseInt(req.body.quantity, 10);

  let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
  cart.updateQuantity(productId, newQty);

  req.session.cart = cart.serialize ? cart.serialize() : {
    items: cart.items,
    totalQty: cart.totalQty,
    totalPrice: cart.totalPrice
  };
  res.redirect('/cart');
};

// === Remove Cart Item ===
exports.removeCartItem = (req, res) => {
  const productId = parseInt(req.params.id, 10);

  let cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
  cart.remove(productId);

  req.session.cart = cart.serialize ? cart.serialize() : {
    items: cart.items,
    totalQty: cart.totalQty,
    totalPrice: cart.totalPrice
  };
  res.redirect('/cart');
};

// === Clear Cart ===
exports.clearCart = (req, res) => {
  req.session.cart = null;
  res.redirect('/cart');
};


// === Checkout ===
exports.checkout = async (req, res) => {
  const cart = req.session.cart ? new Cart(req.session.cart) : null;
  if (!cart || Object.keys(cart.items).length === 0) return res.redirect('/cart');

  const cartItems = Object.values(cart.items);
  const userId = req.session.user.id;
  const pointsEarned = Math.floor(cart.totalPrice);

  let tableRows = '';
  let subtotal = 0;

  for (const item of cartItems) {
    const product = await Product.getProductByIdAsync(item.id); // use a promise version
    if (!product) continue;

    const newQty = product.quantity - item.quantity;
    await Product.updateProductAsync(item.id, { quantity: newQty }); // async update

    const price = product.price * item.quantity;
    subtotal += price;

    tableRows += '<tr>' +
      '<td><img src="' + product.image + '" width="60"></td>' +
      '<td>' + product.productName + '</td>' +
      '<td>' + item.quantity + '</td>' +
      '<td>$' + price.toFixed(2) + '</td>' +
      '</tr>';
  }

  // Update loyalty points
  await db.promise().query("UPDATE users SET loyaltyPoints = loyaltyPoints + ? WHERE id = ?", [pointsEarned, userId]);
  const [rows] = await db.promise().query("SELECT loyaltyPoints FROM users WHERE id = ?", [userId]);
  const totalPoints = rows[0].loyaltyPoints;

  req.session.cart = null;

  const gst = subtotal * 0.07;
  const grandTotal = subtotal + gst;

  res.send(
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">' +
    '<div class="container mt-5">' +
      '<h1 class="text-center mb-4">🛒 Order Summary</h1>' +
      '<table class="table table-bordered text-center">' +
        '<thead class="table-light">' +
          '<tr><th>Image</th><th>Product</th><th>Quantity</th><th>Price</th></tr>' +
        '</thead>' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>' +
      '<div class="text-end mt-3">' +
        '<p>Subtotal: $' + subtotal.toFixed(2) + '</p>' +
        '<p>GST (7%): $' + gst.toFixed(2) + '</p>' +
        '<h3>Grand Total: $' + grandTotal.toFixed(2) + '</h3>' +
        '<p>You earned <b>' + pointsEarned + '</b> loyalty points! Total points: <b>' + totalPoints + '</b></p>' +
        '<a href="/shopping" class="btn btn-success me-2">Continue Shopping</a>' +
        '<a href="/profile" class="btn btn-outline-secondary">View Profile</a>' +
      '</div>' +
    '</div>'
  );
};


