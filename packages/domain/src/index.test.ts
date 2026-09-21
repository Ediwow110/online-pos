import { describe, expect, it } from "vitest";
import {
  applyStock,
  assertTransition,
  can,
  cashVariance,
  changeDue,
  computeSaleTotals,
  expectedCash,
  pesosToCentavos,
  signedInventoryQty,
} from "./index";

describe("money", () => {
  it("converts pesos without binary float drift", () => {
    expect(pesosToCentavos(52)).toBe(5200);
    expect(pesosToCentavos(1.15)).toBe(115);
  });
});

describe("sale totals", () => {
  it("computes tax-inclusive 12% VAT", () => {
    const t = computeSaleTotals({
      lines: [{ quantity: 2, unitPrice: 2500 }],
      taxRateBps: 1200,
      taxInclusive: true,
    });
    expect(t.subtotal).toBe(5000);
    expect(t.total).toBe(5000);
    expect(t.tax).toBe(536);
  });

  it("rejects oversized discounts", () => {
    expect(() =>
      computeSaleTotals({
        lines: [{ quantity: 1, unitPrice: 1000, lineDiscount: 1001 }],
        taxRateBps: 0,
        taxInclusive: true,
      }),
    ).toThrow("DISCOUNT_EXCEEDS_LINE");
  });
});

describe("payments", () => {
  it("computes change", () => {
    expect(changeDue(5200, 10000)).toBe(4800);
    expect(() => changeDue(5200, 5000)).toThrow("INSUFFICIENT_PAYMENT");
  });
});

describe("inventory", () => {
  it("blocks oversell", () => {
    expect(() =>
      applyStock({ current: 1, delta: signedInventoryQty("SALE", 2), trackInventory: true, allowNegative: false }),
    ).toThrow("INSUFFICIENT_STOCK");
  });
});

describe("cash", () => {
  it("matches expected cash formula", () => {
    const expected = expectedCash({
      openingFloat: 200000,
      cashSales: 15000,
      cashRefunds: 2500,
      cashExpenses: 1000,
      cashDeposits: 0,
      cashWithdrawals: 5000,
      approvedAdjustments: 0,
    });
    expect(expected).toBe(206500);
    expect(cashVariance(206000, expected)).toBe(-500);
  });
});

describe("state and rbac", () => {
  it("forbids editing a completed sale except via refund", () => {
    expect(() => assertTransition("COMPLETED", "VOIDED")).toThrow(/INVALID_TRANSITION/);
    assertTransition("COMPLETED", "REFUND_REQUESTED");
  });

  it("hides cost from cashiers", () => {
    expect(can("CASHIER", "cost.view")).toBe(false);
    expect(can("OWNER", "sales.refund")).toBe(true);
  });
});
