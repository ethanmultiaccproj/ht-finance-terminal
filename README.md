# HT Terminal
GitHub Pages frontend for club investment proposals, manager approval, and manually priced paper trade records. No live orders or live quotes. Leaderboard valuation and cash/position accounting are not implemented yet.

## Development
Node 22: `npm ci`, `npm run dev`, `npm run build`.

## Activate shared storage and Google login
1. Create a Supabase project and run `supabase/schema.sql` once in its SQL editor.
2. Configure Google OAuth in Google Cloud and enable the Google provider in Supabase Authentication. Keep the Google client secret only in Supabase. Google's authorized redirect URI is `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. Set Supabase Site URL and allowed redirect URL to the exact GitHub Pages URL, including repository path and trailing slash.
4. Set GitHub repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public anon/publishable key only). Rerun Deploy terminal. Never use a service-role key in the frontend.
5. After each club member signs in, add their Auth user UUID to `public.members` through Supabase SQL: `insert into public.members(id,role) values ('USER_UUID','intern');`. Use `manager` for managers. New sign-ins have no club access until provisioned; users cannot grant themselves roles.

## Workflow and enforcement
Intern submits a proposal. A manager approves/rejects it. A manager enters a simulation price and records a fill. Database functions verify the role and state and lock proposals during execution. Unique proposal references prevent duplicate trades. Clients cannot update/delete trades or grant membership. Interns see their own records; managers see all club records. Price input is explicitly manual; this is an approval-backed paper ledger, not an exchange execution simulator. Apply schema in a disposable project and test with intern, manager and outsider accounts before club rollout.

GitHub Actions builds the site with relative asset paths and publishes `dist` to Pages. Without backend variables the site displays an honest setup-required preview.
