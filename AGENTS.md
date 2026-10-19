# Repository Instructions

Before starting any coding task in this repository, read:

```text
docs/DEVELOPMENT_RULES.md
```

Follow those project-specific rules even if the user did not mention them in the request.

Verification is strictly time-boxed. In the Codex VS Code extension on Windows, use the configured Playwright MCP browser for interactive visual checks; the built-in Browser is not available in the IDE extension. Attempt browser verification at most once per scope, never retry an unavailable browser, and stop any Playwright MCP or repository Playwright run that has no result within 30 seconds. Use the fallback checks and targeted deterministic tests defined in `docs/DEVELOPMENT_RULES.md`; do not spend repeated attempts on broken browser or test-server infrastructure.

## Core Invariants

These rules apply to every change, without exceptions (full text: "Инварианты Core" in `docs/OPEN_ABUNDANCE_MASTER_PLAN.md`):

- Core always earns `0.0633%` per day. Accrual is never stopped or reduced by any event; the coverage traffic light limits only withdrawals and new withdrawable rewards.
- Core is non-decreasing and inalienable: it cannot be reduced, sold, transferred, inherited, converted back to Wallet, pledged as an asset or seized. Only a contractual direction of future income is allowed (installments, P2P pledge).
- If the user has an installment obligation, up to 50% of the daily accrual goes first to repayment.
- Bought, earned and rewarded Core behave identically.

## FOUNDER OS Mode

When the user explicitly says `FOUNDER OS`, `что делать дальше`, or `статус проекта`, read `docs/FOUNDER_OS.md` completely and follow it for that request.

FOUNDER OS is a read-only operating review by default. Do not change project state until the user explicitly asks to carry out the recommended work.
