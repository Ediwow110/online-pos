"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Branch = { id: string; name: string; registers: Array<{ id: string; name: string }> };

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch(`${API_URL}/api/v1/branches`, { credentials: "include" }).then(async (r) => { if (r.status === 401) return window.location.assign("/login"); if (r.ok) setBranches(await r.json()); }); }, []);
  async function addBranch(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API_URL}/api/v1/branches`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "Unable to add branch.");
    setBranches((current) => [...current, { ...result, registers: [] }]); setName(""); setMessage("Branch created.");
  }
  return <main className="dashboard-page"><header className="dashboard-nav shell"><a className="brand" href="/dashboard"><span className="brand-mark">L</span><span>ledgerly</span></a><nav><a href="/dashboard">Overview</a><a className="active" href="/branches">Branches</a><a href="/transfers">Transfers</a><a href="/billing">Billing</a></nav></header><section className="dashboard-content shell"><div className="dashboard-heading"><div><p className="eyebrow">Operations</p><h1>Branches and registers</h1><p>Manage the locations connected to this business.</p></div></div><form className="inline-form" onSubmit={addBranch}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New branch name" required /><button className="button button-dark">Add branch</button></form>{message && <p className="form-error" role="status">{message}</p>}<div className="dashboard-columns">{branches.map((branch) => <article className="dashboard-card" key={branch.id}><div className="card-heading"><b>{branch.name}</b><span>{branch.registers.length} registers</span></div>{branch.registers.length ? branch.registers.map((register) => <p key={register.id}>{register.name}</p>) : <p className="dashboard-empty">No registers configured yet.</p>}</article>)}</div></section></main>;
}
