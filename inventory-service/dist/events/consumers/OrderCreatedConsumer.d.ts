export interface OrderCreatedMessage {
    orderId: string;
    customerId: string;
    items: OrderItem[];
    totalAmount: number;
    createdAt: string;
}
export interface OrderItem {
    productId: string;
    quantity: number;
    price: number;
}
export interface InventoryStatusMessage {
    orderId: string;
    status: 'available' | 'out_of_stock';
    items: InventoryItemStatus[];
    checkedAt: string;
}
export interface InventoryItemStatus {
    productId: string;
    requestedQuantity: number;
    availableQuantity: number;
    status: 'available' | 'out_of_stock';
}
export declare class OrderCreatedConsumer {
    private static readonly QUEUE_NAME;
    static startConsuming(): Promise<void>;
    private static processOrderCreatedMessage;
    private static validateMessage;
    private static checkInventoryStatus;
    static stopConsuming(): Promise<void>;
}
//# sourceMappingURL=OrderCreatedConsumer.d.ts.map