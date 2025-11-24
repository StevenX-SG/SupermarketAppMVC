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
        productName: product.productName,
        image: product.image,
        price: product.price,
        quantity: 0,
        maxQuantity: product.quantity // just in case you want to use it
      };
    }
    storedItem.quantity += Number(qty);
    this.totalQty += Number(qty);
    this.totalPrice += Number(qty) * product.price;
    // Note: price * quantity is always available as storedItem.price * storedItem.quantity in your EJS
  }

  remove(id) {
    if (this.items[id]) {
      this.totalQty -= this.items[id].quantity;
      this.totalPrice -= this.items[id].price * this.items[id].quantity;
      delete this.items[id];
    }
  }

  updateQuantity(id, newQty) {
    let item = this.items[id];
    if (item) {
      this.totalQty += (newQty - item.quantity);
      this.totalPrice += (newQty - item.quantity) * item.price;
      item.quantity = newQty;
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
