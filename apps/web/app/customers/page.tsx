"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Customer = { id: string; name: string; phone: string | null; email: string | null; purchases: number };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch(`${API_URL}/api/v1/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`, { credentials: "include" })
        .then(async (response) => {
          if (response.status === 401) return window.location.assign("/login");
          if (!response.ok) throw new Error("Unable to load customers.");
          setCustomers(await response.json());
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load customers."));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a href="/pos">Point of sale</a><a href="/sales">Sales</a><a className="active" href="/customers">Customers</a></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Customer book</p><h1>Know who keeps coming back.</h1><p>Search your customer list and keep relationships close.</p></div><a className="button button-dark" href="/pos">New sale <span>→</span></a></div><article className="dashboard-card"><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or phone" /></div>{error ? <p className="form-error">{error}</p> : customers.length === 0 ? <p className="dashboard-empty">No customers found.</p> : <div className="customer-grid">{customers.map((customer) => <div className="customer-card" key={customer.id}><span className="avatar">{customer.name.slice(0, 1)}</span><div><b>{customer.name}</b><small>{customer.phone ?? customer.email ?? "No contact details"}</small></div><strong>{customer.purchases} sale{customer.purchases === 1 ? "" : "s"}</strong></div>)}</div>}</article></section></main>;
}
