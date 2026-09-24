"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const money = (amount: number) => `₱${(amount / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
type Receipt = { receiptNumber: string; createdAt: string; status: string; business: { name: string; receiptHeader: string | null; receiptFooter: string | null }; register: string; customer: { name: string; phone: string | null } | null; items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>; payments: Array<{ method: string; amount: number }>; subtotal: number; discount: number; tax: number; total: number; paid: number; changeDue: number };

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return setError("Receipt ID is missing.");
    fetch(`${API_URL}/api/v1/sales/detail?id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return window.location.assign("/login");
        if (!response.ok) throw new Error("Receipt not found.");
        setReceipt(await response.json());
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load receipt."));
  }, []);
  if (error) return <main className="auth-page"><div className="auth-card"><h1>Receipt unavailable.</h1><p className="auth-copy">{error}</p><a className="back-link" href="/sales">← Back to sales</a></div></main>;
  if (!receipt) return <main className="auth-page"><div className="auth-card"><h1>Loading receipt…</h1></div></main>;
  return <main className="receipt-page"><article className="receipt-card"><header><p className="eyebrow">Payment receipt</p><h1>{receipt.business.receiptHeader ?? receipt.business.name}</h1><p>{receipt.receiptNumber} · {new Date(receipt.createdAt).toLocaleString("en-PH")}</p></header><div className="receipt-meta"><span>{receipt.register}</span><span>{receipt.customer?.name ?? "Walk-in customer"}</span></div><div className="receipt-items">{receipt.items.map((item) => <div key={item.name}><span>{item.quantity} × {item.name}<small>{money(item.unitPrice)} each</small></span><b>{money(item.lineTotal)}</b></div>)}</div><div className="receipt-totals"><div><span>Subtotal</span><b>{money(receipt.subtotal)}</b></div><div><span>Discount</span><b>{money(receipt.discount)}</b></div><div><span>VAT</span><b>{money(receipt.tax)}</b></div><div className="receipt-total"><span>Total</span><strong>{money(receipt.total)}</strong></div><div><span>Paid via {receipt.payments.map((payment) => payment.method).join(", ")}</span><b>{money(receipt.paid)}</b></div><div><span>Change</span><b>{money(receipt.changeDue)}</b></div></div><p className="receipt-footer">{receipt.business.receiptFooter ?? "Thank you for shopping with us."}</p><div className="receipt-actions"><button className="button button-dark" onClick={() => window.print()}>Print receipt <span>↗</span></button><a className="back-link" href="/pos">Start another sale →</a></div></article></main>;
}
