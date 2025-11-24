const Product = require('../Model/Product');

// Display all products (Shopping page)
exports.getAllProducts = (req, res) => {
    Product.getAllProducts((err, results) => {
        if (err) {
            console.error('Error retrieving products:', err);
            return res.status(500).send('Error retrieving products');
        }
        res.render('shopping', { products: results, user: req.session.user });
    });
};

// Display single product by ID
exports.getProductById = (req, res) => {
    const productId = req.params.id;
    Product.getProductById(productId, (err, product) => {
        if (err) {
            console.error('Error retrieving product by ID:', err);
            return res.status(500).send('Error retrieving product by ID');
        }
        if (product) {
            res.render('product', { product: product, user: req.session.user });
        } else {
            res.status(404).send('Product not found');
        }
    });
};

// Show add product form
exports.showAddForm = (req, res) => {
    res.render('addProduct');
};

// Handle add product
exports.addProduct = (req, res) => {
    const { productName, quantity, price, category, tags } = req.body;
    let image = null;
    if (req.file) image = req.file.filename;

    Product.addProduct(productName, quantity, price, image, category, tags, (err, results) => {
        if (err) {
            console.error('Error adding product:', err);
            return res.status(500).send('Error adding product');
        }
        res.redirect('/inventory');
    });
};

// Show edit product form
exports.showEditForm = (req, res) => {
    const productId = req.params.id;
    Product.getProductById(productId, (err, product) => {
        if (err) {
            console.error('Error retrieving product for edit:', err);
            return res.status(500).send('Error retrieving product');
        }
        if (product) {
            res.render('editProduct', { product: product });
        } else {
            res.status(404).send('Product not found');
        }
    });
};

// Handle update product
exports.updateProduct = (req, res) => {
    const productId = req.params.id;
    const { productName, quantity, price, currentImage, category, tags } = req.body;
    let image = currentImage;
    if (req.file) image = req.file.filename;

    Product.updateProduct(productId, productName, quantity, price, image, category, tags, (err, results) => {
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).send('Error updating product');
        }
        res.redirect('/inventory');
    });
};

// Delete product
exports.deleteProduct = (req, res) => {
    const productId = req.params.id;
    Product.deleteProduct(productId, (err, results) => {
        if (err) {
            console.error('Error deleting product:', err);
            return res.status(500).send('Error deleting product');
        }
        res.redirect('/inventory');
    });
};
exports.searchProducts = (req, res) => {
  const q = req.query.q;

  const sql = "SELECT * FROM products WHERE productName LIKE ? OR category LIKE ? OR tags LIKE ?";
  const values = ['%' + q + '%', '%' + q + '%', '%' + q + '%'];

  db.query(sql, values, (err, results) => {
    if (err) return res.status(500).send(err);

    res.render("shopping", {
      products: results,
      user: req.session.user
    });
  });
};

