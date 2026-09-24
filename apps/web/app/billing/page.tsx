"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export default function BillingPage() {
  const [data, setData] = useState<{ subscription: { plan: string; status: string; branchesLimit: number; monthlyOrderLimit: number }; usage: { branches: number; monthlyOrders: number }; entitlements: { canAddBranch: boolean; canCreateOrder: boolean } } | null>(null);
  useEffect(() => { fetch(`${API_URL}/api/v1/billing/status`, { credentials: "include" }).then(async (r) => { if (r.status === 401) return window.location.assign("/login"); if (r.ok) setData(await r.json()); }); }, []);
  if (!data) return <main className="auth-page"><div className="auth-card"><h1>Loading billing…</h1></div></main>;
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/dashboard"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a href="/branches">Branches</a><a href="/transfers">Transfers</a><a className="active" href="/billing">Billing</a></nav></header><section className="dashboard-content shell"><p className="eyebrow">Plan and usage</p><h1>{data.subscription.plan}</h1><p className="auth-copy">Status: {data.subscription.status}. Limits are enforced explicitly before operational mutations.</p><div className="kpi-grid"><article><span>Branches</span><strong>{data.usage.branches}/{data.subscription.branchesLimit}</strong><small>{data.entitlements.canAddBranch ? "Capacity available" : "Limit reached"}</small></article><article><span>Monthly orders</span><strong>{data.usage.monthlyOrders}</strong><small>Limit {data.subscription.monthlyOrderLimit}</small></article></div></section></main>;
}
