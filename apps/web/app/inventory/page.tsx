"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Product = { id: string; name: string; sku: string; price: number; stock: number; category: string; trackInventory: boolean };
type Context = { business: { id: string }; branch: { id: string } | null };

export default function InventoryPage() {
  const [context, setContext] = useState<Context | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [type, setType] = useState("RECEIVE");
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch(`${API_URL}/api/v1/operations/context`, { credentials: "include" }).then(async (response) => {
      if (response.status === 401) return window.location.assign("/login");
      const next = await response.json() as Context;
      setContext(next);
      if (next.branch) {
        const catalog = await fetch(`${API_URL}/api/v1/catalog/products?businessId=${next.business.id}&branchId=${next.branch.id}`, { credentials: "include" });
        setProducts(await catalog.json());
      }
    }).catch(() => setMessage("Unable to load inventory."));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!context?.branch || !selected || !reason) return setMessage("Select a product and enter a reason.");
    const response = await fetch(`${API_URL}/api/v1/inventory/movements`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: selected, branchId: context.branch.id, type, quantity: Number(quantity), reason }) });
    const result = await response.json();
    setMessage(response.ok ? "Inventory updated." : result.error ?? "Unable to update inventory.");
    if (response.ok) window.location.reload();
  }
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a href="/pos">Point of sale</a><a className="active" href="/inventory">Inventory</a><a href="/sales">Sales</a></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Stock control</p><h1>Keep every shelf honest.</h1><p>Receive stock, record damage, and keep balances traceable.</p></div></div><div className="dashboard-columns"><article className="dashboard-card"><div className="card-heading"><span>Inventory movement</span></div><form className="inventory-form" onSubmit={submit}><label>Product<select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stock} in stock</option>)}</select></label><label>Movement<select value={type} onChange={(event) => setType(event.target.value)}><option value="RECEIVE">Receive stock</option><option value="DAMAGE">Record damage</option><option value="ADJUSTMENT">Adjust stock down</option></select></label><label>Quantity<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Supplier delivery" /></label><button className="button button-dark" type="submit">Save movement <span>→</span></button>{message && <p className="form-error" role="status">{message}</p>}</form></article><article className="dashboard-card"><div className="card-heading"><span>Current stock</span><span className="status-pill">{products.length} products</span></div><div className="attention-list">{products.map((product) => <div key={product.id}><span className="attention-icon">{product.name.slice(0, 1)}</span><span><b>{product.name}</b><small>{product.sku} · {product.category}</small></span><i>{product.trackInventory ? `${product.stock} on hand` : "Not tracked"}</i></div>)}</div></article></div></section></main>;
}
