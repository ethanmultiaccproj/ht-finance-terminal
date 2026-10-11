# HT Investment Terminal

HTIC is a browser-based research and paper-trading workspace for a student investment club. It is a modular Vite application, not an embedded dashboard. It includes an interactive in-app candlestick chart, a searchable US equity/ETF universe, a personal watchlist, a proposal review queue, manager-entered paper fills, member portfolios, a club activity ledger, member access controls, and CSV export.

This application does not connect to a broker or place orders. Members submit ideas; a manager approves or rejects them; only an approved idea can be recorded as a paper fill. Supabase Postgres functions check paper-account cash and share balances when a manager records that fill.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

The app opens at the Vite local URL. Without configured Supabase credentials it runs in preview mode with clearly labeled generated training prices. These values are deterministic examples, not live or historical market data.

To run the checks and production build:

```sh
npm test
npm run build
```

## Modules

- `src/main.js` owns navigation, authentication state, forms, and interactions.
- `src/views/terminal-pages.js` renders each terminal workspace.
- `src/components/price-chart.js` draws candles, volume, crosshair values, and optional 20/50-period averages in the app.
- `src/services/market-data.js` calls the Supabase market-data function; `training-market.js` supplies the labeled preview feed.
- `src/lib/portfolio.js` calculates personal positions, average cost, cash, and realized/unrealized P&L from manager-recorded fills.
- `supabase/schema.sql` defines the tables, row-level security, and manager-only review/fill/member functions.
- `supabase/functions/market-data/index.ts` validates active membership and proxies the optional Alpaca feed without exposing provider keys to the browser.

## Supabase and Google sign-in

The app uses Google OAuth through Supabase Auth. In Supabase Auth, set the site URL and redirect allowlist to:

```text
https://idxtry.github.io/ht-finance-terminal/
```

Set the Google OAuth web-client redirect URI to the callback shown in Supabase Auth → Providers → Google. The Google consent screen may need club members added as test users while it remains in testing mode.

The project tables and role policies are in `supabase/schema.sql`. After the first manager signs in, that account can be promoted once by running `supabase/bootstrap_manager.sql` with the manager's Google email substituted in the SQL. Managers can then activate later sign-ins and assign intern/manager roles from the Members page. Pending accounts cannot read club proposals or trades. The database enforces review and execution permissions independently of the client UI.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys `dist/` on a push to `main`. Add these repository Actions variables under Settings → Secrets and variables → Actions → Variables:

- `VITE_SUPABASE_URL`: the Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key.

Then push to `main` or run **Deploy terminal** from Actions. The public anon/publishable key is designed for browser use with row-level security. Never put a Supabase service-role key, Google client secret, or Alpaca secret in Vite variables or this repository.

## Optional free market feed

The default preview is synthetic. For exchange data, the terminal supports Alpaca's free IEX stock feed. Alpaca's free plan supplies IEX data rather than consolidated SIP coverage, so prints and volume may differ from the whole US market. Create a free Alpaca paper account and use its API key pair for the data feed; this app still sends no broker orders. Check Alpaca's current [market data plan details](https://docs.alpaca.markets/us/docs/about-market-data-api) and [market data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq).

Deploy the server-side function to the Supabase project and set the two keys in Supabase Edge Function secrets:

```sh
npx supabase functions deploy market-data --project-ref nftmbvwzeahcnfycdoam
npx supabase secrets set ALPACA_API_KEY_ID=your_key_id ALPACA_API_SECRET_KEY=your_secret --project-ref nftmbvwzeahcnfycdoam
```

Alternatively, add those same names under Supabase → Edge Functions → Secrets. Do not paste key values into chat or commit them. After the function and secrets are in place, a signed-in, active club member can use **Feed setup → Test connection**. Visitors and pending accounts keep the synthetic preview feed. If the feed is unconfigured or fails, the interface labels its fallback as training simulation.

## Open-source components and references

The chart uses [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/), an Apache-2.0 library, rendered directly in the application. Its license is included at `third-party/lightweight-charts-LICENSE.txt`; the app displays the required TradingView copyright and link. See `THIRD_PARTY_NOTICES.md` for attribution.

I also reviewed an [MIT-licensed open-source trading dashboard](https://github.com/maddoxk/frontend-trading-dashboard) for interaction and layout ideas. Its README identifies its market prices as synthetic; this app uses original club-specific implementation and does not copy that repository's code. [Lovable's GitHub guide](https://docs.lovable.dev/integrations/github) documents syncing a project that a user owns with their GitHub repository; it is not a public library of reusable Lovable project source.

## Paper-account model

Each activated member starts with $100,000 in simulated cash. Buys and sells are attributed to the proposal's author, while the manager who records each fill is retained in the ledger. Fill recording is serialized per member account, checks available cash and held shares, and can happen once per approved proposal. The portfolio uses average-cost accounting and current selected-feed marks when available; without a connected feed it shows fill-based positions and labels the quote feed as training simulation. There is no brokerage integration, order routing, commission, slippage, or tax model.
