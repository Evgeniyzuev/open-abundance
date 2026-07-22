# Repository Instructions

Before starting any coding task in this repository, read:

```text
docs/DEVELOPMENT_RULES.md
```

Follow those project-specific rules even if the user did not mention them in the request.

Verification is strictly time-boxed. Attempt the in-app browser at most once per session, never retry a browser that is unavailable, and stop any Playwright run that has no result within 30 seconds. Use the fallback checks and targeted deterministic tests defined in `docs/DEVELOPMENT_RULES.md`; do not spend repeated attempts on broken browser or test-server infrastructure.
