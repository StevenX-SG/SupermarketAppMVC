const Wishlist = require('../Model/Wishlist');
const Cart = require('../Model/Cart');
const Product = require('../Model/Product');

exports.getWishlist = (req, res) => {
    const userId = req.session.user.id;

    Wishlist.getWishlistByUser(userId, (err, results) => {
        if (err) return res.status(500).send("Error loading wishlist");

        res.render("wishlist", {
            wishlist: results,
            user: req.session.user
        });
    });
};

exports.addToWishlist = (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.id;

    Wishlist.addToWishlist(userId, productId, (err, result) => {
        if (err) return res.status(500).send("Error adding to wishlist");

        res.redirect('/wishlist');
    });
};

exports.removeFromWishlist = (req, res) => {
    const id = req.params.id;

    Wishlist.removeFromWishlist(id, (err) => {
        if (err) return res.status(500).send("Error removing item");

        res.redirect('/wishlist');
    });
};

// === From wishlist: add product to cart and remove from wishlist ===
exports.addToCartAndRemove = (req, res) => {
  const wishlistId = parseInt(req.params.wishlistId, 10);
  const productId  = parseInt(req.params.productId, 10);

  Product.getProductById(productId, (err, product) => {
    if (err || !product) return res.redirect('/wishlist');

    // Add to cart (quantity = 1)
    const cart = req.session.cart ? new Cart(req.session.cart) : new Cart();
    cart.add(product, productId, 1);
    req.session.cart = cart.serialize();

    // Remove from wishlist
    Wishlist.removeFromWishlist(wishlistId, (err2) => {
      if (err2) return res.status(500).send('Error removing item from wishlist');
      res.redirect('/wishlist');
    });
  });
};