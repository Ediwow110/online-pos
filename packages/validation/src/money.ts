/**
 * Money and rounding utilities for the POS system.
 *
 * Conventions:
 * - Money is stored in integer minor units (PHP centavos). Example: ₱123.45 → 12345.
 * - No binary floating-point arithmetic on authoritative money values.
 * - Single rounding policy: half-up, 0 decimal places in minor units.
 * - All totals, discounts, tax, and change must flow through these helpers.
 */

export type MinorUnits = number;

/**
 * Round using half-up strategy to 0 decimal places in minor units.
 * Input `amount` is expected to be in minor units but may come from division.
 */
export function roundMoney(amount: number): MinorUnits {
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid money amount: must be a finite number");
  }
  // Half-up: add 0.5 then floor
  return Math.floor(amount + 0.5);
}

/**
 * Convert major units (e.g., 123.45) to minor units (12345) safely.
 */
export function toMinorUnits(major: number): MinorUnits {
  if (!Number.isFinite(major)) {
    throw new Error("Invalid major amount: must be a finite number");
  }
  return roundMoney(major * 100);
}

/**
 * Convert minor units (12345) to major (123.45) for display only.
 * Never use this for further arithmetic.
 */
export function toMajorUnits(minor: MinorUnits): number {
  return minor / 100;
}

/**
 * Calculate line total: quantity * unitPrice (minor units).
 * Quantity is integer units; unitPrice is minor units.
 */
export function lineTotal(quantity: number, unitPrice: MinorUnits): MinorUnits {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative integer");
  }
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    throw new Error("Unit price must be a non-negative integer (minor units)");
  }
  return quantity * unitPrice;
}

/**
 * Apply a percentage discount to an amount (minor units).
 * Discount percent is 0–100 with up to 2 decimals (e.g., 12.5 for 12.5%).
 * Returns discount amount in minor units (rounded half-up).
 */
export function percentDiscount(
  amount: MinorUnits,
  discountPercent: number
): MinorUnits {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative integer (minor units)");
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Discount percent must be between 0 and 100");
  }
  const discount = (amount * discountPercent) / 100;
  return roundMoney(discount);
}

/**
 * Apply a fixed discount to an amount (minor units).
 * Ensures result never goes negative.
 */
export function fixedDiscount(
  amount: MinorUnits,
  discount: MinorUnits
): MinorUnits {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative integer (minor units)");
  }
  if (!Number.isInteger(discount) || discount < 0) {
    throw new Error("Discount must be a non-negative integer (minor units)");
  }
  return Math.max(0, amount - discount);
}

/**
 * Calculate subtotal from line totals (minor units).
 */
export function subtotal(lineTotals: MinorUnits[]): MinorUnits {
  const sum = lineTotals.reduce((acc, v) => acc + v, 0);
  if (!Number.isInteger(sum) || sum < 0) {
    throw new Error("Subtotal must be a non-negative integer (minor units)");
  }
  return sum;
}

/**
 * Calculate tax amount given a taxable amount (minor units) and tax rate (0–1).
 * Example: taxRate = 0.12 for 12%.
 */
export function taxAmount(taxable: MinorUnits, taxRate: number): MinorUnits {
  if (!Number.isInteger(taxable) || taxable < 0) {
    throw new Error("Taxable amount must be a non-negative integer (minor units)");
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    throw new Error("Tax rate must be between 0 and 1");
  }
  return roundMoney(taxable * taxRate);
}

/**
 * Calculate total: subtotal - discounts + tax.
 * All inputs in minor units.
 */
export function total(
  sub: MinorUnits,
  discounts: MinorUnits,
  tax: MinorUnits
): MinorUnits {
  if (!Number.isInteger(sub) || sub < 0) {
    throw new Error("Subtotal must be a non-negative integer (minor units)");
  }
  if (!Number.isInteger(discounts) || discounts < 0) {
    throw new Error("Discounts must be a non-negative integer (minor units)");
  }
  if (!Number.isInteger(tax) || tax < 0) {
    throw new Error("Tax must be a non-negative integer (minor units)");
  }
  const result = sub - discounts + tax;
  if (result < 0) {
    throw new Error("Computed total cannot be negative");
  }
  return result;
}

/**
 * Calculate change: paid - total.
 * Returns negative if underpaid.
 */
export function change(paid: MinorUnits, totalAmount: MinorUnits): number {
  if (!Number.isInteger(paid) || paid < 0) {
    throw new Error("Paid amount must be a non-negative integer (minor units)");
  }
  if (!Number.isInteger(totalAmount) || totalAmount < 0) {
    throw new Error("Total amount must be a non-negative integer (minor units)");
  }
  return paid - totalAmount;
}

/**
 * Validate that a set of payments exactly covers the total.
 * Returns true if sum(payments) === totalAmount.
 */
export function paymentsCoverTotal(
  payments: MinorUnits[],
  totalAmount: MinorUnits
): boolean {
  const sum = payments.reduce((acc, p) => acc + p, 0);
  return sum === totalAmount;
}
