# Lee POS deployment readiness review

Reviewed on 24 November 2026 (Asia/Colombo).

## Decision

Application checks pass. **Do not start live shop transactions yet:** the production environment is incomplete, and the real server, backup recovery, and physical counter equipment still need verification. No public deployment was performed.

## Automated verification

| Check                                                                                                        | Result                           |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Formatting, ESLint, TypeScript                                                                               | Passed                           |
| Unit tests                                                                                                   | 27 passed                        |
| PostgreSQL API integration tests                                                                             | 26 passed                        |
| Production-build Chromium/PWA tests                                                                          | 7 passed                         |
| Total automated tests                                                                                        | 60 passed                        |
| Production frontend/backend builds                                                                           | Passed                           |
| npm dependency audit (including development dependencies)                                                    | 0 known vulnerabilities          |
| Browser build compared against configured local secrets                                                      | No matches                       |
| Compose template using temporary valid test configuration                                                    | Passed                           |
| Production Docker API, gateway and migration image builds                                                    | Passed                           |
| Local HTTPS gateway, API proxy, HTTP redirect, security headers, PWA assets and disabled production Swagger  | Passed                           |
| Empty temporary database: all five migrations, account seed without sample stock, repeated seed preservation | Passed                           |
| Pruned production API against that database: login, empty catalog, manual checkout and void                  | Passed                           |
| Actual `deploy/.env` validation                                                                              | Failed: incomplete configuration |

The tests cover cash and external-terminal payment recording, integer-cent totals and tax, barcode entry, manual bill items, products/categories, stock adjustments and two-till refresh, concurrent sales and voids, duplicate request recovery, receipts/reprints, reports and Colombo dates, account administration, session revocation, shop settings, read-only developer contacts, and audit history. Offline tests exercise service-worker reload, durable local receipts, cashier ownership, retry after lost responses, and automatic reconnection/sync.

The fresh-install check used a uniquely named temporary local database and removed it afterward. It confirmed five migrations, two seed accounts, zero sample products, and zero stock rows. The local HTTPS smoke check used a temporary untrusted certificate and removed its test containers afterward. Neither check published a site or changed shop records.

Security checks include anonymous access rejection, cashier administration restrictions, forged/expired/wrong-audience/unsigned JWT rejection, input validation and unexpected-field rejection, password hash exclusion, revocation after password/account changes, login rate limiting, untrusted browser origins, and sale ownership/branch protection. Malformed nested sale input returns a client error and does not save a sale.

## Corrections made during review

- API responses now send `Cache-Control: no-store` directly, including when the backend is hosted without the supplied Nginx gateway.
- Swagger documentation and its JSON endpoint are disabled when `NODE_ENV=production`; local development documentation remains available.
- The production API container no longer receives the full seed environment or initial account passwords. Its required database/JWT/branch/origin configuration is explicit. The migration/seed service retains the initialization configuration it needs.
- CI now runs `npm audit --audit-level=high` so known high/critical dependency advisories fail verification.
- Added regression checks for invalid tokens, cashier privilege restrictions, response caching, untrusted browser origins, and malformed nested sale input. Updated stale test counts and inventory scope documentation.

## Required before deployment

1. Complete `deploy/.env` privately. The reviewed file has a placeholder domain and blank `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, and `CASHIER_PASSWORD`. Choose the intended branch UUID. `SEED_SAMPLE_PRODUCTS=false` is already set. Use a strong unique database password, a matching URL with hostname `postgres`, a random JWT secret of at least 32 characters, and unique initial account passwords of at least 12 characters and at most 72 UTF-8 bytes. Do not copy the shorter local development database password into production.
2. Run the documented Compose configuration validation after entering those values. Apply all committed migrations and seed accounts on the intended production database. Seeding preserves existing passwords and stock; editing seed values does not change existing account passwords.
3. Configure the actual domain, trusted HTTPS certificate and renewal, firewall, and persistent PostgreSQL storage. Check HTTP redirection, login, asset loading, and one offline/reconnect sale through the real HTTPS origin. Confirm the database/API ports remain private.
4. Create off-server database backups and verify a restore into a separate database. Set up operational monitoring and certificate/disk/backup alerts. Server backups do not contain each till's unsynced browser queue.
5. Complete the [cashier and hardware trial](cashier-trial.md) with the actual printer, scanner, card terminal, and target computer/tablet/mobile browsers. Browser print invocation is tested; physical output and silent-print browser/device configuration are not certified by these tests.

The supplied deployment files target a **Docker server/VPS**. For a Vercel frontend, the NestJS API and PostgreSQL still need their own suitable hosting and persistent database configuration. The current Docker gateway CSP assumes a same-origin API. Cross-origin hosting requires the intended public API URL and correct backend CORS origin, and equivalent frontend HTTPS/security headers configured at that host. No Vercel production configuration was verified in this review.

## Operational limitations and remaining observations

- The status badge uses the browser network signal; it does not establish that the API/database is reachable. `/api/health` is liveness only and does not check PostgreSQL. Observe sync errors and verify database connectivity separately in monitoring.
- Other online tills refresh stock every five seconds; offline stock is local cached stock, not a global reservation. Conflicting offline sales are retained as Needs review. Sync runs while the authenticated app is open; it is not a background OS service after the app closes.
- Sessions expire after eight hours and fresh sign-in requires connectivity. Offline devices learn about account revocation after reconnecting. Keep original cashier accounts available until their queued sales sync.
- External card payments and reversals happen on the terminal. Lee records references and does not charge/refund cards. Partial returns, automatic terminal refunds, promotions, receiving, and multi-branch management are outside the implemented scope.
- Login and general rate limits use in-memory, per-IP counters. Verify limits under the expected number of tills sharing a public IP. Multiple API replicas would require a coordinated rate-limit design; the supplied deployment uses one API instance.
- The production build emits a non-failing JavaScript chunk-size warning (about 643 kB before gzip), third-party annotation warnings, and PostgreSQL driver deprecation warnings during tests. They did not cause test failures. Consider route splitting for slower devices and review the driver warning before upgrading to pg 9.
- The dependency audit checks npm advisories; it is not a penetration test or an operating-system/container vulnerability scan. Load/stress testing, real-host certificate/security configuration, physical hardware behavior, Safari/Firefox/mobile-specific behavior, and disaster recovery were not established by the automated application suite.

Follow [the deployment guide](../deploy/README.md) after resolving the production configuration and completing these live checks.
