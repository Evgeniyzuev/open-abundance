import { expect, test, type Page } from "@playwright/test";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

async function prepareAuthenticatedApp(page: Page) {
  await page.route("**/api/user/context?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: TEST_USER_ID,
          aud: "authenticated",
          role: "authenticated",
          email: "e2e@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString()
        },
        profile: null,
        core: null,
        wallet: null
      })
    });
  });

  await page.addInitScript(async ({ userId }) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const encodePart = (value: object) => btoa(JSON.stringify(value))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "e2e@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString()
    };
    const accessToken = [
      encodePart({ alg: "HS256", typ: "JWT" }),
      encodePart({ aud: "authenticated", exp: nowSeconds + 3600, role: "authenticated", sub: userId }),
      "test-signature"
    ].join(".");

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
      const request = indexedDB.open("open-abundance-offline");
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
          guestId: "e2e-claimed-guest",
          claimedUserId: userId,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        }
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, { userId: TEST_USER_ID });
}

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

  await page.getByLabel("Language").selectOption("ru");
  await expect(page.getByRole("heading", { name: "Создавай изобилие в своей жизни" })).toBeVisible();
  await expect(page.locator(".onboarding-language-select")).toHaveValue("ru");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("openAbundanceOnboardingLocale"))).toBe("ru");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Создавай изобилие в своей жизни" })).toBeVisible();
});

test("new visitor completes the three-screen story and can request an email OTP", async ({ page }) => {
  const pageErrors: string[] = [];
  let emailOtpAttempts = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/auth/v1/otp", async (route) => {
    emailOtpAttempts += 1;
    if (emailOtpAttempts === 1) {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Temporary error" }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Others are already succeeding" })).toBeVisible();

  await page.getByRole("button", { name: "View stories" }).click();
  await expect(page.getByRole("heading", { name: "20 levels to the life of your dreams" })).toBeVisible();
  await expect(page.getByText("Your route is ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "GO" })).toBeVisible();

  await page.getByRole("button", { name: "GO" }).click();

  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);

  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByRole("heading", { name: "Continue with email" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Verification code" })).toBeDisabled();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.locator(".onboarding-error")).toHaveText("Enter a valid email address.");

  await page.getByLabel("Email").fill("new-user@example.com");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.locator(".onboarding-error")).toContainText("Could not send the code");

  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("status")).toContainText("Code sent");
  await expect(page.getByRole("status")).toContainText("new-user@example.com");
  await page.getByRole("textbox", { name: "Verification code" }).fill("123");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.locator(".onboarding-error")).toHaveText("Enter the six-digit code from the email.");
  await expect(page.getByRole("button", { name: /Resend in \d+s/ })).toBeDisabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("returning device opens local-first notes without waiting for sign-in", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("openAbundanceOnboardingSeen", "true"));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "My lists" })).toBeVisible();
  await expect(page.getByRole("navigation")).not.toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("notes: a new note goes to the Inbox offline, opens full screen and closes with Back", async ({ page, context }) => {
  await prepareAuthenticatedApp(page);
  await page.addInitScript(() => window.localStorage.setItem("openAbundanceLocale", "en"));
  await page.goto("/?view=goals.notes");
  await expect(page.getByRole("heading", { name: "My lists" })).toBeVisible();
  await expect(page.getByText("Sort it all out")).toHaveCount(0);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Create note" }).click();
  const detail = page.getByRole("dialog", { name: "New note" });
  await detail.getByRole("textbox", { name: "Note title" }).fill("Call the bank");
  await detail.getByRole("button", { name: "Close" }).click();
  await expect(detail).toHaveCount(0);

  await page.getByRole("button", { name: /Inbox/ }).click();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.getByRole("button", { name: "AI review of the note" }).first().click();
  await expect(page.getByText("AI review of notes is coming soon.")).toBeVisible();

  await page.getByRole("button", { name: /Call the bank/ }).click();
  await expect(page.getByRole("dialog", { name: "Note" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Note" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await context.setOffline(false);
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
      const request = indexedDB.open("open-abundance-offline");
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

test("authenticated user sees former Core path cards in the standard available list", async ({ page }) => {
  await prepareAuthenticatedApp(page);
  const pathTitles = [
    "Choose Your Main Wish",
    "Build Your Growth Plan",
    "Reach Today Core Target",
    "Publish Your First Result"
  ];
  await page.route("**/api/challenges?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        viewerUserId: TEST_USER_ID,
        challenges: pathTitles.map((title, index) => ({
          id: `first-core-path-${index + 1}`,
          title: { en: title },
          description: { en: "" },
          instructions: { en: "" },
          requirements: { en: "" },
          reward_label: null,
          category: "onboarding",
          difficulty_level: 1,
          duration_days: 1,
          image_url: null,
          verification_type: "auto",
          verification_logic: null,
          sort_order: index + 1,
          track_key: "first_core_path",
          track_step: index + 1,
          action_view: null,
          user_challenge_status: null
        }))
      })
    });
  });
  await page.goto("/?view=challenges");

  await expect(page.getByRole("heading", { name: "First Core Path" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^Available\b/ })).toBeVisible();
  await expect(page.getByText("Save Your Progress", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Choose Your Main Wish", { exact: true })).toBeVisible();
  await expect(page.getByText("Build Your Growth Plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Reach Today Core Target", { exact: true })).toBeVisible();
  await expect(page.getByText("Publish Your First Result", { exact: true })).toBeVisible();
});
