# Open Abundance

Mobile-first, offline-capable PWA for daily action, financial goals, visible progress and coordinated growth with other people.

## Current State

Open Abundance is a broad technical pre-alpha. The repository already contains onboarding, wishes, Core/Wallet, levels, reinvestment, a financial calculator, Today, challenges, tasks/streaks, social profiles and feed, referrals/teams, Trust-lite, projects and an early marketplace foundation.

The current product iteration is not feature expansion. It is the preparation of one coherent closed-pilot journey for 20-50 Russian-speaking users:

```text
result story -> main wish -> financial plan -> Today action -> verified reward
-> Core/Wallet growth -> published result -> reason to return
```

Features that exist in code but have not passed manual user verification are not considered complete. The canonical operational status and ordered queue live in [docs/MASTER_KANBAN.md](docs/MASTER_KANBAN.md). The shared product lore, values, principles and FAQ live in [docs/OPEN_ABUNDANCE_LORE.md](docs/OPEN_ABUNDANCE_LORE.md). Concrete development decisions live in [docs/OPEN_ABUNDANCE_MASTER_PLAN.md](docs/OPEN_ABUNDANCE_MASTER_PLAN.md), while accumulated context and open questions live in [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md).

## Economic Pilot Boundary

- Core and Wallet are separate internal balances with user-controlled reinvestment.
- Pilot Wallet obligations must be covered by a limited, observable fund.
- Demo stories must always be marked and kept separate from verified participant results.
- External withdrawal is not assumed to be generally available during the first closed pilot; any limited payout requires legal, reserve and operational readiness.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Verification

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test:e2e
```

`pnpm exec tsc --noEmit` updates the tracked `tsconfig.tsbuildinfo`; restore that verification-only change afterward. The current smoke test is known to need alignment with the guest onboarding flow and is tracked as the second queued product step.

For development conventions, UTF-8 handling, IndexedDB rules and frontend verification requirements, read [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md).
