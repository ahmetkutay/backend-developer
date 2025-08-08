"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryManager = exports.products = void 0;
exports.products = [
    {
        id: "product-1",
        name: "Laptop",
        stock: 50,
        reserved: 5,
        available: 45
    },
    {
        id: "product-2",
        name: "Mouse",
        stock: 100,
        reserved: 10,
        available: 90
    },
    {
        id: "product-3",
        name: "Keyboard",
        stock: 75,
        reserved: 15,
        available: 60
    },
    {
        id: "product-4",
        name: "Monitor",
        stock: 30,
        reserved: 25,
        available: 5
    },
    {
        id: "product-5",
        name: "Headphones",
        stock: 0,
        reserved: 0,
        available: 0
    }
];
class InventoryManager {
    static checkAvailability(productId, quantity) {
        const product = this.inventory.get(productId);
        if (!product) {
            console.log(`❌ Product ${productId} not found in inventory`);
            return false;
        }
        const isAvailable = product.available >= quantity;
        console.log(`📦 Product ${productId} (${product.name}): Available=${product.available}, Requested=${quantity}, Status=${isAvailable ? 'Available' : 'Out of Stock'}`);
        return isAvailable;
    }
    static reserveStock(productId, quantity) {
        const product = this.inventory.get(productId);
        if (!product) {
            return false;
        }
        if (product.available >= quantity) {
            product.available -= quantity;
            product.reserved += quantity;
            console.log(`✅ Reserved ${quantity} units of ${product.name}. Available: ${product.available}, Reserved: ${product.reserved}`);
            return true;
        }
        return false;
    }
    static releaseStock(productId, quantity) {
        const product = this.inventory.get(productId);
        if (!product) {
            return false;
        }
        if (product.reserved >= quantity) {
            product.reserved -= quantity;
            product.available += quantity;
            console.log(`🔄 Released ${quantity} units of ${product.name}. Available: ${product.available}, Reserved: ${product.reserved}`);
            return true;
        }
        return false;
    }
    static getProduct(productId) {
        return this.inventory.get(productId);
    }
    static getAllProducts() {
        return Array.from(this.inventory.values());
    }
    static updateStock(productId, newStock) {
        const product = this.inventory.get(productId);
        if (!product) {
            return false;
        }
        const difference = newStock - product.stock;
        product.stock = newStock;
        product.available += difference;
        console.log(`📈 Updated stock for ${product.name}: Stock=${product.stock}, Available=${product.available}`);
        return true;
    }
}
exports.InventoryManager = InventoryManager;
_a = InventoryManager;
InventoryManager.inventory = new Map();
(() => {
    exports.products.forEach(product => {
        _a.inventory.set(product.id, { ...product });
    });
})();
//# sourceMappingURL=products.js.map