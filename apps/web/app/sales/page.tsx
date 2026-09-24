"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const money = (amount: number) => `₱${(amount / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

type Sale = {
  id: string;
  receiptNumber: string;
  status: string;
  total: number;
  paid: number;
  createdAt: string;
  itemCount: number;
  paymentMethods: string[];
  canVoid: boolean;
  customer: { name: string } | null;
  register: string;
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${API_URL}/api/v1/sales`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return window.location.assign("/login");
        if (!response.ok) throw new Error("Unable to load sales.");
        setSales(await response.json());
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load sales."));
  }, []);
  async function voidSale(saleId: string) {
    if (!window.confirm("Void this sale and return its stock?")) return;
    const response = await fetch(`${API_URL}/api/v1/sales/void`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ saleId, reason: "Voided from sales history" }) });
    if (!response.ok) {
      const result = await response.json();
      setError(result.error ?? "Unable to void sale.");
      return;
    }
    setSales((current) => current.map((sale) => sale.id === saleId ? { ...sale, status: "VOIDED", canVoid: false } : sale));
  }
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a href="/pos">Point of sale</a><a className="active" href="/sales">Sales</a><a href="/customers">Customers</a></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Sales history</p><h1>Every sale, accounted for.</h1><p>Review recent transactions from your register.</p></div><a className="button button-dark" href="/pos">Open POS <span>→</span></a></div><article className="dashboard-card"><div className="card-heading"><span>Recent transactions</span><span className="status-pill">{sales.length} shown</span></div>{error ? <p className="form-error">{error}</p> : sales.length === 0 ? <p className="dashboard-empty">No sales have been recorded yet.</p> : <div className="sales-table">{sales.map((sale) => <div className="sales-row" key={sale.id}><a href={`/receipt?id=${encodeURIComponent(sale.id)}`}><b>{sale.receiptNumber}</b><small>{new Date(sale.createdAt).toLocaleString("en-PH")} · {sale.itemCount} item(s)</small></a><span>{sale.customer?.name ?? "Walk-in customer"}</span><span>{sale.paymentMethods.join(", ")}</span><strong>{money(sale.total)}</strong><i>{sale.status}</i>{sale.canVoid && <button className="void-button" onClick={() => void voidSale(sale.id)}>Void</button>}</div>)}</div>}</article></section></main>;
}
