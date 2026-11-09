# Authorised production integration

The uploaded repository is the independently authored reference frontend. This package expands it into a development implementation. Production Hack4Hack source, schemas, authentication, deployment and provider accounts remain external dependencies.

## Integration order

1. Map the host event IDs, user IDs, registration records, organiser permissions, routes and theme preference.
2. Replace local identity resolution in server/src/auth.ts with the host session resolver. Preserve the user identity consumed by the permission checks. Enable local account routes only in development.
3. Map Event and Registration collections in server/src/models.ts to the host models. Migrate references with stable IDs and unique indexes. Inspect existing data for duplicates before enabling new constraints.
4. Mount the feature routes under an approved API prefix. Follow the host's CSRF, error and rate-limit conventions. Replace the fixed-origin development check with the existing approved mechanism.
5. Merge the directory/detail changes into host components. Mount participant workspace and organiser pages in the host router and shell. Reuse its fonts, icons, theme tokens and global Light/Dark/System preference.
6. Configure private storage, queue and SMTP adapters. Copy approved application origins into bucket CORS. Keep private files separate from public event media.
7. Deploy to staging, test existing accounts and routes, run recovery and load checks, and review the rollout.

## Deployment

Build with npm run build. Serve client/dist using a static server with SPA fallback. Proxy /api to the Express service. Keep /api event streams unbuffered and allow long connections. The API uses a same-origin browser contract. Set APP_URL to the externally visible HTTPS origin.

Run node server/dist/index.js for the API and node server/dist/worker.js as a separately supervised worker. The supplied server Dockerfile builds either process. Its build context is the project root. Use a managed MongoDB replica set, persistent Redis with noeviction and private S3-compatible storage. Redis TLS requires adapting the connection options to the selected deployment.

Set NODE_ENV=production and explicit environment values. Production APP_URL must use HTTPS, so session cookies are secure. Configure SMTP_HOST, SMTP_PORT, SMTP_SECURE and optional SMTP_USER/SMTP_PASSWORD for the selected provider. Verify that provider's limits and delivery handling before launch. Mailpit is the local inbox.

Use a dedicated service account for each backend dependency. Rotate the local demonstration credentials when configuring deployed services. Keep the local Compose ports bound to loopback.

## Regression gate

Verify host sign-in and return navigation, event listing, registration and existing URLs. Check team membership permission changes, cross-team access, cookie expiry, link validation, concurrent finalisation and worker interruption. Check mobile widths and both themes in a browser. Review object storage CORS, streaming proxy settings and worker memory limits.

Production integrations should be reviewed against the actual repository and its deployment configuration. The public reference provides visual evidence and candidate integration locations.
