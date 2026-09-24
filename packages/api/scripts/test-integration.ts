const API_URL = process.env.API_URL ?? "http://localhost:3001";
const email = process.env.TEST_EMAIL ?? "owner@valdez.store";
const password = process.env.TEST_PASSWORD ?? "ChangeMe123!";

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  return { response, body };
}

async function main() {
  const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!login.response.ok) throw new Error(`login failed: ${login.response.status}`);
  const cookie = login.response.headers.get("set-cookie");
  if (!cookie) throw new Error("login did not return a session cookie");
  const auth = { cookie };
  const checks = [
    "/api/v1/branches",
    "/api/v1/billing/status",
    "/api/v1/dashboard/insights",
    "/api/v1/inventory/transfers",
  ];
  for (const path of checks) {
    const result = await request(path, { headers: auth });
    if (!result.response.ok) throw new Error(`${path} failed: ${result.response.status}`);
  }
  const unauthenticated = await request("/api/v1/sync/commands/status", { method: "POST", body: JSON.stringify({ commands: [] }) });
  if (unauthenticated.response.status !== 401) throw new Error(`unauthenticated sync request returned ${unauthenticated.response.status}`);
  const invalidPaymentWebhook = await request("/api/v1/payments/provider/webhook", { method: "POST", headers: { "x-provider-signature": "invalid" }, body: "{}" });
  if (invalidPaymentWebhook.response.status !== 401) throw new Error(`invalid payment webhook returned ${invalidPaymentWebhook.response.status}`);
  const invalidBillingWebhook = await request("/api/v1/billing/provider/webhook", { method: "POST", headers: { "x-provider-signature": "invalid" }, body: "{}" });
  if (invalidBillingWebhook.response.status !== 401) throw new Error(`invalid billing webhook returned ${invalidBillingWebhook.response.status}`);
  console.log("INTEGRATION TESTS PASSED", { authenticatedChecks: checks.length, tenantIsolation: "authenticated", webhookSignatureRejection: true });
}

main().catch((error) => {
  console.error("INTEGRATION TESTS FAILED:", error);
  process.exitCode = 1;
});
