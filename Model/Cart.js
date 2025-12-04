class Cart {
  constructor(oldCart) {
    this.items = oldCart && oldCart.items ? oldCart.items : {};
    this.totalQty = oldCart && oldCart.totalQty ? oldCart.totalQty : 0;
    this.totalPrice = oldCart && oldCart.totalPrice ? oldCart.totalPrice : 0;
  }

  add(product, id, qty) {
    let storedItem = this.items[id];
    if (!storedItem) {
      storedItem = this.items[id] = {
        id: id,
        productName: product.productName || '', // default empty string
        image: product.image || '',             // default empty string
        price: Number(product.price) || 0,      // ensure number
        category: product.category || '',   // new
        tags: product.tags || '',           // new
        quantity: 0,
        maxQuantity: Number(product.quantity) || 0
      };
    }
    storedItem.quantity += Number(qty);
    this.totalQty += Number(qty);
    this.totalPrice += Number(qty) * storedItem.price;
  }

  remove(id) {
    const item = this.items[id];
    if (item) {
      this.totalQty -= item.quantity;
      this.totalPrice -= item.price * item.quantity;
      delete this.items[id];
    }
  }

  updateQuantity(id, newQty) {
    const item = this.items[id];
    if (item) {
      const diff = Number(newQty) - item.quantity;
      this.totalQty += diff;
      this.totalPrice += diff * item.price;
      item.quantity = Number(newQty);
    }
  }

  getItemsArray() {
    return Object.values(this.items);
  }

  serialize() {
    return {
      items: this.items,
      totalQty: this.totalQty,
      totalPrice: this.totalPrice
    };
  }
}

module.exports = Cart;
