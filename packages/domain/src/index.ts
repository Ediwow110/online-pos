export type Money = number;

export const PHP_VAT_BPS = 1200;

export function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.floor(Math.abs(n) + 0.5);
}

export function pesosToCentavos(pesos: number): Money {
  return roundHalfUp(pesos * 100);
}

export function formatPhp(centavos: Money): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toLocaleString("en-PH");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}\u20b1${whole}.${frac}`;
}

export type SaleLineInput = {
  quantity: number;
  unitPrice: Money;
  lineDiscount?: Money;
};

export type SaleTotals = {
  subtotal: Money;
  lineDiscount: Money;
  orderDiscount: Money;
  tax: Money;
  total: Money;
  lineTotals: Money[];
};

export function computeSaleTotals(input: {
  lines: SaleLineInput[];
  orderDiscount?: Money;
  taxRateBps: number;
  taxInclusive: boolean;
}): SaleTotals {
  const lineTotals: Money[] = [];
  let subtotal = 0;
  let lineDiscount = 0;

  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("INVALID_QUANTITY");
    }
    if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) {
      throw new Error("INVALID_PRICE");
    }
    const discount = line.lineDiscount ?? 0;
    if (!Number.isInteger(discount) || discount < 0) {
      throw new Error("INVALID_DISCOUNT");
    }
    const extended = line.quantity * line.unitPrice;
    if (discount > extended) {
      throw new Error("DISCOUNT_EXCEEDS_LINE");
    }
    lineDiscount += discount;
    const net = extended - discount;
    lineTotals.push(net);
    subtotal += extended;
  }

  const orderDiscount = input.orderDiscount ?? 0;
  const afterLines = subtotal - lineDiscount;
  if (!Number.isInteger(orderDiscount) || orderDiscount < 0 || orderDiscount > afterLines) {
    throw new Error("INVALID_ORDER_DISCOUNT");
  }

  const afterDiscount = afterLines - orderDiscount;
  let tax = 0;
  let total = afterDiscount;
  if (input.taxRateBps > 0) {
    if (input.taxInclusive) {
      tax = roundHalfUp((afterDiscount * input.taxRateBps) / (10000 + input.taxRateBps));
      total = afterDiscount;
    } else {
      tax = roundHalfUp((afterDiscount * input.taxRateBps) / 10000);
      total = afterDiscount + tax;
    }
  }

  return { subtotal, lineDiscount, orderDiscount, tax, total, lineTotals };
}

export function changeDue(total: Money, paid: Money): Money {
  if (paid < total) throw new Error("INSUFFICIENT_PAYMENT");
  return paid - total;
}

export const SALE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_PAYMENT", "VOIDED", "COMPLETED"],
  PENDING_PAYMENT: ["PAID", "PAYMENT_FAILED", "PAYMENT_UNKNOWN", "VOIDED"],
  PAID: ["COMPLETED"],
  PAYMENT_UNKNOWN: ["RECONCILED", "PAYMENT_FAILED", "COMPLETED"],
  COMPLETED: ["REFUND_REQUESTED"],
  REFUND_REQUESTED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  VOIDED: [],
  PAYMENT_FAILED: ["PENDING_PAYMENT"],
  REFUNDED: [],
};

export function assertTransition(from: string, to: string) {
  const allowed = SALE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`INVALID_TRANSITION:${from}->${to}`);
  }
}

export function signedInventoryQty(type: string, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("INVALID_QUANTITY");
  const negative = new Set(["SALE", "DAMAGE", "TRANSFER"]);
  if (type === "ADJUSTMENT" || type === "COUNT") return quantity;
  return negative.has(type) ? -quantity : quantity;
}

export function applyStock(input: {
  current: number;
  delta: number;
  trackInventory: boolean;
  allowNegative: boolean;
}): number {
  if (!input.trackInventory) return input.current;
  const next = input.current + input.delta;
  if (next < 0 && !input.allowNegative) throw new Error("INSUFFICIENT_STOCK");
  return next;
}

export type CashComponents = {
  openingFloat: Money;
  cashSales: Money;
  cashRefunds: Money;
  cashExpenses: Money;
  cashDeposits: Money;
  cashWithdrawals: Money;
  approvedAdjustments: Money;
};

export function expectedCash(c: CashComponents): Money {
  return (
    c.openingFloat +
    c.cashSales -
    c.cashRefunds -
    c.cashExpenses +
    c.cashDeposits -
    c.cashWithdrawals +
    c.approvedAdjustments
  );
}

export function cashVariance(counted: Money, expected: Money): Money {
  return counted - expected;
}

export const PERMISSIONS = {
  "catalog.read": ["OWNER", "MANAGER", "CASHIER", "INVENTORY"],
  "catalog.write": ["OWNER", "MANAGER", "INVENTORY"],
  "inventory.read": ["OWNER", "MANAGER", "CASHIER", "INVENTORY"],
  "inventory.adjust": ["OWNER", "MANAGER", "INVENTORY"],
  "sales.create": ["OWNER", "MANAGER", "CASHIER"],
  "sales.void": ["OWNER", "MANAGER"],
  "sales.refund": ["OWNER", "MANAGER"],
  "sales.discount": ["OWNER", "MANAGER", "CASHIER"],
  "cost.view": ["OWNER", "MANAGER"],
  "cash.open": ["OWNER", "MANAGER", "CASHIER"],
  "cash.close": ["OWNER", "MANAGER", "CASHIER"],
  "cash.override": ["OWNER", "MANAGER"],
  "customers.manage": ["OWNER", "MANAGER", "CASHIER"],
  "expenses.manage": ["OWNER", "MANAGER"],
  "reports.view": ["OWNER", "MANAGER"],
  "users.manage": ["OWNER"],
  "settings.manage": ["OWNER"],
  "exports.create": ["OWNER", "MANAGER"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function hashFingerprint(payload: unknown): string {
  const json = JSON.stringify(payload);
  let h = 0;
  for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
  return String(h);
}
