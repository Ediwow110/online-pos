import { expect, test } from "@playwright/test";

test("landing page exposes the primary store workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Ledgerly/);
  await expect(page.getByRole("link", { name: /open your store/i })).toBeVisible();
});

test("unauthenticated users are redirected from protected routes", async ({ page }) => {
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/login\?next=%2Fpos/);
  await expect(page.getByRole("heading", { name: /sign in to your store/i })).toBeVisible();
});

test("owner can sign in and reach the POS", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.TEST_EMAIL ?? "owner@valdez.store");
  await page.getByLabel("Password").fill(process.env.TEST_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByRole("heading", { name: /what are you selling/i })).toBeVisible();
  await expect(page.getByText(/online/i).first()).toBeVisible();
});

test("owner can inspect branches, transfers, and billing pages", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  for (const path of ["/branches", "/transfers", "/billing"]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/login/);
  }
});
