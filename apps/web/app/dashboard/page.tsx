"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const money = (amount: number) => `₱${(amount / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

type Overview = {
  date: string;
  sales: { total: number; orders: number; averageOrder: number };
  inventory: { products: number; lowStock: number; outOfStock: number };
  operations: { openShifts: number };
  attention: Array<{ id: string; name: string; reorderLevel: number; stock: number }>;
};

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${API_URL}/api/v1/dashboard/overview`, { credentials: "include" })
      .then(async (response) => {
        if (response.status === 401) return window.location.assign("/login");
        if (!response.ok) throw new Error((await response.json()).error ?? "Unable to load dashboard.");
        setOverview(await response.json());
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard."));
  }, []);
  async function signOut() {
    await fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    window.location.assign("/");
  }
  if (error) return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Dashboard</p><h1>Unable to load.</h1><p className="auth-copy">{error}</p></div></main>;
  if (!overview) return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Dashboard</p><h1>Loading your store…</h1></div></main>;
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a className="active" href="/dashboard">Overview</a><a href="/products">Catalog</a><a href="/pos">Test / sell</a><a href="/inventory">Stock</a><a href="/sales">Sales</a><a href="/customers">Customers</a><a href="/branches">Branches</a><a href="/billing">Billing</a><button className="nav-button" onClick={() => void signOut()}>Sign out</button></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Owner overview</p><h1>Good morning.</h1><p>Manage products in Catalog, then test the customer-facing register in Test / sell.</p></div><a className="button button-dark" href="/products">Manage catalog <span>→</span></a></div><div className="kpi-grid"><article><span>Sales today</span><strong>{money(overview.sales.total)}</strong><small>{overview.sales.orders} completed orders</small></article><article><span>Average order</span><strong>{money(overview.sales.averageOrder)}</strong><small>Across today&apos;s sales</small></article><article><span>Catalog health</span><strong>{overview.inventory.products}</strong><small>{overview.inventory.lowStock} low stock · {overview.inventory.outOfStock} out</small></article><article><span>Open shifts</span><strong>{overview.operations.openShifts}</strong><small>Active register sessions</small></article></div><div className="dashboard-columns"><article className="dashboard-card"><div className="card-heading"><span>Needs attention</span><a href="/pos">Open POS →</a></div>{overview.attention.length === 0 ? <p className="dashboard-empty">Everything is stocked above reorder levels.</p> : <div className="attention-list">{overview.attention.map((item) => <div key={item.id}><span className="attention-icon">!</span><span><b>{item.name}</b><small>{item.stock} in stock · reorder at {item.reorderLevel}</small></span><i>Low stock</i></div>)}</div>}</article><article className="dashboard-card daily-loop"><div className="card-heading"><span>Daily loop</span><span className="status-pill">Live</span></div><div className="loop-check"><span>✓</span><b>Sell and update stock</b></div><div className="loop-check"><span>2</span><b>Review cash before closing</b></div><div className="loop-check"><span>3</span><b>Understand today&apos;s performance</b></div></article></div></section></main>;
}
