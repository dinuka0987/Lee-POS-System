# Lee POS

Lee's retail POS uses React/Vite, NestJS, Prisma, and PostgreSQL in an npm-workspace monorepo. Money is integer **LKR cents**; shared utilities handle pricing, tax, change, and stock validation.

Implemented: first-admin website registration, admin/cashier login, products/categories, barcode checkout, cash and external-terminal payment recording, receipt printing, sales history/reprints, daily reports, full-sale voids/audit, cashier account management, shop/print settings, and offline PWA checkout with a durable sync queue.

For the deployed Vercel installation, follow [Vercel configuration and admin setup](#vercel-configuration-and-admin-setup). For a local demonstration, use [Run locally](#run-locally). The separate [Docker/VPS deployment guide](deploy/README.md) applies to a Linux server, not Vercel.

## Vercel configuration and admin setup

### 1. Understand the connections

```text
Cashier browser → React frontend on Vercel → NestJS backend on Vercel → Neon PostgreSQL
```

The backend alone connects to PostgreSQL. The browser keeps its offline catalog and queued sales in IndexedDB. Cloud data and browser data are separate; sync all existing tills before changing domains because browser storage does not transfer to a different domain.

The Lee addresses configured during setup are:

| Component                 | Address                                      |
| ------------------------- | -------------------------------------------- |
| Frontend / shop interface | https://lee-pos-system-nhwe.vercel.app       |
| Backend                   | https://lee-pos-system.vercel.app            |
| Backend API base          | https://lee-pos-system.vercel.app/api        |
| First-admin setup page    | https://lee-pos-system-nhwe.vercel.app/setup |

Replace these addresses if you deploy another copy or add a custom domain. Vercel configuration belongs in each project's dashboard. Root `.env` is for local development; `deploy/.env` is for Docker. Editing either local file does not update an existing Vercel deployment.

### 2. Prepare the repository and database

Use Node.js 24.11+ and npm 11+. Upload the contents of `pos-system` as the GitHub repository root, so `apps`, `packages`, and `package.json` are at its top level. Keep the repository private and verify `.env`, `deploy/.env`, `node_modules`, passwords, and tokens are excluded from commits. Push updated source before deploying it.

Create a Neon PostgreSQL project/database, directly through Neon or a Vercel database integration. In Neon's **Connect** dialog, select the intended branch, database and role. Copy two versions of the connection string privately:

| Connection            | Where to use it                       |
| --------------------- | ------------------------------------- |
| Pooled URL            | Backend Vercel `DATABASE_URL`         |
| Direct / unpooled URL | Migration commands from your terminal |

Turn connection pooling on/off in the provider's dialog to obtain the two URLs; pooled Neon hostnames contain `-pooler`. Preserve the provider's SSL/query parameters. Cloud URLs use the provider hostname, not `localhost` or Docker hostname `postgres`. A typical placeholder URL is `postgresql://USER:PASSWORD@PROVIDER_HOST/DATABASE?sslmode=require`. See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

### 3. Create the two Vercel projects

Import the same repository twice. Use the settings below and enable **Include source files outside of the Root Directory in the Build Step** on both projects so they can access `packages/shared` and the workspace files.

| Setting          | Backend project      | Frontend project     |
| ---------------- | -------------------- | -------------------- |
| Root Directory   | `apps/api`           | `apps/web`           |
| Framework Preset | NestJS               | Vite                 |
| Node.js version  | `24.x`               | `24.x`               |
| Install Command  | `cd ../.. && npm ci` | `cd ../.. && npm ci` |
| Output Directory | Framework default    | `dist`               |

Backend Build Command:

```sh
cd ../.. && npm run db:generate && npm run build -w @lee/shared && npm run build -w @lee/api
```

Frontend Build Command:

```sh
cd ../.. && npm run build -w @lee/shared && npm run build -w @lee/web
```

Keep the SPA rewrite in `apps/web/vercel.json`; it allows direct navigation and refresh on `/setup`, `/products`, and other React routes. Framework references: [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [shared monorepo source](https://vercel.com/docs/monorepos/monorepo-faq).

### 4. Configure the backend environment

Open the **backend project → Settings → Environment Variables → Add Environment Variable**. Save each value for **Production**. Use private Secret variables for database credentials, JWT secret and setup token where that option is offered. Do not add surrounding quotes to dashboard values.

| Variable                    | Value / purpose                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                                                            |
| `API_HOST`                  | `0.0.0.0`                                                                                               |
| `API_PORT`                  | `3000`                                                                                                  |
| `TRUST_PROXY`               | `1`                                                                                                     |
| `DATABASE_URL`              | Complete private Neon pooled connection string                                                          |
| `JWT_SECRET`                | Private random value of at least 32 characters; keep stable between deployments                         |
| `BRANCH_ID`                 | Intended shop UUID, e.g. `00000000-0000-4000-8000-000000000001`; preserve it for an existing shop       |
| `WEB_ORIGIN`                | `https://lee-pos-system-nhwe.vercel.app` — frontend origin, without `/api`, page path or trailing slash |
| `INITIAL_ADMIN_SETUP_TOKEN` | Temporary private random key of 32–256 characters, needed only to create the first admin                |

Generate random values locally with a password manager or this command. Run it separately for the JWT secret and setup key; use different values and keep them private:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

The setup key authorizes first-time registration. It is not your login password, a database password, or the JWT secret. Never put these secrets in `VITE_` variables, source code, screenshots, chat, or GitHub. If a database credential has been exposed, reset the provider role's password and update every consumer of its URL.

`ADMIN_PASSWORD`, `CASHIER_PASSWORD` and `SEED_SAMPLE_PRODUCTS` are seed-script configuration, not required for website admin registration. Choose the admin email/password in the POS form and add cashier accounts afterward under Users.

### 5. Configure the frontend environment

Open the **frontend project's** environment variables and add:

```dotenv
VITE_API_BASE_URL=https://lee-pos-system.vercel.app/api
```

The value must include `/api`; it must not end with `/health` or `/auth/setup`. This public backend address is safe to expose. If Vercel warns about its public framework prefix, keep `VITE_` and use **Config**, not Secret, for this variable. The frontend must not receive `DATABASE_URL`, `JWT_SECRET`, the setup token, or account passwords.

Use the intended production addresses in these settings. Preview deployments need their own allowed frontend origin and a separate test database; do not connect arbitrary previews to real shop data. Ensure intended production users can reach both projects without an intervening Vercel login page; Lee's own login protects POS access.

### 6. Apply database migrations once

Migrations create/update database tables. Website registration creates the account afterward; **do not run `db:seed` or `db:setup` for this production registration flow**. Those commands create seed accounts, and `db:setup` can add sample products. Preserve existing shop data and take a backup before upgrading it.

Open a new PowerShell terminal in `pos-system`. Stop a running local dev server with Ctrl+C before reinstalling dependencies. On a fresh checkout or after an interrupted install, run:

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Stop here.' }
```

Then set the current direct cloud URL privately and run:

```powershell
$env:DATABASE_URL = 'YOUR_CURRENT_NEON_DIRECT_CONNECTION_STRING'

npm.cmd run db:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generation failed. Stop here.' }

npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Stop here.' }
```

Replace the placeholder before running. Do not paste credentials into support messages. Confirm the command reports successful migrations or no pending migrations, then close this terminal so later local commands do not accidentally use the cloud database. These commands do not copy local products/accounts into the cloud. For an existing real shop database, plan a backup/restore migration instead of starting with an empty database.

### 7. Deploy and create the admin on the website

Push the current changes. In Vercel, open **Deployments**, select a deployment containing the latest source and choose **Redeploy** from its menu. Deploy the backend and frontend and wait for both to show **Ready**. Repeat the relevant deployment whenever you change its environment variables; existing deployments keep their previous values. See [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

Open `https://lee-pos-system.vercel.app/api/auth/setup`. Before registration, with the setup key enabled and no admin present, expect:

```json
{ "required": true, "enabled": true }
```

Open the frontend login page and select **Create your administrator account**, or open `https://lee-pos-system-nhwe.vercel.app/setup`. Enter your name, chosen login email, a new password of at least 12 characters and at most 72 UTF-8 bytes, confirmation, and the exact private setup key from the backend environment. Click **Create admin account**, then **Continue to sign in** and use your chosen email/password. An email inbox is not required for login, and this flow does not send a verification email.

There is no default `admin@lee.local` account in website setup: the email you enter is your admin login. If an admin already exists, including a seeded or disabled admin, registration is closed. Do not delete accounts or shop data to reopen it. Sign in with the existing account; an authenticated admin can reset account passwords under **Users**. If all admin access is lost, contact the deployment/database owner for controlled recovery.

After confirming login, delete `INITIAL_ADMIN_SETUP_TOKEN` from the backend's Vercel environment and redeploy the backend. Setup also closes automatically when an admin exists. Do not remove `JWT_SECRET` or `DATABASE_URL`.

### 8. Configure the shop and cashier accounts

As admin, open **Settings** and enter the shop name, address, phone, receipt footer, paper width and print preference. Add actual categories/products, prices, tax rates and opening stock in **Products**. Add cashiers through **Users → Add cashier**, using a different email and password for each person; they sign in with their own accounts. Password resets and enabling/disabling cashiers are also under Users.

Run a controlled test sale, verify stock/history/reports, print a real receipt, then test PWA offline reload and reconnection with the app open. Sync every till before changing domain or updating. Never clear browser storage while sales remain unsynced. Complete the [cashier/hardware trial](docs/cashier-trial.md), configure database backups and verify restoration before relying on the system for real transactions. The API's login throttling uses in-memory per-IP counters; a serverless deployment needs appropriate shared/platform rate-limit protection before live use.

### Deployment troubleshooting

| Symptom                                                | Check / action                                                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cannot GET /` on the backend                          | Expected: the API has no homepage. Check `/api/health`, and use the frontend for the shop interface. Health is liveness only, not a database check.                                                                          |
| `Cannot GET /auth/setup`                               | Frontend API base is missing `/api`, or the browser is running an older build. Correct `VITE_API_BASE_URL`, redeploy the frontend, then accept the app update or test in a private window.                                   |
| Connection error / browser CORS error                  | Check frontend API URL, backend `WEB_ORIGIN`, HTTPS, backend availability and deployment protection. The allowed origin should be the exact frontend origin. The code normalizes a trailing slash, but use the values above. |
| `/api/auth/setup` returns HTTP 500                     | Inspect backend Vercel runtime logs. Verify `DATABASE_URL`, provider access and completed migrations. Do not assume the cause from the generic message; share only redacted error text.                                      |
| Setup status is `required: true, enabled: false`       | Configure `INITIAL_ADMIN_SETUP_TOKEN` on the backend, then redeploy.                                                                                                                                                         |
| Setup status is `required: false, enabled: false`      | An admin already exists. Sign in with that account; changing the setup key will not reopen registration.                                                                                                                     |
| Setup key is incorrect                                 | Enter the exact key saved on the backend for Production; redeploy after changing it. It is not the admin login password.                                                                                                     |
| Old error still appears after a successful deployment  | Close Lee tabs/installed app, reopen and accept its update; try Ctrl+Shift+R or a private window. Do not clear storage with unsynced sales.                                                                                  |
| `npm ci` fails with Windows `EPERM` for a `.node` file | Stop this project's dev/watch servers with Ctrl+C, then retry installation. Avoid stopping unrelated Node apps.                                                                                                              |
| `prisma` is not recognized                             | An interrupted install can remove the command. Repair with successful `npm ci`, then `npm run db:generate`; do not continue migration commands after install failure.                                                        |

Never include real credentials in this README. All credential examples are placeholders. Backups cover the server database, not unsynced browser queues. See the [readiness review](docs/deployment-readiness.md) for the earlier verification snapshot and remaining operational checks.

## Run locally

Use Node.js **24 LTS (24.11+)**, npm 11+, and Docker Desktop with Linux containers. From PowerShell:

```powershell
cd "D:\PROJECTS\POS system for shop\Lee\pos-system"
```

On a fresh checkout only, copy `.env.example` to `.env`. Preserve an existing configured `.env`.

```powershell
Copy-Item .env.example .env
```

Set your PostgreSQL password and matching connection URL:

```dotenv
POSTGRES_USER=lee
POSTGRES_PASSWORD=YOUR_OWN_PASSWORD
POSTGRES_DB=lee_pos
POSTGRES_PORT=5432
DATABASE_URL=postgresql://lee:YOUR_OWN_PASSWORD@localhost:5432/lee_pos?schema=public
```

URL-encode special password characters inside the URL. Then:

```powershell
npm.cmd ci
npm.cmd run db:up
npm.cmd run db:setup
npm.cmd run dev
```

`db:setup` creates missing local JWT/seed-password configuration, generates Prisma Client, applies migrations, and seeds accounts plus eight sample products. Existing environment values, accounts, and stock are preserved. It does not reset existing passwords. Stop an old dev terminal with Ctrl+C before restarting after an upgrade.

- App: <http://localhost:5173>
- Swagger: <http://localhost:3000/api/docs>
- API liveness: <http://localhost:3000/api/health>

Use `npm` instead of `npm.cmd` and `cp` instead of `Copy-Item` on Linux/macOS. Docker must remain running. Changing a PostgreSQL password in `.env` after the database volume was initialized does not change the existing database password.

| Account             | Initial password                        |
| ------------------- | --------------------------------------- |
| `admin@lee.local`   | `ADMIN_PASSWORD` in your local `.env`   |
| `cashier@lee.local` | `CASHIER_PASSWORD` in your local `.env` |

Initial passwords and the JWT secret are generated locally, never printed or committed. Passwords are bcrypt hashes in PostgreSQL. After the first seed, reset passwords through **Users**, rather than changing seed values. New cashier passwords require 12+ characters and at most 72 UTF-8 bytes. Administrator accounts cannot be disabled through this interface.

### Create the first admin inside the POS

For a new shop, you can create the administrator through the website instead of seeding accounts. Database tables must already exist: apply the committed migrations to the intended database once. Do not run the account seed if you are using this setup flow.

1. Add `INITIAL_ADMIN_SETUP_TOKEN` to the **backend** environment (Vercel project settings, or `deploy/.env` for Docker). Choose a private random value of 32–256 characters. It must not use a `VITE_` prefix. Generate one with a password manager or `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
2. Deploy the updated backend and frontend. Keep `DATABASE_URL`, `JWT_SECRET` and `BRANCH_ID` configured as usual.
3. Open the POS login screen and choose **Create your administrator account**, or open `/setup` directly. Enter your name, email, chosen password, confirmation and the private setup key.
4. Create the account, then choose **Continue to sign in** and use the email/password you chose. Create additional cashier accounts under **Users**.
5. Remove `INITIAL_ADMIN_SETUP_TOKEN` from the backend environment and redeploy after setup. The server also closes setup automatically as soon as any admin exists, including a disabled admin.

This is first-time registration, not password recovery or an extra-admin signup endpoint. Existing admins (including a previously seeded `admin@lee.local`) keep setup closed; sign in with that account instead. Never delete real accounts or shop data to reopen setup. The setup key is checked only by the API and is not stored in browser session storage, returned by the status endpoint or written to audit details. Passwords are validated, bcrypt-hashed and never returned. A PostgreSQL transaction/advisory lock prevents simultaneous setup requests from creating multiple initial admins across API instances. The account and its `user.create` audit record are committed together. No sample products or cashier accounts are created by website setup.

## Counter workflow

1. Sign in online at the start of a shift; the product catalog and receipt settings are cached in IndexedDB.
2. Scan `8901000000011` followed by Enter for a sample rice product, search the catalog, or select tiles. Edit quantity, remove lines, or clear the basket.
3. Choose **Take payment**. Enter cash received or **Use exact amount**; change is calculated automatically. For a card payment, first obtain approval on the certified external terminal and enter only its reference. No raw card numbers, CVV, or PIN are collected.
4. Confirm the sale. Its UUID, captured prices/date/payment, local receipt, and cached stock change are committed in one IndexedDB transaction **before** showing the receipt. The browser syncs immediately if online and retries later if not.
5. Print using the browser dialog, or enable automatic print-dialog opening in **Settings**. Choose the physical printer, matching 58/80 mm paper, and disable browser headers/footers. The printer layer is behind an interface; ESC/POS is not implemented.
6. The header shows online/offline state and unsynced count. Click it to inspect queued receipts and errors. **New sale** starts the next basket without waiting for the network.

Sample stock starts at 50 units per product and zero tax; these are development examples. Admins configure their actual product prices, tax rates, and opening stock. Prices exclude tax. Tax is integer basis points (`1800` = `18%`), rounded half-up per line before summing. There are no promotion or discount-entry screens.

### Manual bill items

Cashiers and admins can select **Manual item** beside the catalog refresh button to enter a name, unit price in LKR, and quantity for an unlisted product. The item is added to this bill only: it does not create a catalog product, deduct stock, or add tax to the entered price. Quantity controls and removal work like other basket lines. Manual items support mixed cash/card-terminal bills, offline reload and sync, receipt printing/reprints, sales history, daily reports, and full-sale voids. Voiding a mixed bill restores stock only for catalog items.

Manual lines use stable client UUIDs and are included in sale replay validation. The server validates names, quantities and integer-cent prices, keeps catalog price/tax checks unchanged, and records the entering user and manual lines under the `sale.manual` audit action. Apply migrations with `npm run db:migrate` when updating an existing installation.

### Stock counts and adjustments

Checkout cards and the Products table share the browser's live stock cache. Completing a payment immediately deducts the quantity locally; successful sync refreshes server stock without another deduction. Voids restore stock. While a signed-in app is visible and online, it refreshes stock every five seconds and when it regains focus or reconnects. Other online tills therefore see changes after the next refresh, rather than through a persistent push connection.

Admins can click a stock count in **Products** to enter the new quantity and an adjustment reason. Adjustments require a connection and no unresolved local queued sales. The API checks that stock still matches the quantity shown when the dialog opened, so a concurrent sale or edit produces a conflict instead of overwriting newer stock. Each change records its delta, reason, and user in stock movements and the audit log, within one transaction. Offline counts include this browser's unsynced sales; other devices' offline sales become visible only after they sync.

Unpaid baskets survive navigation/reload in the same tab and account. Older Phase 2 unconfirmed requests remain recoverable through their existing retry banner and original UUID.

## Offline and installation

Use a production build to install/test the PWA. Development watch mode has no service worker.

Keep the API running in one terminal. In another:

```powershell
npm.cmd run build
npm.cmd run preview -w @lee/web -- --port 4173
```

Open <http://localhost:4173>, sign in online, and install through the browser or the **Install app** button when offered. Wait for initial app-shell caching before testing an outage. The production gateway provides the same files over HTTPS; localhost is supported for development. This build caches only static application assets in the service worker, never API responses or login data.

JWTs and the current user are retained in **session storage** for this browser tab so an offline reload can restore the signed-in shift. Passwords are never stored. Sessions last eight hours. Closing the tab/app session or letting it expire can require a new online sign-in. Sign-out clears authentication but preserves unsynced sales; each sale uploads only while its original cashier is signed in at its original branch. Password resets revoke old server sessions; an offline device learns about revocation on reconnect.

Sales, catalog, and receipts are in IndexedDB via Dexie. Queue leases prevent concurrent tabs from uploading the same job unnecessarily; PostgreSQL UUID idempotency still prevents duplicates if requests overlap or a response is lost. Retry delays grow exponentially to five minutes. Sync runs automatically while the app is open and the shift is authenticated, including after reconnect/reload; this is not an OS-level background service when the app is closed.

**Do not clear browser data, uninstall the app, or discard its browser profile while sales are unsynced.** Each device's queue is local and is not part of server backups. The app requests persistent browser storage where supported.

The API checks captured prices/tax, product availability, and stock again. A sale rejected by those checks is retained as **Needs review** with the original UUID, request, and error. Resolve the underlying issue and retry as the original cashier. No automatic price substitution, queue deletion, or advanced conflict editor is provided. Cached stock is not a global reservation across offline counters. Captured sale dates must be within 30 days and no more than five minutes ahead of server time. Device clocks should be correct.

## History, reports, voids, accounts, settings

An abrupt reload during an upload can leave its local lease active for up to 30 seconds. The sale remains saved and retries automatically after that lease expires.

- **Sales history:** filter by Colombo business date/status; search a full receipt UUID, product, or cashier name; paginate and reprint. Admins see branch sales; cashiers see their own synced sales. Local unsynced receipts are under the header's sync status.
- **Reports:** daily completed transaction count, item count, subtotal, tax, cash/card applied payments, total, and excluded void count. Day boundaries are midnight in **Asia/Colombo**, independent of the server/browser time zone. Cash totals exclude change. Pending local sales appear on their original business date once synced.
- **Voids:** admins open a synced receipt, enter a reason, and confirm the physical cash return/external terminal reversal was handled. The server marks the entire sale voided, restores stock, and writes an audit record in one transaction. Concurrent/repeated voids restore stock once. This does not automatically refund a terminal payment. Voids affect the original sale's report date; the audit also records the actual void time. Partial refunds/returns are not implemented.
- **Audit log:** admin-only, paginated and filterable; shows actor, time, record, and before/after details for voids, product changes, account controls, and shop settings. Passwords/hashes are excluded.
- **Users:** admins add cashier accounts, enable/disable them, and reset passwords. Disabling/re-enabling and password resets invalidate old tokens. No admin-role promotion screen is included.
- **Settings:** shop name, address, phone, receipt footer, 58/80 mm paper, and automatic print dialog. Server receipts snapshot shop details at the sale so later changes do not rewrite old receipts. Offline receipts initially use cached settings; sync replaces the local receipt with the server-confirmed snapshot.
- **Developer & support:** Settings displays read-only developer contact information, with clickable email/call links and optional Facebook, HTTPS website, and support hours. Shop administrators and cashiers cannot modify these details: no editor or write API is exposed. Developer-maintained defaults live in `packages/shared/src/contracts.ts`; branch-specific overrides can only be maintained outside the shop interface by the deployment/database owner. Contact details are separate from shop settings and receipts. Apply migrations with `npm run db:migrate` when upgrading an existing installation.

## Project structure

```text
pos-system/
  apps/web/src/
    features/{auth,checkout,products,sales,reports,settings,users,audit}/
    offline/                 # Dexie catalog, queue, worker, status, PWA controls
    printing/                # Receipt components and browser driver interface
    components/
    lib/
    main.tsx
  apps/api/
    prisma/                  # Schema, migrations, seed
    scripts/                 # Local setup and isolated test runners
    src/{auth,users,products,sales,payments,inventory,reports,sync,audit,settings,common,health}/
    test/
  packages/shared/src/        # Contracts, integer money, stock and Colombo dates
  tests/                     # Production-PWA Playwright tests
  deploy/                    # Docker Compose, Nginx HTTPS, deployment guide
  docs/cashier-trial.md       # Physical hardware/live-shop verification
  Dockerfile
  docker-compose.yml          # Local PostgreSQL
  .github/workflows/ci.yml
```

Use `pos-system` as the Git repository root so GitHub discovers CI. `inventory/` contains transaction helpers, not post-MVP receiving/adjustment screens. New records include the branch ID, with no branch-management screens.

## Configuration

Both apps load root `.env` for local development. Never put secrets in `VITE_` variables; those are public browser configuration.

| Variable                                                             | Purpose                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Local Docker database creation                                                             |
| `DATABASE_URL`                                                       | API/Prisma PostgreSQL URL                                                                  |
| `JWT_SECRET`                                                         | Required random secret, 32+ characters; generated by `env:init`                            |
| `INITIAL_ADMIN_SETUP_TOKEN`                                          | Optional private 32–256 character key enabling first-admin website setup; remove after use |
| `BRANCH_ID`                                                          | UUID identifying this counter's branch                                                     |
| `ADMIN_PASSWORD`, `CASHIER_PASSWORD`                                 | Initial seed account passwords                                                             |
| `SEED_SAMPLE_PRODUCTS`                                               | Set `false` to seed accounts without sample products                                       |
| `API_PORT`                                                           | API port, default 3000                                                                     |
| `API_HOST`                                                           | Default `127.0.0.1`; deployment sets `0.0.0.0` inside its private container                |
| `TRUST_PROXY`                                                        | Default `0`; use `1` only behind the supplied single trusted reverse proxy                 |
| `WEB_ORIGIN`                                                         | CORS origin; HTTPS required in production                                                  |
| `VITE_API_BASE_URL`                                                  | Public browser API base, default `/api`                                                    |
| `VITE_API_PROXY_TARGET`                                              | Development/preview proxy upstream, default `http://127.0.0.1:3000`                        |
| `TEST_DATABASE_URL`                                                  | Optional separate test DB, name ending `_test`                                             |

## Tests

```powershell
npm.cmd run db:generate
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:api
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Unit tests exercise integer pricing, tax/discount rounding, cash change, stock limits, Colombo day boundaries, durable queue transactions, retry behavior, and cashier isolation. API tests use real PostgreSQL for authentication/roles, first-admin setup and concurrent registration protection, invalid and expired tokens, products, transactional stock, concurrent/replayed sales/voids, reports, user/session management, settings snapshots, and offline sync. Eight production-browser tests exercise first-admin website setup and closure, cashier checkout, manual items, product administration, live stock across tills, lost responses, service-worker-controlled offline reload/reconnect, printing, user/settings administration, history, voids, reports, and audit viewing.

Tests derive a separate database ending `_test`, normally `lee_pos_test`; the configured user needs permission to create it. A configured `TEST_DATABASE_URL` must refer to a test database on the same PostgreSQL server. Fixtures use unique users/products/branch IDs and only those fixtures are removed. Browser tests use API port 3100 and production-preview port 5174. They do not kill your normal dev server or clear shop data.

GitHub Actions provisions PostgreSQL and Chromium and runs these checks plus production builds. Actual printer/scanner/card-terminal behavior and live HTTPS hosting still require the [cashier trial](docs/cashier-trial.md).

## Deployment and scope

See [Vercel configuration and admin setup](#vercel-configuration-and-admin-setup) for the hosted frontend/backend and managed database. The optional [Docker/VPS deployment guide](deploy/README.md) describes migration, API and Nginx gateway images, keeps PostgreSQL/API ports private, and starts the API after migrations. VPS hosting, domain registration and HTTPS certificates are not provisioned by the repository.

API responses carry `Cache-Control: no-store` even without the gateway. Swagger is available in development/test and disabled in production. The runtime API container receives only its required configuration; initial account passwords are supplied only to the migration/seed service. See [deployment readiness review](docs/deployment-readiness.md) for verification results and remaining live-server checks.

Inventory receiving screens, low-stock alerts, promotions/loyalty, partial returns/refunds, multi-branch screens, ESC/POS, and monitoring/backup automation remain outside this work. Manual backup instructions and the hardware trial checklist are provided for deployment preparation.
