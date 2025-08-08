// Mock inventory data for demonstration purposes
export interface Product {
  id: string;
  name: string;
  stock: number;
  reserved: number;
  available: number;
}

// Sample product inventory
export const products: Product[] = [
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

// Inventory management functions
export class InventoryManager {
  private static inventory = new Map<string, Product>();

  static {
    // Initialize inventory with sample data
    products.forEach(product => {
      this.inventory.set(product.id, { ...product });
    });
  }

  /**
   * Check if a product has sufficient stock
   */
  static checkAvailability(productId: string, quantity: number): boolean {
    const product = this.inventory.get(productId);
    if (!product) {
      console.log(`❌ Product ${productId} not found in inventory`);
      return false;
    }

    const isAvailable = product.available >= quantity;
    console.log(`📦 Product ${productId} (${product.name}): Available=${product.available}, Requested=${quantity}, Status=${isAvailable ? 'Available' : 'Out of Stock'}`);
    
    return isAvailable;
  }

  /**
   * Reserve stock for a product
   */
  static reserveStock(productId: string, quantity: number): boolean {
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

  /**
   * Release reserved stock
   */
  static releaseStock(productId: string, quantity: number): boolean {
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

  /**
   * Get product information
   */
  static getProduct(productId: string): Product | undefined {
    return this.inventory.get(productId);
  }

  /**
   * Get all products
   */
  static getAllProducts(): Product[] {
    return Array.from(this.inventory.values());
  }

  /**
   * Update stock levels (for restocking)
   */
  static updateStock(productId: string, newStock: number): boolean {
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