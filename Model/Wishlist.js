const db = require('../db');

const Wishlist = {
    getWishlistByUser: function (userId, callback) {
        const sql = `
            SELECT 
                wishlist.id AS wishlistId,
                products.id AS productId,
                products.productName,
                products.price,
                products.image
            FROM wishlist
            JOIN products ON wishlist.productId = products.id
            WHERE wishlist.userId = ?
        `;
        db.query(sql, [userId], callback);
    },

    addToWishlist: function (userId, productId, callback) {
        const sql = `
            INSERT INTO wishlist (userId, productId)
            SELECT ?, ?
            FROM DUAL
            WHERE NOT EXISTS (
                SELECT * FROM wishlist WHERE userId = ? AND productId = ?
            )
        `;
        db.query(sql, [userId, productId, userId, productId], callback);
    },

    removeFromWishlist: function (id, callback) {
        const sql = "DELETE FROM wishlist WHERE id = ?";
        db.query(sql, [id], callback);
    }
};

module.exports = Wishlist;
