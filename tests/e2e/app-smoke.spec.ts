import { expect, test } from "@playwright/test";

test("new guest sees the first onboarding promise", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Build your first growth plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build plan" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("new guest can build a draft plan and open the first Core path", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await page.getByRole("button", { name: "Build plan" }).click();
  await expect(page.getByRole("heading", { name: "One weekly loop" })).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Main wish").fill("Work laptop");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Core target, $", exact: true }).fill("1200");
  await page.getByRole("textbox", { name: "Daily Core target, $", exact: true }).fill("2");
  await page.getByText("Focused", { exact: true }).click();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Start with the first Core path" })).toBeVisible();
  await expect(page.getByText("Work laptop", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open first path" }).click();

  await expect(page.getByRole("heading", { name: "First Core Path" })).toBeVisible();
  await expect(page.getByText("Save Your Progress", { exact: true })).toBeVisible();

  const draft = await page.evaluate(() => window.localStorage.getItem("openAbundanceOnboardingDraft"));
  expect(draft).toContain("Work laptop");
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
