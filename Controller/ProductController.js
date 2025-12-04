const Product = require('../Model/Product');
const db = require('../db');

// === Display all products (search + filters + sort) ===
exports.getAllProducts = function (req, res) {
  const { q,search, category, brand, minPrice, maxPrice, sort } = req.query;

  Product.getAllProducts(function (err, products) {
    if (err) {
      console.log('Error retrieving products:', err);
      return res.status(500).send('Error retrieving products');
    }

    // Sidebar lists
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

    let filtered = [...products];

    // Use q (from search bar) or search (from sidebar form)
    const keywordRaw = q || search;

    // Text search
    if (keywordRaw && keywordRaw.trim() !== '') {
      const keyword = keywordRaw.trim().toLowerCase();
      filtered = filtered.filter(p =>
        p.productName.toLowerCase().includes(keyword) ||
        (p.category && p.category.toLowerCase().includes(keyword)) ||
        (p.tags && p.tags.toLowerCase().includes(keyword))
      );
    }

    // Category filter
    if (category && category.trim() !== '') {
      filtered = filtered.filter(p => p.category === category);
    }

    // Brand filter (real brand column)
    if (brand && brand.trim() !== '') {
      filtered = filtered.filter(p => p.brand === brand);
    }

    // Price range filter
    if (minPrice) {
      const min = Number(minPrice);
      filtered = filtered.filter(p => Number(p.price) >= min);
    }
    if (maxPrice) {
      const max = Number(maxPrice);
      filtered = filtered.filter(p => Number(p.price) <= max);
    }

    // Sorting
    if (sort === 'price_asc') {
      filtered.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sort === 'price_desc') {
      filtered.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sort === 'name_asc') {
      filtered.sort((a, b) => a.productName.localeCompare(b.productName));
    }

    res.render('shopping', {
      products: filtered,
      user: req.session.user,
      search: keywordRaw || '',
      categories,
      brands,
      selectedCategory: category || '',
      selectedBrand: brand || '',
      minPrice: minPrice || '',
      maxPrice: maxPrice || '',
      sort: sort || ''
    });
  });
};

// === Display single product ===
exports.getProductById = function (req, res) {
  const productId = req.params.id;

  Product.getProductById(productId, function (err, product) {
    if (err) {
      console.log('Error retrieving product by ID:', err);
      return res.status(500).send('Error retrieving product by ID');
    }
    if (!product) {
      return res.status(404).send('Product not found');
    }

    res.render('product', { product, user: req.session.user });
  });
};

// === Show add product form ===
exports.showAddForm = function (req, res) {
  res.render('addProduct');
};

// === Add product ===
exports.addProduct = function (req, res) {
  const body = req.body;
  const productName = body.productName;
  const quantity = body.quantity;
  const price = body.price;
  const category = body.category;
  const tags = body.tags || "";
  const brand = body.brand || ""; 
  const imageURL = body.imageURL;

  let image = null;
  if (req.file) {
    image = req.file.filename;
  } else if (imageURL && imageURL.trim() !== '') {
    image = imageURL.trim();
  }

  Product.addProduct(productName, quantity, price, image, category, tags, brand, function (err) {
    if (err) {
      console.log('Error adding product:', err);
      return res.status(500).send('Error adding product');
    }
    res.redirect('/inventory');
  });
};

// === Show edit form ===
exports.showEditForm = function (req, res) {
  const productId = req.params.id;

  Product.getProductById(productId, function (err, product) {
    if (err) {
      console.log('Error retrieving product for edit:', err);
      return res.status(500).send('Error retrieving product');
    }
    if (!product) {
      return res.status(404).send('Product not found');
    }

    res.render('editProduct', { product });
  });
};

// === Update product ===
exports.updateProduct = function (req, res) {
  const body = req.body;
  const productId = req.params.id;
  const productName = body.productName;
  const quantity = body.quantity;
  const price = body.price;
  const currentImage = body.currentImage;
  const category = body.category;
  const tags = body.tags || "";
  const brand = body.brand || "";
  const imageURL = body.imageURL;

  let image = currentImage;
  if (req.file) {
    image = req.file.filename;
  } else if (imageURL && imageURL.trim() !== '') {
    image = imageURL.trim();
  }

  Product.updateProduct(
    productId,
    productName,
    quantity,
    price,
    image,
    category,
    tags,
    brand,
    function (err) {
      if (err) {
        console.log('Error updating product:', err);
        return res.status(500).send('Error updating product');
      }
      res.redirect('/inventory');
    }
  );
};

// === Delete product ===
exports.deleteProduct = function (req, res) {
  const productId = req.params.id;

  Product.deleteProduct(productId, function (err) {
    if (err) {
      console.log('Error deleting product:', err);
      return res.status(500).send('Error deleting product');
    }
    res.redirect('/inventory');
  });
};

// === Delete product (soft delete) ===
exports.deleteProduct = function (req, res) {
  const productId = req.params.id;

  Product.softDeleteProduct(productId, function (err) {
    if (err) {
      console.log('Error soft-deleting product:', err);
      return res.status(500).send('Error deleting product');
    }
    res.redirect('/inventory');
  });
};

