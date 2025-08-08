export interface Product {
    id: string;
    name: string;
    stock: number;
    reserved: number;
    available: number;
}
export declare const products: Product[];
export declare class InventoryManager {
    private static inventory;
    static checkAvailability(productId: string, quantity: number): boolean;
    static reserveStock(productId: string, quantity: number): boolean;
    static releaseStock(productId: string, quantity: number): boolean;
    static getProduct(productId: string): Product | undefined;
    static getAllProducts(): Product[];
    static updateStock(productId: string, newStock: number): boolean;
}
//# sourceMappingURL=products.d.ts.map