# Display currency

Open Abundance keeps all balances, inputs, API payloads, and calculations in USD. The profile preference changes presentation only; it is stored in browser `localStorage` and does not require a database migration.

The client keeps one `USD -> EUR/CNY/RUB` snapshot for 10 minutes. A stale snapshot remains visible while `/api/exchange-rates` refreshes it in the background. The route has a matching 10-minute CDN cache and does not run a scheduled process.

Set the following server-only environment variable in local and production deployments:

```text
TWELVE_DATA_API_KEY=<Twelve Data API key>
```

The route requests the direct market pairs `USD/EUR`, `USD/CNY`, and `USD/RUB` from Twelve Data. If that provider is not configured or temporarily fails, it derives the same direct pairs from the Bank of Russia daily reference rates. The API key is never sent to the browser.
