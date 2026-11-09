# Standalone HTTPS staging deployment

This runs the independent Deadline Crush app on a server. It does not merge into the existing Hack4Hack website or move local MongoDB/MinIO data. Do not use this single-server setup as a production launch without backups, access review, monitoring, provider credentials, and staging verification.

## Prerequisites

- A Linux server with Docker Engine and the Compose plugin, ports 80 and 443 open.
- Two DNS A/AAAA records pointing to the server: one for the app and one for private-object upload traffic. Caddy obtains HTTPS certificates for both hosts.
- An SMTP provider and verified sender if reminder email must work outside local Mailpit.

Copy `deploy/env.staging.example` to `.env.staging` in the project root. Set `APP_DOMAIN` and `STORAGE_DOMAIN` to the DNS names only, without `https://`; replace every placeholder and use unique private credentials. Never copy the local `.env` to the server. Keep `.env.staging` out of source control and restrict its filesystem permissions.

From the project root on the server:

```sh
docker compose --env-file .env.staging -f deploy/compose.staging.yaml up -d --build
docker compose --env-file .env.staging -f deploy/compose.staging.yaml ps
docker compose --env-file .env.staging -f deploy/compose.staging.yaml run --rm api npm run seed -w server
```

Seeding creates fictional accounts and a fictional event in the staging database. Avoid seeding a real Hack4Hack database. The first seed fixes the demo passwords until explicitly reset. Check `https://APP_DOMAIN/api/health`, then open `https://APP_DOMAIN/hackathons` and use the staging demo journey. The object store console is not exposed by this configuration.

The web container serves the Vite build and proxies `/api` to Express on the same HTTPS origin. A second hostname proxies browser multipart uploads to MinIO. The API and worker use internal container addresses for MongoDB, Redis and MinIO; only Caddy publishes ports. The MongoDB replica set is initialized by `mongo-init`. Keep all five persistent Docker volumes and back them up before any migration.

## Staging gate

1. Check API health, sign-in, event list, organiser access and participant denial.
2. Upload a valid ZIP from the browser, finalise, see a receipt, wait for Accepted, and download the original.
3. Run an interrupted multipart upload and resume it. Inspect the organiser job state and CSV.
4. Create a separate event with a near deadline and verify reminder email reaches the selected SMTP provider; inspect its accepted state and actual mailbox delivery separately.
5. Check mobile widths, Light/Dark/System, cookie security, API logs, worker restart, storage persistence and backups.

Production Hack4Hack integration additionally requires mapping real host user/session IDs, event and registration data, permissions, routes, and theme shell. See `docs/integration.md`. This standalone staging configuration cannot be published at the existing Hack4Hack domain without that integration.
