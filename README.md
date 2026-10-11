# HT Investment Terminal

A Bloomberg-inspired, browser-based workspace for a high school finance club. Interns submit investment proposals; managers review each thesis and risk statement, approve or reject it, and record simulated fills only after approval. The app logs proposals and paper trades in Supabase Postgres and gives managers a roster, proposal queue, and trade ledger. It never sends orders to a broker.

## Local preview

Use Node.js 22 or newer. Run npm ci, then npm run dev. The market screens embed TradingView charts for display; proposal review and shared records require a configured Supabase project.

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

TradingView provides free embeddable charts and market widgets for websites. US stock exchange data may be delayed, and coverage varies by market. The app embeds TradingView’s hosted chart for human-readable display only; it does not fetch, store, or process those prices. Do not use TradingView values to set paper fill prices or validate orders. A manager must enter an independent simulated fill price when recording an approved paper trade. The portfolio reports fill-price cost basis, not current market value.

- [TradingView widget setup](https://www.tradingview.com/widget-docs/getting-started/)
- [Free markets available to TradingView widgets](https://www.tradingview.com/widget-docs/markets/)
- [TradingView data FAQ](https://www.tradingview.com/widget-docs/faq/data/)
- [TradingView terms on display-only use](https://www.tradingview.com/policies/)

## Paper-account rules

Each member starts with a $100,000 paper account. Postgres serializes manager fills per account and checks cash before buys and held shares before sells. A proposal can be executed only once, only after manager approval, and every fill is linked to its source proposal. The portfolio reports remaining cost basis; the leaderboard shows notional participation, not investment returns. No real account, order routing, commissions, slippage, or tax calculations are connected.
