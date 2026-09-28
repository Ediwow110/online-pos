import { expect, test } from "@playwright/test";

test("landing page exposes the primary store workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Ledgerly/);
  await expect(page.getByRole("link", { name: /start for free/i })).toBeVisible();
});

test("unauthenticated users are redirected from protected routes", async ({ page }) => {
  await page.goto("/pos");
  // Middleware builds the redirect via URLSearchParams; browsers may render
  // the slash either raw ("/pos") or encoded ("%2Fpos"). Accept both.
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)pos/);
  await expect(page.getByRole("heading", { name: /sign in to your store/i })).toBeVisible();
});

test("owner can sign in and reach the management dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TEST_EMAIL ?? "owner@valdez.store");
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /good morning/i })).toBeVisible();
});

test("owner can inspect branches, transfers, and billing pages", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TEST_EMAIL ?? "owner@valdez.store");
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const path of ["/products", "/branches", "/transfers", "/billing"]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("main")).toBeVisible();
  }
});
