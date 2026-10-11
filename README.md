# HT Investment Terminal

A Bloomberg-inspired, browser-based workspace for a high school finance club. Interns submit investment proposals; managers review each thesis and risk statement, approve or reject it, and record simulated fills only after approval. The app logs proposals and paper trades in Supabase Postgres and gives managers a roster, proposal queue, and trade ledger. It never sends orders to a broker.

## Local preview

Use Node.js 22 or newer. Run npm ci, then npm run dev. Without configuration, the app is a read-only preview: sample quotes and generated charts are explicitly labeled illustrative. Google sign-in, shared records, manager controls, and the market-data proxy require a configured Supabase project.

## Google sign-in and first manager

Google OAuth runs through Supabase Auth. The OAuth web client callback must be the callback URL shown in Supabase Auth provider settings. The Supabase site URL and redirect allowlist should include:

https://idxtry.github.io/ht-finance-terminal/

The Google consent screen is currently in External testing mode. Add each club account as a test user in Google Auth Platform → Audience.

After applying supabase/schema.sql in the Supabase SQL Editor, each member signs in once. The first manager then runs supabase/bootstrap_manager.sql after replacing its email placeholder with their Google account email. Managers can assign intern or manager roles to later accounts in the Members page. Pending accounts cannot read club records or submit proposals. Row-level security and manager-only Postgres functions enforce these roles.

## GitHub Pages

The deploy workflow builds the Vite app on pushes to main. Add these GitHub Actions repository variables before dispatching it:

- VITE_SUPABASE_URL: https://nftmbvwzeahcnfycdoam.supabase.co
- VITE_SUPABASE_ANON_KEY: the public Supabase anon or publishable key

The anon/publishable key is intended for public browser use; never put a Supabase service-role key or a Google client secret in Vite, GitHub Pages, or a repository variable. After adding the variables, run the Deploy terminal workflow from the Actions tab.

## Market data

Alpaca Basic is the strongest no-cost candidate found for US stock and ETF quotes. It includes the IEX exchange feed, with historical data available since 2016 but a 15-minute limit on the newest historical window. The app includes a Supabase Edge Function adapter for snapshots and chart bars. Provider credentials stay in Supabase function secrets, and the function requires an authenticated club member.

There is a material licensing limit: Alpaca’s customer agreement says not to reproduce or distribute market data without written consent, and its support page says API data cannot be redistributed. A single club API key must not be enabled for a shared feed unless Alpaca confirms in writing that this club display is permitted. The adapter is ready, but leave its Alpaca secrets unset until permission is confirmed. The terminal continues to run in clearly labeled illustrative-data mode.

- [Alpaca Basic plan coverage](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Alpaca market-data redistribution guidance](https://alpaca.markets/support/redistribute-alpaca-api)

If Alpaca approves the club use, add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY as Supabase Edge Function secrets, then deploy supabase/functions/market-data. Never place either provider key in GitHub Actions variables or the browser bundle.

## Paper-account rules

Each member starts with an illustrative $100,000 paper account. Postgres serializes manager fills per account and checks cash before buys and held shares before sells. A proposal can be executed only once, only after manager approval, and every fill is linked to its source proposal. The portfolio uses indicative marks; the leaderboard shows notional participation, not investment returns. No real account, order routing, commissions, slippage, or tax calculations are connected.
