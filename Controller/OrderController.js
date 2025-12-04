const Order = require('../Model/Order');
const Cart = require('../Model/Cart');
const Product = require('../Model/Product');
const db = require('../db');

// === Display all orders for a user (with items) ===
exports.getOrdersByUser = (req, res) => {
  const userId = req.session.user.id;

  Order.getOrdersByUser(userId, (err, orders) => {
    if (err) return res.status(500).send('Error loading orders');

    Order.getOrderItemsByUser(userId, (err2, items) => {
      if (err2) return res.status(500).send('Error loading order items');

      const itemsByOrder = {};
      (items || []).forEach(item => {
        const oid = item.orderId;
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(item);
      });

      const ordersWithItems = (orders || []).map(o => ({
        ...o,
        items: itemsByOrder[o.id] || []
      }));

      res.render('orders', {
        orders: ordersWithItems,
        user: req.session.user
      });
    });
  });
};

// === Display a single order with items (reuses orders.ejs) ===
exports.getOrderDetails = (req, res) => {
  const orderId = req.params.id;
  const userId = req.session.user.id;

  const orderQuery = 'SELECT * FROM orders WHERE id = ? AND userId = ?';
  const itemsQuery = `
    SELECT oi.*, p.productName, p.price
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    WHERE oi.orderId = ?
  `;

  db.query(orderQuery, [orderId, userId], (err, orderRows) => {
    if (err || !orderRows.length) return res.send('Order not found');

    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) return res.send('Error loading order items');

      const order = orderRows[0];
      order.items = items || [];

      res.render('orders', {
        orders: [order],
        user: req.session.user
      });
    });
  });
};

// === Checkout: create order from cart (POST /checkout) ===
exports.createOrderFromCart = (req, res) => {
  const cart = req.session.cart ? new Cart(req.session.cart) : null;
  if (!cart || Object.keys(cart.items).length === 0) return res.redirect('/cart');

  const userId = req.session.user.id;
  const subtotal = cart.totalPrice;
  const gstRate = 0.09; // 9% GST
  const gst = subtotal * gstRate;
  const totalAmount = subtotal + gst;
  const pointsEarned = Math.floor(subtotal); // Loyalty points: earn 1 point for every $1 of subtotal (before GST), rounded down

  // 1. Insert order into orders table
  Order.createOrder(userId, totalAmount, (err, result) => {
    if (err) return res.status(500).send('Error creating order');

    const orderId = result.insertId;
    const cartItems = Object.values(cart.items);
    let processedCount = 0;

    console.log('Created order', { orderId, userId, totalAmount });

    cartItems.forEach(item => {
      console.log('About to insert order item:', {
        orderId,
        productId: item.id,
        quantity: item.quantity,
        price: item.price
      });

      // 2. Insert each item into order_items table
      Order.addOrderItem(orderId, item.id, item.quantity, item.price, (err2) => {
        if (err2) {
          console.error('Error inserting order item:', err2);
        } else {
          console.log('Inserted order item OK for orderId', orderId);
        }

        // 3. Update product stock
        Product.getProductById(item.id, (err3, product) => {
          if (err3 || !product) {
            console.error(err3 || 'Product not found for stock update');
            return;
          }

          const newStock = product.quantity - item.quantity;

          // IMPORTANT: this must match your Product.updateProduct signature
          Product.updateProduct(
            item.id,
            product.productName,
            newStock,
            product.price,
            product.image,
            product.category || '',
            product.tags || '',
            product.brand || '',      // include brand if your model expects it
            (err4) => {
              if (err4) console.error('Error updating product stock:', err4);

              processedCount++;
              if (processedCount === cartItems.length) {
                // 4. Update user loyalty points
                const newPoints = (req.session.user.loyaltyPoints || 0) + pointsEarned;
                db.query(
                  'UPDATE users SET loyaltyPoints = ? WHERE id = ?',
                  [newPoints, userId],
                  (err5) => {
                    if (err5) console.error('Error updating loyalty points:', err5);

                    req.session.user.loyaltyPoints = newPoints;
                    req.session.cart = null;

                    // 5. Redirect to order details page
                    res.redirect('/orders/' + orderId);
                  }
                );
              }
            }
          );
        });
      });
    });
  });
};

// === Update order status (admin only) ===
exports.updateOrderStatus = (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  Order.updateOrderStatus(orderId, status, (err) => {
    if (err) return res.status(500).send(err);
    res.redirect('/admin?tab=orders');
  });
};

// === Delete an order (admin only) ===
exports.deleteOrder = (req, res) => {
  const orderId = req.params.id;

  Order.deleteOrder(orderId, (err) => {
    if (err) return res.status(500).send(err);
    res.redirect('/admin?tab=orders');
  });
};

exports.getUserInvoice = (req, res) => {
  const orderId = req.params.orderId;
  const userId = req.session.user.id;

  const orderQuery = 'SELECT * FROM orders WHERE id = ? AND userId = ?';
  const itemsQuery = `
    SELECT oi.*, p.productName, p.image
    FROM order_items oi
    JOIN products p ON oi.productId = p.id
    WHERE orderId = ?
  `;

  db.query(orderQuery, [orderId, userId], (err, orderRows) => {
    if (err || !orderRows.length) return res.send('Order not found');

    const order = orderRows[0];

    db.query(itemsQuery, [orderId], (err2, items) => {
      if (err2) return res.send('Error loading order items');

      let subtotal = 0;
      (items || []).forEach(it => {
        subtotal += Number(it.price) * Number(it.quantity);
      });

      const gstRate = 0.09; // 9% GST
      const gst = subtotal * gstRate;
      const grandTotal = subtotal + gst;

      res.render('invoice', {
        order,
        items,
        subtotal,
        gst,
        grandTotal,
        user: req.session.user
      });
    });
  });
};
