# Deadline Crush

A full-stack hackathon development application extending the supplied Hack4Hack reference. Dishaa Mehra is the project owner in the supplied internship scenario.

The project contains public event discovery, six-tab event details, local accounts, event registration, team workspaces, resumable S3 multipart uploads, immutable submission versions, receipts, server deadline rules, BullMQ workers, reminders, notifications and organiser tools.

## Run locally

Use Node.js 22.15 or newer and Docker Desktop with Compose. Run commands from this directory.

1. Copy `.env.example` to `.env`. Set `DEMO_PASSWORD` to a password of at least ten characters.
2. Start the supporting services and wait for MongoDB replica-set initialisation.
3. Install dependencies and seed the demonstration.
4. Start the application.

```sh
docker compose up -d
npm ci
npm run seed
npm run dev
```

If Compose cannot pull an image, stop before running the seed. Check `docker compose ps` and fix the pull first; an empty services list means MongoDB is not running. The local MinIO image uses a community mirror of the pinned release because the original Docker Hub repository is unavailable. You can substitute an S3-compatible service you trust by changing the `minio.image` entry in `compose.yaml`.

The Compose MinIO service configures CORS through `MINIO_API_CORS_ALLOW_ORIGIN`; its community edition does not implement the S3 bucket CORS API. For an object store that supports per-bucket CORS, set `S3_CONFIGURE_BUCKET_CORS=true` in `.env` before seeding. Existing `.env` files can omit this variable for local MinIO.

If the first seed attempt reports that the replica set is electing a primary, wait a few seconds and run the seed again.

| Service | Address |
| --- | --- |
| Web application | http://localhost:5173 |
| API health | http://localhost:4000/api/health |
| Local email inbox | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

To check the local SMTP connection immediately, run `npm run test:email` and open Mailpit at http://localhost:8025. This sends one smoke-test message to the local inbox; it does not run the deadline reminder scheduler or deliver to the internet.

Local accounts use the password you set in `.env`.

Seeding preserves existing demo passwords. If you change `.env` later, run `npm run reset-demo-password` from the project folder to update only the seeded organiser account and end its existing sessions. Use a new private password if an earlier value was exposed.

| Email | Role and team |
| --- | --- |
| dishaa@example.test | Participant in Lime Builders |
| aarav@example.test | Participant in Lime Builders |
| maya@example.test | Participant in Night Shift |
| kabir@example.test | Participant in Night Shift |
| organiser@example.test | Owner of the demo event |

Seeding creates one fictional event with two teams and project drafts. Dates are relative to the first seed execution. It preserves records when rerun. Submission history starts with the versions you actually submit. Re-run with a new isolated database to create a fresh demonstration.

On Windows, use `Copy-Item .env.example .env` in PowerShell. All application commands work through npm. Docker Desktop must be running.

## Demonstrate the workflow

Sign in as Dishaa, open My Programs, and enter Lime Builders. Save the project fields. Select `scripts/fixtures/project.zip`, start the upload, and finalise it to receive a receipt. Keep the worker running to see validation updates. The GitHub and demo URLs in the seed are public example destinations and can be edited to your own working project.

For recovery, interrupt the connection during a larger upload, refresh, select the exact original file, and choose Resume missing parts. Previously stored parts are recovered from object storage. A completed transfer still needs finalisation to get a receipt.

Sign in as the organiser in a separate browser profile to inspect actual counts, teams, versions, worker jobs, errors and CSV export. Set the fictional event deadline within two hours to exercise reminders before any upload begins. Deadline policy becomes locked after the first upload session to preserve its meaning.

## Commands

```sh
npm run dev -w server
npm run dev -w client
npm run worker -w server
npm run typecheck
npm test
npm run build
```

The combined `npm run dev` starts API, web and worker processes. MongoDB transactions require a replica set, which Compose configures.

## Project layout

| Path | Responsibility |
| --- | --- |
| client/src/main.tsx | Public pages, accounts, workspace, organiser and notifications |
| client/src/UploadPanel.tsx | Checksum, multipart upload, retry, resume and finalisation |
| client/src/base.css | Adapted Hack4Hack reference styling |
| client/src/app.css | Workspace and organiser layouts |
| server/src/app.ts | Validated API, permissions and transactional mutations |
| server/src/models.ts | MongoDB collections and indexes |
| server/src/auth.ts | Local session adapter |
| server/src/storage.ts | S3 multipart adapter |
| server/src/validation.ts | ZIP, checksum and public-link validation |
| server/src/jobs.ts | Validation effects, reminder scheduling and email sending |
| server/src/worker.ts | BullMQ worker and durable-job reconciliation |
| server/tests | Domain, API and worker-service verification |
| scripts | Recovery test, load setup, k6 script and test archive |
| docs | Architecture, API, integration, delivery status and test evidence |

## Current delivery status

See `docs/verification.md` for checks executed in the build environment and external checks still required. The production Hack4Hack repository and credentials were unavailable. This package runs as a development application and provides named integration boundaries in `docs/integration.md`.

The included frontend uses the supplied layout, colour system and components as its basis. Extra host routes and authentication should be connected during authorised integration. README previews are supported for ZIP submissions. PDF rendering, advanced event editing and full production performance certification remain follow-up work.

## Stop services

`docker compose down` stops containers while retaining volumes. Keep volumes when you want to preserve demonstration records.
