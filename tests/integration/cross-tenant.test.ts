/**
 * Cross-tenant isolation tests.
 *
 * These tests assert that tenant isolation is enforced in the backend:
 * - User A cannot read or mutate Business B's data.
 * - All repository queries require a valid TenantContext.
 * - API endpoints reject unscoped or mismatched tenant access.
 *
 * Setup (via seed):
 * - Business A with User A (owner).
 * - Business B with User B (owner).
 * - Each business has at least one product.
 *
 * Tests:
 * 1. User A cannot list Business B's products.
 * 2. User A cannot fetch Business B's product by ID.
 * 3. User A cannot create a product scoped to Business B.
 * 4. Repository helpers throw if called without tenant context.
 *
 * Adapt the API calls to your actual routes and auth setup.
 */

describe("cross-tenant isolation", () => {
  // Pseudo-code structure; implement with your test runner and API client.

  // let businessA, businessB;
  // let userA, userB;
  // let clientA, clientB;

  // beforeAll(async () => {
  //   // Seed two businesses and users via your seed helper or API.
  //   // clientA = createApiClient({ token: userA.token });
  //   // clientB = createApiClient({ token: userB.token });
  // });

  test("user A cannot list business B's products", async () => {
    // const res = await clientA.get("/products", { headers: { "x-business-id": businessB.id } });
    // expect(res.status).toBe(403); // or 401 depending on your design
  });

  test("user A cannot fetch business B's product by ID", async () => {
    // const productB = await createProductForBusiness(businessB);
    // const res = await clientA.get(`/products/${productB.id}`);
    // expect(res.status).toBe(404); // or 403 if you prefer
  });

  test("user A cannot create product scoped to business B", async () => {
    // const res = await clientA.post("/products", {
    //   businessId: businessB.id,
    //   name: "Attacker product",
    //   price: 10000,
    // });
    // expect(res.status).toBe(403);
    // // Assert no product was created in business B.
  });

  test("repository throws without tenant context", () => {
    // expect(() => createScopedRepository(null)).toThrow(/tenant context/i);
  });
});
