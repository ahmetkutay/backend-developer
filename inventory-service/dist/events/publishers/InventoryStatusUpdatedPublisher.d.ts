import { InventoryStatusMessage } from '../consumers/OrderCreatedConsumer';
export declare const INVENTORY_STATUS_UPDATED_QUEUE = "inventory.status.updated";
export interface InventoryStatusUpdatedEventMessage {
    eventType: 'inventory.status.updated';
    eventId: string;
    timestamp: string;
    version: string;
    data: InventoryStatusMessage;
}
export declare class InventoryStatusUpdatedPublisher {
    static publish(inventoryStatus: InventoryStatusMessage): Promise<void>;
    static publishBatch(inventoryStatuses: InventoryStatusMessage[]): Promise<void>;
    static publishSimpleStatus(orderId: string, status: 'available' | 'out_of_stock'): Promise<void>;
}
export declare const publishInventoryStatusUpdated: (inventoryStatus: InventoryStatusMessage) => Promise<void>;
//# sourceMappingURL=InventoryStatusUpdatedPublisher.d.ts.map