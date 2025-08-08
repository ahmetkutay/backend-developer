import { z } from 'zod';
import { eventLogger, logError } from './logger';

// Base event schema that all events must follow
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (x.y.z)'),
  timestamp: z.string().datetime(),
  data: z.record(z.any()),
  metadata: z.object({
    service: z.string().min(1),
    correlationId: z.string().uuid().optional(),
    causationId: z.string().uuid().optional(),
    userId: z.string().optional(),
    source: z.string().min(1),
  }),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Order Item Schema
export const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// Order Status Enum
export const OrderStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Order Created Event Schemas (with versioning)
export const OrderCreatedEventDataV1Schema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(OrderItemSchema).min(1),
  totalAmount: z.number().positive(),
  status: OrderStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OrderCreatedEventDataV2Schema = OrderCreatedEventDataV1Schema.extend({
  currency: z.string().length(3).default('USD'),
  discountAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    country: z.string().length(2),
  }).optional(),
});

export type OrderCreatedEventDataV1 = z.infer<typeof OrderCreatedEventDataV1Schema>;
export type OrderCreatedEventDataV2 = z.infer<typeof OrderCreatedEventDataV2Schema>;

// Inventory Item Status Schema
export const InventoryItemStatusSchema = z.object({
  productId: z.string().uuid(),
  requestedQuantity: z.number().int().positive(),
  availableQuantity: z.number().int().min(0),
  status: z.enum(['available', 'out_of_stock']),
});

export type InventoryItemStatus = z.infer<typeof InventoryItemStatusSchema>;

// Inventory Status Updated Event Schemas (with versioning)
export const InventoryStatusUpdatedEventDataV1Schema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['available', 'out_of_stock']),
  items: z.array(InventoryItemStatusSchema).min(1),
  checkedAt: z.string().datetime(),
});

export const InventoryStatusUpdatedEventDataV2Schema = InventoryStatusUpdatedEventDataV1Schema.extend({
  reservationId: z.string().uuid().optional(),
  reservationExpiresAt: z.string().datetime().optional(),
  warehouseId: z.string().uuid().optional(),
});

export type InventoryStatusUpdatedEventDataV1 = z.infer<typeof InventoryStatusUpdatedEventDataV1Schema>;
export type InventoryStatusUpdatedEventDataV2 = z.infer<typeof InventoryStatusUpdatedEventDataV2Schema>;

// Notification Sent Event Schemas (with versioning)
export const NotificationSentEventDataV1Schema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  notificationType: z.enum(['email', 'sms', 'push']),
  status: z.enum(['sent', 'failed']),
  message: z.string().min(1),
  sentAt: z.string().datetime(),
});

export const NotificationSentEventDataV2Schema = NotificationSentEventDataV1Schema.extend({
  templateId: z.string().optional(),
  channel: z.string().optional(),
  deliveryId: z.string().uuid().optional(),
  retryCount: z.number().int().min(0).default(0),
});

export type NotificationSentEventDataV1 = z.infer<typeof NotificationSentEventDataV1Schema>;
export type NotificationSentEventDataV2 = z.infer<typeof NotificationSentEventDataV2Schema>;

// Event Schema Registry
export interface EventSchemaRegistry {
  [eventType: string]: {
    [version: string]: z.ZodSchema<any>;
  };
}

export const eventSchemaRegistry: EventSchemaRegistry = {
  'order.created': {
    '1.0.0': OrderCreatedEventDataV1Schema,
    '2.0.0': OrderCreatedEventDataV2Schema,
  },
  'inventory.status.updated': {
    '1.0.0': InventoryStatusUpdatedEventDataV1Schema,
    '2.0.0': InventoryStatusUpdatedEventDataV2Schema,
  },
  'notification.sent': {
    '1.0.0': NotificationSentEventDataV1Schema,
    '2.0.0': NotificationSentEventDataV2Schema,
  },
};

// Version compatibility mapping
export const versionCompatibility: { [eventType: string]: { [version: string]: string[] } } = {
  'order.created': {
    '2.0.0': ['1.0.0'], // v2.0.0 can handle v1.0.0 events
  },
  'inventory.status.updated': {
    '2.0.0': ['1.0.0'],
  },
  'notification.sent': {
    '2.0.0': ['1.0.0'],
  },
};

// Event validation class
export class EventValidator {
  /**
   * Validates an event against its schema
   */
  static validateEvent(event: any): { isValid: boolean; errors?: string[]; validatedEvent?: BaseEvent } {
    try {
      // First validate the base event structure
      const baseValidation = BaseEventSchema.safeParse(event);
      if (!baseValidation.success) {
        return {
          isValid: false,
          errors: baseValidation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
        };
      }

      const baseEvent = baseValidation.data;

      // Then validate the event data against its specific schema
      const dataValidation = this.validateEventData(baseEvent.eventType, baseEvent.version, baseEvent.data);
      if (!dataValidation.isValid) {
        return {
          isValid: false,
          errors: dataValidation.errors,
        };
      }

      return {
        isValid: true,
        validatedEvent: {
          ...baseEvent,
          data: dataValidation.validatedData,
        },
      };
    } catch (error) {
      eventLogger.error('Error validating event:', error);
      return {
        isValid: false,
        errors: ['Validation error occurred'],
      };
    }
  }

  /**
   * Validates event data against its specific schema
   */
  static validateEventData(eventType: string, version: string, data: any): {
    isValid: boolean;
    errors?: string[];
    validatedData?: any;
  } {
    const schema = this.getEventSchema(eventType, version);
    if (!schema) {
      return {
        isValid: false,
        errors: [`No schema found for event type '${eventType}' version '${version}'`],
      };
    }

    const validation = schema.safeParse(data);
    if (!validation.success) {
      return {
        isValid: false,
        errors: validation.error.errors.map(err => `data.${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      isValid: true,
      validatedData: validation.data,
    };
  }

  /**
   * Gets the schema for a specific event type and version
   */
  static getEventSchema(eventType: string, version: string): z.ZodSchema<any> | null {
    const eventSchemas = eventSchemaRegistry[eventType];
    if (!eventSchemas) {
      return null;
    }

    return eventSchemas[version] || null;
  }

  /**
   * Gets all available versions for an event type
   */
  static getAvailableVersions(eventType: string): string[] {
    const eventSchemas = eventSchemaRegistry[eventType];
    if (!eventSchemas) {
      return [];
    }

    return Object.keys(eventSchemas).sort((a, b) => this.compareVersions(a, b));
  }

  /**
   * Gets the latest version for an event type
   */
  static getLatestVersion(eventType: string): string | null {
    const versions = this.getAvailableVersions(eventType);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  /**
   * Checks if a version is compatible with another version
   */
  static isVersionCompatible(eventType: string, targetVersion: string, sourceVersion: string): boolean {
    const compatibility = versionCompatibility[eventType];
    if (!compatibility || !compatibility[targetVersion]) {
      return targetVersion === sourceVersion;
    }

    return compatibility[targetVersion].includes(sourceVersion) || targetVersion === sourceVersion;
  }

  /**
   * Migrates event data from one version to another
   */
  static migrateEventData(eventType: string, fromVersion: string, toVersion: string, data: any): any {
    if (fromVersion === toVersion) {
      return data;
    }

    // Handle specific migration cases
    if (eventType === 'order.created' && fromVersion === '1.0.0' && toVersion === '2.0.0') {
      return {
        ...data,
        currency: 'USD',
        discountAmount: 0,
        taxAmount: 0,
      };
    }

    if (eventType === 'inventory.status.updated' && fromVersion === '1.0.0' && toVersion === '2.0.0') {
      return {
        ...data,
        reservationId: undefined,
        reservationExpiresAt: undefined,
        warehouseId: undefined,
      };
    }

    if (eventType === 'notification.sent' && fromVersion === '1.0.0' && toVersion === '2.0.0') {
      return {
        ...data,
        templateId: undefined,
        channel: undefined,
        deliveryId: undefined,
        retryCount: 0,
      };
    }

    // If no specific migration is defined, return the original data
    eventLogger.warn(`No migration defined from ${fromVersion} to ${toVersion} for ${eventType}`);
    return data;
  }

  /**
   * Compares two semantic versions
   */
  private static compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }

    return 0;
  }

  /**
   * Validates and potentially migrates an event to the latest version
   */
  static validateAndMigrateEvent(event: any, targetVersion?: string): {
    isValid: boolean;
    errors?: string[];
    validatedEvent?: BaseEvent;
    migrated?: boolean;
  } {
    // First validate the event as-is
    const validation = this.validateEvent(event);
    if (!validation.isValid) {
      return validation;
    }

    const validatedEvent = validation.validatedEvent!;
    const currentVersion = validatedEvent.version;
    const eventType = validatedEvent.eventType;
    
    // Determine target version
    const finalTargetVersion = targetVersion || this.getLatestVersion(eventType);
    if (!finalTargetVersion) {
      return validation;
    }

    // Check if migration is needed
    if (currentVersion === finalTargetVersion) {
      return validation;
    }

    // Check if migration is possible
    if (!this.isVersionCompatible(eventType, finalTargetVersion, currentVersion)) {
      return {
        isValid: false,
        errors: [`Event version ${currentVersion} is not compatible with target version ${finalTargetVersion}`],
      };
    }

    // Perform migration
    try {
      const migratedData = this.migrateEventData(eventType, currentVersion, finalTargetVersion, validatedEvent.data);
      
      // Validate the migrated data
      const migratedValidation = this.validateEventData(eventType, finalTargetVersion, migratedData);
      if (!migratedValidation.isValid) {
        return {
          isValid: false,
          errors: [`Migration validation failed: ${migratedValidation.errors?.join(', ')}`],
        };
      }

      return {
        isValid: true,
        validatedEvent: {
          ...validatedEvent,
          version: finalTargetVersion,
          data: migratedValidation.validatedData,
        },
        migrated: true,
      };
    } catch (error) {
      logError(error as Error, { eventType, currentVersion, targetVersion: finalTargetVersion });
      return {
        isValid: false,
        errors: ['Migration failed'],
      };
    }
  }
}

// Utility functions
export const validateEvent = (event: any) => EventValidator.validateEvent(event);
export const validateEventData = (eventType: string, version: string, data: any) => 
  EventValidator.validateEventData(eventType, version, data);
export const validateAndMigrateEvent = (event: any, targetVersion?: string) => 
  EventValidator.validateAndMigrateEvent(event, targetVersion);
export const getLatestVersion = (eventType: string) => EventValidator.getLatestVersion(eventType);
export const isVersionCompatible = (eventType: string, targetVersion: string, sourceVersion: string) => 
  EventValidator.isVersionCompatible(eventType, targetVersion, sourceVersion);