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

test("new guest can use Chinese, Spanish, and Hindi onboarding copy", async ({ page }) => {
  const locales = [
    { value: "zh", title: "在生活中创造丰盛" },
    { value: "es", title: "Crea abundancia en tu vida" },
    { value: "hi", title: "अपने जीवन में समृद्धि बनाएं" }
  ];

  await page.goto("/");
  for (const locale of locales) {
    await page.locator(".onboarding-language-select").selectOption(locale.value);
    await expect(page.getByRole("heading", { name: locale.title })).toBeVisible();
  }
});

test("new visitor completes the three-screen story and must sign in with Google", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Others are already succeeding" })).toBeVisible();

  await page.getByRole("button", { name: "View stories" }).click();
  await expect(page.getByRole("heading", { name: "20 levels to $1,000,000" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("returning guest goes directly to Google sign-in instead of the app shell", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => window.localStorage.setItem("openAbundanceOnboardingSeen", "true"));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "20 levels to $1,000,000" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("first registration reward appears once and opens the feed", async ({ page }) => {
  await prepareAuthenticatedApp(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("openAbundancePostAuthReward", JSON.stringify({
      account: "core",
      amount: 2,
      balanceAfter: 2,
      claimed: true
    }));
  });

  await page.goto("/?view=people&auth=complete");
  await expect(page.getByRole("heading", { name: "Your first reward" })).toBeVisible();
  await expect(page.getByText("+2$", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open the feed" }).click();
  await expect(page).toHaveURL(/view=people/);
  await expect(page).not.toHaveURL(/auth=complete/);

  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("openAbundancePostAuthReward"))).toBeNull();
  await expect(page.getByRole("heading", { name: "Your first reward" })).toHaveCount(0);
});

test("reflection inbox captures offline without calling AI and survives reload", async ({ page, context }) => {
  await prepareAuthenticatedApp(page);
  let aiCalls = 0;
  await page.route("**/api/ai/reflections/step", async (route) => {
    aiCalls += 1;
    await route.abort();
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("openAbundanceLocale", "en");
  });
  await page.goto("/");

  await context.setOffline(true);
  await page.getByRole("textbox", { name: "Quick thought or feeling capture" }).fill("I keep postponing one difficult message.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText("Remind me to process the inbox once a day")).toHaveCount(0);
  expect(aiCalls).toBe(0);

  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("open-abundance-offline", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const notes = await new Promise<Array<{ body: string; kind?: string; processing?: { status?: string } }>>((resolve, reject) => {
      const request = db.transaction("notes", "readonly").objectStore("notes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const note = notes.find((note) => note.body === "I keep postponing one difficult message.");
    return note ? { ...note, reviewAt: (note as { processing?: { reviewAt?: string } }).processing?.reviewAt } : undefined;
  });
  expect(saved).toMatchObject({ kind: "reflection", processing: { status: "inbox" } });
  expect(new Date(saved?.reviewAt ?? "").getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  expect(new Date(saved?.reviewAt ?? "").getTime()).toBeLessThan(Date.now() + 25 * 60 * 60 * 1000);

  await context.setOffline(false);
  await page.goto("/?view=goals.notes&reflectionInbox=1");
  await expect(page.getByRole("heading", { name: "Process" })).toBeVisible();
  await expect(page.getByText("You can return to this later.")).toHaveCount(0);
  await expect(page.getByText("Remind me to process the inbox once a day")).toHaveCount(0);
  await expect(page.getByText("Process now", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /I keep postponing one difficult message/ })).toBeVisible();
  expect(aiCalls).toBe(0);
});

test("Home shows one local item for due reflection notes", async ({ page }) => {
  await prepareAuthenticatedApp(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("openAbundanceLocale", "en");
  });
  await page.goto("/?view=home");
  await page.evaluate(() => {
    const request = indexedDB.open("open-abundance-offline", 4);
    request.onsuccess = () => {
      const db = request.result;
      const note = {
        id: "due-reflection-test",
        title: "Due note",
        body: "A local due note",
        reminders: [],
        completed: false,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "local",
        kind: "reflection",
        processing: { schemaVersion: 1, status: "inbox", reviewAt: new Date(Date.now() - 60_000).toISOString(), answers: [], questionCount: 0 }
      };
      const transaction = db.transaction("notes", "readwrite");
      transaction.objectStore("notes").put(note);
      transaction.oncomplete = () => {
        db.close();
        window.dispatchEvent(new Event("open-abundance:notes-changed"));
      };
    };
  });
  await expect(page.getByRole("button", { name: /Review notes/ })).toBeVisible();
  await page.getByRole("button", { name: /Review notes/ }).click();
  await expect(page.getByRole("heading", { name: "Process" })).toBeVisible();
});

test("reflection processing uses guided choices, asks at most two follow-ups, and returns an editable proposal", async ({ page }) => {
  await prepareAuthenticatedApp(page);
  let aiCalls = 0;
  let submittedGuided: { desiredChanges?: string[] } | undefined;
  await page.route("**/api/ai/reflections/step", async (route) => {
    aiCalls += 1;
    const body = route.request().postDataJSON() as { answers?: unknown[]; guided?: { desiredChanges?: string[] } };
    if (body.guided) submittedGuided = body.guided;
    const answerCount = body.answers?.length ?? 0;
    if (!body.guided) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          mode: "guided",
          suggestions: {
            feelings: [{ id: "anxiety", label: "Anxiety" }, { id: "irritation", label: "Irritation" }, { id: "uncertainty", label: "Uncertainty" }, { id: "tiredness", label: "Tiredness" }],
            causes: [{ id: "conflict", label: "Fear of conflict" }, { id: "clarity", label: "Need for clarity" }, { id: "energy", label: "Not enough energy" }, { id: "control", label: "Lack of control" }],
            desiredChanges: [{ id: "start", label: "Start the conversation" }, { id: "understand", label: "Understand the situation" }, { id: "prepare", label: "Prepare first" }, { id: "accept", label: "Accept what I cannot control" }],
            actions: [{ id: "opener", label: "Write a two-sentence opener" }, { id: "ask", label: "Ask for clarification" }, { id: "time", label: "Set aside ten minutes" }, { id: "support", label: "Ask someone for support" }]
          }
        })
      });
      return;
    }
    if (answerCount < 2) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ mode: "question", question: { id: `question_${answerCount + 1}`, text: `Question ${answerCount + 1}?` } })
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        mode: "proposal",
        proposal: {
          summary: "A difficult message is being postponed.",
          selfStatement: "When I think about the unsent message, I feel anxiety because clarity matters to me. I want to start the conversation. I am ready to write a short opener.",
          facts: ["The message has not been sent"],
          thoughts: ["The conversation may be uncomfortable"],
          feelings: ["Anxiety"],
          bodySignals: [],
          reactions: ["Postponing"],
          desiredOutcome: "Start the conversation respectfully",
          causes: [{ id: "cause_1", text: "Fear of conflict", rationale: "Postponing reduces discomfort in the short term", confirmed: false }],
          alternatives: [
            { title: "Send a short opener", description: "Starts the conversation with limited effort" },
            { title: "Schedule a call", description: "Provides more context but needs coordination" }
          ],
          resourcesHave: ["Contact details"],
          resourcesNeed: ["A calm 10-minute window"],
          resourcesObtain: ["Choose a time"],
          practiceId: "implementation_intention",
          outcomeKind: "act_now",
          nextAction: "Write a two-sentence opener",
          ifThen: "When it is 7 PM, I will write and send the opener."
        }
      })
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("openAbundanceLocale", "en");
    window.localStorage.setItem("open-abundance:reflection-settings:v1", JSON.stringify({ reviewTime: "19:00", enabled: false, configured: true }));
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "Quick thought or feeling capture" }).fill("I keep postponing one difficult message.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: /Process/ }).first().click();
  await page.getByText("Process now", { exact: true }).click();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Process with AI" }).click();
  await expect(page.getByRole("heading", { name: "What am I feeling right now?" })).toBeVisible();
  await page.getByText("Anxiety", { exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Need for clarity", { exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByPlaceholder("Write it in your own words").fill("Clarify what I need from the conversation");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText("Write a two-sentence opener", { exact: true }).click();
  await page.getByRole("button", { name: "Build summary" }).click();

  for (let index = 1; index <= 2; index += 1) {
    await expect(page.getByRole("heading", { name: `Question ${index}?` })).toBeVisible();
    await page.getByRole("textbox", { name: "Short answer" }).fill(`Answer ${index}`);
    await page.getByRole("button", { name: "Answer", exact: true }).click();
  }

  await expect(page.getByRole("heading", { name: "Possible causes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Schedule" })).toBeVisible();
  await expect(page.getByLabel("I-statement")).toHaveValue(/clarity matters to me/);
  await expect(page.getByLabel("Next action")).toHaveValue("Write a two-sentence opener");
  expect(submittedGuided).toMatchObject({ desiredChanges: ["Clarify what I need from the conversation"] });
  expect(aiCalls).toBe(4);
});

test("reflection safety gate stops ordinary AI processing", async ({ request }) => {
  const response = await request.post("/api/ai/reflections/step", { data: { rawText: "I want to kill myself", answers: [], locale: "en" } });
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ mode: "safety" });
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

test("authenticated user sees the ordered first Core path without the registration challenge", async ({ page }) => {
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

  await expect(page.getByRole("heading", { name: "First Core Path" })).toBeVisible();
  await expect(page.getByText("Save Your Progress", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Choose Your Main Wish", { exact: true })).toBeVisible();
  await expect(page.getByText("Build Your Growth Plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Reach Today Core Target", { exact: true })).toBeVisible();
  await expect(page.getByText("Publish Your First Result", { exact: true })).toBeVisible();
});
