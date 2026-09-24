"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Branch = { id: string; name: string };
type Product = { id: string; name: string; sku: string; price: number; stock: number; category: string; trackInventory: boolean };

export default function ProductsPage() {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const contextResponse = await fetch(`${API_URL}/api/v1/operations/context`, { credentials: "include" });
    if (contextResponse.status === 401) return window.location.assign("/login");
    const context = await contextResponse.json();
    setBranch(context.branch);
    if (context.branch) {
      const response = await fetch(`${API_URL}/api/v1/catalog/products?businessId=${context.business.id}&branchId=${context.branch.id}`, { credentials: "include" });
      setProducts(response.ok ? await response.json() : []);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branch) return setMessage("No branch is configured yet.");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API_URL}/api/v1/catalog/products`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        sku: form.get("sku"),
        price: Number(form.get("price")),
        cost: Number(form.get("cost") || 0),
        reorderLevel: Number(form.get("reorderLevel") || 0),
        branchId: branch.id,
        trackInventory: true,
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Product added to your catalog." : result.error ?? "Unable to add product.");
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  }

  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a className="active" href="/products">Catalog</a><a href="/pos">Test / sell</a><a href="/inventory">Stock</a><a href="/sales">Sales</a><a href="/branches">Branches</a><a href="/billing">Billing</a></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Owner tools</p><h1>Manage your catalog.</h1><p>Add products here, then open Test / sell to see how they appear at the register.</p></div><a className="button button-dark" href="/pos">Test catalog <span>→</span></a></div><div className="dashboard-columns"><article className="dashboard-card"><div className="card-heading"><span>Add product</span><span className="status-pill">{branch?.name ?? "No branch"}</span></div><form className="inventory-form" onSubmit={createProduct}><label>Product name<input name="name" required placeholder="e.g. Rice 5kg" /></label><label>SKU<input name="sku" required placeholder="RICE-5KG" /></label><label>Selling price (centavos)<input name="price" type="number" min="0" required placeholder="25000" /></label><label>Cost (centavos)<input name="cost" type="number" min="0" defaultValue="0" /></label><label>Reorder level<input name="reorderLevel" type="number" min="0" defaultValue="0" /></label><button className="button button-dark" type="submit">Add to catalog <span>→</span></button>{message && <p className="form-error" role="status">{message}</p>}</form></article><article className="dashboard-card"><div className="card-heading"><span>Catalog preview</span><span className="status-pill">{products.length} products</span></div>{products.length === 0 ? <p className="dashboard-empty">Add your first product, then test it at the register.</p> : <div className="attention-list">{products.map((product) => <div key={product.id}><span className="attention-icon">{product.name.slice(0, 1)}</span><span><b>{product.name}</b><small>{product.sku} · {(product.price / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}</small></span><i>{product.stock} on hand</i></div>)}</div>}</article></div></section></main>;
}
