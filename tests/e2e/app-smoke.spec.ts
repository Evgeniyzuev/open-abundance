import { expect, test } from "@playwright/test";

test("new guest sees the first onboarding promise", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "You made it. Just look around." })).toBeVisible();
  await expect(page.getByRole("button", { name: "View participant feed" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("returning guest sees the app shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("openAbundanceOnboardingSeen", "true"));

  await page.goto("/");

  await expect(page.getByRole("navigation", { name: /Main navigation|Основная навигация/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Nested navigation|Вложенная навигация/i })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("returning guest sees the ordered first Core path", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("openAbundanceOnboardingSeen", "true"));
  await page.goto("/?view=challenges");

  await expect(page.getByRole("heading", { name: "First Core Path" })).toBeVisible();
  await expect(page.getByText("Save Your Progress", { exact: true })).toBeVisible();
  await expect(page.getByText("Choose Your Main Wish", { exact: true })).toBeVisible();
  await expect(page.getByText("Build Your Growth Plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Reach Today Core Target", { exact: true })).toBeVisible();
  await expect(page.getByText("Publish Your First Result", { exact: true })).toBeVisible();
});
