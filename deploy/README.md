# Production deployment preparation

This guide covers the optional Docker/VPS deployment. For the Vercel frontend/backend and Neon database installation, follow [Vercel configuration and admin setup in the main README](../README.md#vercel-configuration-and-admin-setup), including the exact URL settings, migrations, website admin registration and troubleshooting. Vercel uses dashboard environment variables; it does not load your local `deploy/.env` file.

For this Docker setup, use an owned server/domain and a valid HTTPS certificate before starting the gateway.

## What runs

- Nginx serves the React PWA over HTTPS and proxies `/api/` to NestJS.
- NestJS and PostgreSQL have no published host ports; only Nginx exposes 80/443.
- A one-off migration service applies committed Prisma migrations before the API starts.
- PostgreSQL uses a persistent named volume. No Redis is required.
- The API trusts exactly one proxy hop; Nginx replaces forwarded client-address headers.
- HTML, the service worker, and the manifest are revalidated. Hashed assets are immutable. API responses are not cached.
- Swagger documentation is disabled in production. Seed account passwords are not passed to the runtime API container.

## Server prerequisites

Use a Linux VPS with Docker Engine and Docker Compose v2, enough disk for PostgreSQL and build images, DNS pointing the chosen hostname at the server, and ports 80/443 available. Obtain a valid certificate whose files are at `/etc/letsencrypt/live/YOUR_HOSTNAME/fullchain.pem` and `privkey.pem`. The included gateway mounts that directory read-only. Certificate issuance/renewal must be configured on the server; no certificate or hosting account is provisioned by this repository.

The Git repository root must be `pos-system`. Copy the source to the server, then work from that root.

## Optional local container verification

With local PostgreSQL running and root `.env` configured, build the two runtime images and run the local smoke check:

```sh
docker build --target api -t lee-pos-api:local .
docker build --target gateway -t lee-pos-gateway:local .
node deploy/smoke-test.cjs
```

The check uses the local `lee-pos_default` network, creates temporary localhost-only containers and an untrusted one-day test certificate, checks HTTPS/static assets/API proxying/security headers/redirects, then removes its own containers and temporary certificate. It makes no sale or database changes and does not publish a site. OpenSSL is needed; on Windows it detects Git's bundled executable. Production still needs a publicly trusted certificate and the live-server checks below.

## Configure the server environment

```sh
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` privately. Set:

- `DOMAIN` to a hostname only, such as `shop.example.com` (no `https://`).
- A unique `POSTGRES_PASSWORD`, and `DATABASE_URL` using the same credentials and the Docker hostname `postgres`, e.g. `postgresql://lee:URL_ENCODED_PASSWORD@postgres:5432/lee_pos?schema=public`.
- A random `JWT_SECRET` of at least 32 characters.
- The intended branch UUID. Keep the same branch ID when migrating an existing shop database.
- Initial admin/cashier passwords (12+ characters and at most 72 UTF-8 bytes).
- `SEED_SAMPLE_PRODUCTS=false` for a real shop. This seeds only accounts and does not insert fake stock.

Do not commit `.env` or certificates. Docker's build context excludes environment files, dependency folders, and generated output. No real credentials are baked into images.

## Build, initialize, start

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml build
docker compose --env-file deploy/.env -f deploy/compose.yml up -d postgres
docker compose --env-file deploy/.env -f deploy/compose.yml run --rm migrate
docker compose --env-file deploy/.env -f deploy/compose.yml run --rm migrate npm run db:seed
docker compose --env-file deploy/.env -f deploy/compose.yml up -d
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```

Open `https://YOUR_HOSTNAME`, sign in using the seed accounts, and configure shop settings and real products/opening stock. Seeding preserves existing accounts and stock; changing seed passwords does not reset existing database accounts. Use the Users page to reset passwords after initialization.

Alternatively, to create the first admin in the POS website, skip the `npm run db:seed` command above. Set the optional private `INITIAL_ADMIN_SETUP_TOKEN` (32–256 random characters) in `deploy/.env` before starting the API. After migrations and startup, open `/setup`, enter the key and your chosen name/email/password, then sign in. Remove the setup token and recreate the API after registration. This flow is available only when no admin account exists. See [first-admin setup](../README.md#create-the-first-admin-inside-the-pos). For Vercel, set the token on the backend project in its dashboard instead of this Docker environment file.

Run [the cashier trial](../docs/cashier-trial.md) before using real transactions. Check that HTTP redirects to HTTPS, the certificate is trusted, `/api/health` responds, the app installs, and an offline sale syncs exactly once. Only HTTPS or a local-loopback development origin can register a service worker.

## Updates and recovery

Before an update, finish baskets, sync every counter's pending queue, and take a database backup. Review new migration SQL before applying it. Build and start with the same Compose commands; the migration dependency runs before the new API starts. Existing counters show a PWA update prompt and will not reload through that prompt while a basket or local unsynced sales remain.

For a manual backup on the Linux server, run a command with your configured PostgreSQL username/database:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T postgres pg_dump -U lee -d lee_pos -Fc > lee-pos-backup.dump
```

Store backups outside the server and confirm restoration into a separate test database before relying on them. Automated backups/monitoring remain outside the requested MVP. Do not delete the database volume as a troubleshooting step. Browser queues are local to each counter and are not included in a server database backup.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail 100 api gateway migrate
```

Review logs locally; do not paste passwords, tokens, or environment-file contents into tickets or chat.
