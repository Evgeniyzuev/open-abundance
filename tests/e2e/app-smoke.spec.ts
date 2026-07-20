import { expect, test } from "@playwright/test";

test("new guest sees the first onboarding promise", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Create abundance in your life" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("new guest can switch onboarding language and keep the choice", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "RU" }).click();
  await expect(page.getByRole("heading", { name: "Создавай изобилие в своей жизни" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RU" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("openAbundanceLocale"))).toBe("ru");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Создавай изобилие в своей жизни" })).toBeVisible();
});

test("new guest can see the three-screen story and open the growth calculator", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Others are already succeeding" })).toBeVisible();

  await page.getByRole("button", { name: "View stories" }).click();
  await expect(page.getByRole("heading", { name: "20 levels to $1,000,000" })).toBeVisible();

  await page.getByRole("button", { name: "Calculate my path" }).click();

  await expect(page.getByText("Growth calculator", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate time" })).toBeVisible();
  await expect(page).toHaveURL(/view=wallet\.core/);
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

test("local-first shell does not wait for a signed-in user context refresh", async ({ page }) => {
  const userId = "00000000-0000-4000-8000-000000000001";

  await page.goto("/manifest.webmanifest");
  await page.evaluate(async ({ userId }) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const encodePart = (value: object) => btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const accessToken = [
      encodePart({ alg: "HS256", typ: "JWT" }),
      encodePart({ aud: "authenticated", exp: nowSeconds + 3600, role: "authenticated", sub: userId }),
      "test-signature"
    ].join(".");
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "local-first@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString()
    };

    localStorage.setItem("openAbundanceOnboardingSeen", "true");
    localStorage.setItem("sb-bsikxrsguwketlloflgi-auth-token", JSON.stringify({
      access_token: accessToken,
      expires_at: nowSeconds + 3600,
      expires_in: 3600,
      refresh_token: "test-refresh-token",
      token_type: "bearer",
      user
    }));

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("open-abundance-offline", 4);
      request.onupgradeneeded = () => {
        for (const storeName of ["notes", "lists", "tasks", "taskCompletions", "guestIdentity"]) {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName, { keyPath: storeName === "guestIdentity" ? "key" : "id" });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("guestIdentity", "readwrite");
      transaction.objectStore("guestIdentity").put({
        key: "current",
        value: {
          guestId: "local-first-test-guest",
          claimedUserId: userId,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        }
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, { userId });

  let releaseContextRequest: () => void = () => undefined;
  let markContextRequested: () => void = () => undefined;
  const contextRequestBlocked = new Promise<void>((resolve) => {
    releaseContextRequest = resolve;
  });
  const contextRequested = new Promise<void>((resolve) => {
    markContextRequested = resolve;
  });

  await page.route("**/api/user/context?**", async (route) => {
    markContextRequested();
    await contextRequestBlocked;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: null, profile: null, core: null, wallet: null })
    });
  });

  await page.goto("/");
  await contextRequested;

  try {
    await expect(page.getByRole("navigation", { name: /Main navigation|Основная навигация/i })).toBeVisible({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: /My Lists|Мои списки/i })).toBeVisible({ timeout: 1000 });
    await page.getByRole("button", { name: /Checks|Проверки/i }).click();
    await expect(page.getByRole("heading", { name: /Tasks|Задачи/i })).toBeVisible({ timeout: 1000 });
    await page.getByRole("button", { name: /Notes|Заметки/i }).click();
    await expect(page.getByRole("heading", { name: /My Lists|Мои списки/i })).toBeVisible({ timeout: 1000 });
  } finally {
    releaseContextRequest();
  }
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
