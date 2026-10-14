# Deployment

Target: Vercel for the app, Supabase for data, auth and Realtime. The steps below set up a new environment (for example staging or production). Never reuse production secrets in development.

## 1. Supabase project

1. Create a project. Choose a region close to the majority of your users.
2. Apply the migrations in filename order (`supabase/migrations/`). Use the Supabase CLI (`supabase db push`) or run each file in the SQL editor for a first setup. Do not hand-edit the schema afterwards: add a new migration instead.
3. The instrument and style catalogue comes from migration `20261014120300_catalogue.sql`, so production gets it with the migrations. `supabase/seed.sql` is for development only, and it adds no data yet. Never run it against production.
4. Confirm that the `messages` table is in the `supabase_realtime` publication (the migration adds it when the publication exists).
5. Authentication settings:
   - Email provider enabled. Magic link sign-in is used; password sign-in is not offered.
   - Site URL: your production origin.
   - Redirect URLs: `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback` for development only.
   - Set email rate limits to Supabase defaults or stricter.
6. Copy the project URL and the anon key (public) and the service role key (secret, server only).

## 2. Vercel project

Import the GitHub repository. Framework preset: Next.js. Install command: `npm ci`. Build command: `npm run build`.

Environment variables (Production and Preview as needed):

| Variable                        | Scope  | Notes                                                                                                                        |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`          | Public | Required in production. Used for auth redirects. The app refuses to start auth flows without it.                             |
| `NEXT_PUBLIC_SUPABASE_URL`      | Public | Project URL                                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Anon key. Row level security protects the data.                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Secret | Server only. Never prefix with `NEXT_PUBLIC_`.                                                                               |
| `CRON_SECRET`                   | Secret | Long random string. Vercel Cron sends it as the bearer token. Generate with a password manager or `openssl rand -base64 32`. |

Vercel Cron reads `vercel.json` and calls `/api/cron/expire-holds` every 5 minutes with `Authorization: Bearer $CRON_SECRET`.

## 3. Pre-release checks

Run locally, then in the preview deployment:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

All four must pass. Then check by hand:

- [ ] Sign-in link arrives, opens the callback, and lands on the page you asked for
- [ ] A signed-out visit to `/learn/bookings` redirects to `/login` and back after sign-in, with no loop
- [ ] `/admin` returns 404 for a learner
- [ ] A slot cannot be held twice (open two tabs and hold the same time)
- [ ] `/api/health` returns `ok`
- [ ] `/api/cron/expire-holds` returns 404 without the bearer token
- [ ] Response headers include `Content-Security-Policy` with a nonce, `Strict-Transport-Security`, `X-Frame-Options: DENY`
- [ ] No secrets appear in the browser bundle (search the built JavaScript for the service role key prefix; the result must be empty)
- [ ] Lighthouse on `/teachers` meets the targets in the product plan (performance, accessibility, best practices and SEO at 95 or above)

## 4. Rollback

Vercel keeps previous deployments. Promote the last good deployment from the dashboard. Database changes are never rolled back by redeploying: write a forward migration that reverses the change.

## 5. Things still to set up

These are needed before live payments or live video. Each is tracked in [decisions.md](decisions.md).

- Payment provider: implement `PaymentProvider` in `src/features/payments/provider.ts` and return it from `getPaymentProvider()`.
- Video provider: implement `VideoProvider` in `src/features/classroom/video-provider.ts` and return it from `getVideoProvider()`. Add the provider's own secrets to Vercel as server-only variables.
- Rate limiting on public submission endpoints (Upstash Redis, once approved).
- Error monitoring and log retention.
