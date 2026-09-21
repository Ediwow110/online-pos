import { z } from "zod";

export const emailSchema = z.string().email().max(255);
export const passwordSchema = z.string().min(10).max(128);

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  businessName: z.string().min(2).max(120),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const productSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(64),
  barcode: z.string().max(64).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brand: z.string().max(80).optional().nullable(),
  unit: z.string().max(16).default("pc"),
  cost: z.number().int().min(0),
  price: z.number().int().min(0),
  taxRateBps: z.number().int().min(0).max(10000).optional().nullable(),
  reorderLevel: z.number().int().min(0).default(0),
  trackInventory: z.boolean().default(true),
  allowNegative: z.boolean().default(false),
  favorite: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const inventoryMoveSchema = z.object({
  productId: z.string(),
  type: z.enum(["OPENING", "RECEIVE", "DAMAGE", "ADJUSTMENT", "COUNT"]),
  quantity: z.number().int(),
  reason: z.string().min(1).max(240),
});

export const saleLineSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().min(0).optional(),
  lineDiscount: z.number().int().min(0).optional(),
});

export const paymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "GCASH", "MAYA", "BANK_TRANSFER", "OTHER"]),
  amount: z.number().int().positive(),
});

export const createSaleSchema = z.object({
  registerId: z.string(),
  customerId: z.string().optional().nullable(),
  note: z.string().max(240).optional(),
  orderDiscount: z.number().int().min(0).optional(),
  hold: z.boolean().optional(),
  lines: z.array(saleLineSchema).min(1),
  payments: z.array(paymentSchema).optional(),
});

export const refundSchema = z.object({
  saleId: z.string(),
  reason: z.string().min(2).max(240),
  items: z.array(z.object({ saleItemId: z.string(), quantity: z.number().int().positive() })).min(1),
});

export const openShiftSchema = z.object({
  registerId: z.string(),
  openingFloat: z.number().int().min(0),
});

export const closeShiftSchema = z.object({
  countedCash: z.number().int().min(0),
  note: z.string().max(240).optional(),
});

export const expenseSchema = z.object({
  category: z.string().min(1).max(80),
  amount: z.number().int().positive(),
  description: z.string().min(1).max(240),
  paymentMethod: z.enum(["CASH", "CARD", "GCASH", "MAYA", "BANK_TRANSFER", "OTHER"]).default("CASH"),
});

export const customerSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().optional().nullable(),
  note: z.string().max(240).optional().nullable(),
});
