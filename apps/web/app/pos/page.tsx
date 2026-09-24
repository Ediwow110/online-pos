"use client";

import { useEffect, useMemo, useState } from "react";
import { createCommand, listCommands, removeCommand, saveCommand, updateCommand, type OutboxCommand } from "../../lib/outbox";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  trackInventory: boolean;
};

type Context = {
  user: { id: string; name: string; email: string };
  business: { id: string; name: string; role: string };
  branch: { id: string; name: string } | null;
  register: { id: string; name: string } | null;
  shift: { id: string; status: string } | null;
};
type Customer = { id: string; name: string; phone: string | null };
type HeldSale = { id: string; receiptNumber: string; customer: string | null; itemCount: number; total: number };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const formatPhp = (centavos: number) => `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function PosPage() {
  const [context, setContext] = useState<Context | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [online, setOnline] = useState(true);
  const [pendingCommands, setPendingCommands] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const contextResponse = await fetch(`${API_URL}/api/v1/operations/context`, { credentials: "include" });
        if (contextResponse.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (!contextResponse.ok) throw new Error("Unable to load business context.");
        const nextContext = (await contextResponse.json()) as Context;
        setContext(nextContext);
        if (!nextContext.branch) throw new Error("No branch is configured for this business.");
        const catalogResponse = await fetch(`${API_URL}/api/v1/catalog/products?businessId=${nextContext.business.id}&branchId=${nextContext.branch.id}`, { credentials: "include" });
        if (!catalogResponse.ok) throw new Error("Unable to load catalog.");
        setProducts((await catalogResponse.json()) as Product[]);
        const customersResponse = await fetch(`${API_URL}/api/v1/customers`, { credentials: "include" });
        if (customersResponse.ok) setCustomers((await customersResponse.json()) as Customer[]);
        const heldResponse = await fetch(`${API_URL}/api/v1/sales/held`, { credentials: "include" });
        if (heldResponse.ok) setHeldSales((await heldResponse.json()) as HeldSale[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load POS.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function refreshOutbox() {
    try {
      const commands = await listCommands();
      setPendingCommands(commands.filter((command) => command.status === "PENDING").length);
    } catch {
      setPendingCommands(0);
    }
  }

  async function flushOutbox() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let commands: OutboxCommand[] = [];
    try {
      commands = (await listCommands()).filter((command) => command.status === "PENDING");
    } catch {
      return;
    }
    for (const command of commands.sort((a, b) => a.createdAt - b.createdAt)) {
      try {
        const response = await fetch(`${API_URL}${command.endpoint}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-command-id": command.key }, body: JSON.stringify(command.payload) });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          await removeCommand(command.id);
        } else if (response.status >= 400 && response.status < 500) {
          await updateCommand({ ...command, status: "FAILED", attempts: command.attempts + 1, error: result.error ?? "Command rejected." });
        } else {
          await updateCommand({ ...command, attempts: command.attempts + 1 });
        }
      } catch {
        await updateCommand({ ...command, attempts: command.attempts + 1 });
        break;
      }
    }
    await refreshOutbox();
  }

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void flushOutbox();
    };
    setOnline(navigator.onLine);
    void refreshOutbox();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const categories = ["All", ...new Set(products.map((product) => product.category))];
  const visibleProducts = useMemo(
    () => products.filter((product) => (category === "All" || product.category === category) && `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase())),
    [category, products, query],
  );
  const lines = products.filter((product) => cart[product.id]).map((product) => ({ ...product, quantity: cart[product.id] }));
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const tax = Math.round(subtotal * 0.12);
  const total = subtotal + tax;

  function add(product: Product) {
    setCart((current) => ({ ...current, [product.id]: Math.min((current[product.id] ?? 0) + 1, product.trackInventory ? product.stock : 999) }));
  }

  async function pay() {
    if (!context?.branch || !context.register || !context.shift || lines.length === 0) {
      setPaymentError("An open register shift is required before completing a sale.");
      return;
    }
    setPaying(true);
    setPaymentError("");
    const command = createCommand({
      tenantId: context.business.id,
      branchId: context.branch.id,
      registerId: context.register.id,
      shiftId: context.shift.id,
      customerId: customerId || undefined,
      items: lines.map((line) => ({ productId: line.id, qty: line.quantity, unitPriceCentavos: line.price })),
      payments: [{ method: paymentMethod, amountCentavos: total }],
    });
    let responseStatus = 0;
    try {
      await saveCommand(command);
      await refreshOutbox();
      const response = await fetch(`${API_URL}${command.endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-command-id": command.key },
        body: JSON.stringify(command.payload),
      });
      responseStatus = response.status;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete sale.");
      await removeCommand(command.id);
      await refreshOutbox();
      setCart({});
      setPaymentError("");
      window.location.assign(`/receipt?id=${encodeURIComponent(result.saleId)}`);
    } catch (payError) {
      if (payError instanceof TypeError || !online || responseStatus >= 500) {
        setPaymentError("Sale saved for sync when the connection returns.");
      } else {
        await updateCommand({ ...command, status: "FAILED", attempts: command.attempts + 1, error: payError instanceof Error ? payError.message : "Unable to complete sale." });
        setPaymentError(payError instanceof Error ? payError.message : "Unable to complete sale.");
      }
      await refreshOutbox();
    } finally {
      setPaying(false);
    }
  }

  async function signOut() {
    await fetch(`${API_URL}/api/v1/auth/logout`, { method: "POST", credentials: "include" });
    window.location.assign("/");
  }
  async function holdSale() {
    if (!context?.branch || !context.register || !context.shift || !lines.length) return;
    const response = await fetch(`${API_URL}/api/v1/sales/hold`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchId: context.branch.id, registerId: context.register.id, shiftId: context.shift.id, customerId: customerId || undefined, items: lines.map((line) => ({ productId: line.id, quantity: line.quantity, unitPrice: line.price })) }) });
    const result = await response.json();
    if (!response.ok) return setPaymentError(result.error ?? "Unable to hold sale.");
    setCart({});
    setPaymentError("Sale held for later.");
    setHeldSales((current) => [{ id: result.id, receiptNumber: `HOLD-${result.id.slice(-6)}`, customer: null, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0), total: result.total }, ...current]);
  }
  async function resumeSale(saleId: string) {
    const response = await fetch(`${API_URL}/api/v1/sales/held/resume`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ saleId }) });
    const result = await response.json();
    if (!response.ok) return setPaymentError(result.error ?? "Unable to resume sale.");
    setCart(Object.fromEntries(result.items.map((item: { productId: string; quantity: number }) => [item.productId, item.quantity])));
    setCustomerId(result.customerId ?? "");
    setHeldSales((current) => current.filter((held) => held.id !== saleId));
    setPaymentError("Held sale resumed.");
  }

  if (loading) return <main className="pos-shell"><div className="pos-state">Loading your store…</div></main>;
  if (error) return <main className="pos-shell"><div className="pos-state"><b>POS unavailable</b><p>{error}</p><a href="/login">Return to sign in</a></div></main>;

  return <main className="pos-shell">
    <div className={`sync-banner ${online ? "online" : "offline"}`} role="status"><span>{online ? "● Online" : "○ Offline"}</span>{pendingCommands > 0 && <span>{pendingCommands} sale{pendingCommands === 1 ? "" : "s"} waiting to sync <button onClick={() => void flushOutbox()} disabled={!online}>Retry</button></span>}</div>
    <header className="pos-topbar"><a className="brand" href="/"><span className="brand-mark">L</span><span>ledgerly</span></a><div className="pos-context"><b>{context?.business.name}</b><span>{context?.register?.name ?? "No register"} · {context?.shift ? "Open shift" : "No open shift"}</span></div><div className="pos-user"><span className="avatar">{context?.user.name.slice(0, 1)}</span><span><b>{context?.user.name}</b><small>{context?.business.role}</small></span><button className="nav-button" onClick={() => void signOut()} aria-label="Sign out">↗</button></div></header>
    <div className="pos-layout">
      <section className="catalog-panel"><div className="pos-heading"><div><p className="eyebrow">Point of sale</p><h1>What are you selling?</h1></div><span className="kbd">⌘ K</span></div><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or scan barcode" /></div><div className="category-tabs">{categories.map((item) => <button className={category === item ? "active" : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div><div className="product-grid">{visibleProducts.map((product) => <button className="product-card" onClick={() => add(product)} disabled={product.trackInventory && product.stock === 0} key={product.id}><span className="product-icon">{product.name.slice(0, 1)}</span><strong>{product.name}</strong><small>{product.category} · {product.trackInventory ? `${product.stock} in stock` : "Service item"}</small><b>{formatPhp(product.price)}</b></button>)}</div></section>
      <aside className="cart-panel"><div className="cart-heading"><div><p className="eyebrow">Current sale</p><h2>Cart <span>{lines.length}</span></h2></div><button className="clear-button" onClick={() => setCart({})}>Clear</button></div>{lines.length === 0 ? <div className="empty-cart"><span>＋</span><b>Your cart is empty</b><p>Add a product to get started.</p></div> : <div className="cart-lines">{lines.map((line) => <div className="cart-line" key={line.id}><div><b>{line.name}</b><small>{formatPhp(line.price)} each</small></div><div className="quantity"><button onClick={() => setCart((current) => line.quantity <= 1 ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== line.id)) : ({ ...current, [line.id]: line.quantity - 1 }))}>−</button><span>{line.quantity}</span><button onClick={() => add(line)}>+</button></div><strong>{formatPhp(line.price * line.quantity)}</strong></div>)}</div>}<div className="cart-summary"><label className="checkout-field">Customer<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="checkout-field">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="MAYA">Maya</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option></select></label><div><span>Subtotal</span><b>{formatPhp(subtotal)}</b></div><div><span>VAT (12%)</span><b>{formatPhp(tax)}</b></div><div className="cart-total"><span>Total</span><strong>{formatPhp(total)}</strong></div>{paymentError && <p className="form-error" role="status">{paymentError}</p>}<button className="pay-button" disabled={!lines.length || paying} onClick={() => void pay()}>{paying ? "Completing…" : `Pay ${formatPhp(total)}`} <span>→</span></button><button className="hold-button" disabled={!lines.length} onClick={() => void holdSale()}>Hold sale</button>{heldSales.length > 0 && <div className="held-list"><b>Held sales</b>{heldSales.map((held) => <div key={held.id}><span>{held.itemCount} item(s) · {formatPhp(held.total)}</span><button onClick={() => void resumeSale(held.id)}>Resume</button></div>)}</div>}</div></aside>
    </div>
  </main>;
}
