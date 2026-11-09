# API reference

All paths below are mounted under /api. JSON mutations require Content-Type application/json and an Origin matching APP_URL. Local sessions use an HttpOnly cookie. Error responses contain an error string.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /health | Database readiness |
| GET | /me | Current local identity |
| POST | /auth/register | Participant account with name, email and password |
| POST | /auth/login | Establish a session |
| POST | /auth/logout | Invalidate the session |
| GET | /events | Search, filters, sort, event counts and bookmarks |
| GET | /events/:slug | Event, viewer registration, count and server time |
| PUT or DELETE | /events/:slug/save | Idempotent bookmark |
| POST | /events/:slug/register | Idempotent registration |
| GET | /programs | Current user's event and team records |
| POST | /events/:slug/teams | Create team with name |
| POST | /events/:slug/join | Join using invitation code |
| GET | /teams/:teamId | Authorised workspace snapshot |
| POST | /teams/:teamId/invite | Renew code and optionally notify an existing account by email |
| DELETE | /teams/:teamId/members/:userId | Leave team or leader removal |
| PUT | /teams/:teamId/project | Save project draft |
| POST | /teams/:teamId/uploads | Initiate with filename, size and SHA-256 hash |
| GET | /uploads/:uploadId | Current upload and stored parts |
| POST | /uploads/:uploadId/sign | Sign part number |
| POST | /uploads/:uploadId/complete | Complete and verify object size |
| POST | /uploads/:uploadId/finalise | Issue receipt using UUID key |
| GET | /submissions/:submissionId/download | Short-lived attachment URL |
| GET | /teams/:teamId/stream | Authorised workspace SSE updates |
| GET | /notifications | User notification list |
| PUT | /notifications/:id/read | Mark owned notification read |
| GET or POST | /organiser/events | List owned events or create event |
| PUT | /organiser/events/:eventId | Update owned event |
| GET | /organiser/events/:eventId/dashboard | Stored metrics and operational records |
| GET | /organiser/events/:eventId/export | Authorised CSV |
| POST | /organiser/jobs/:jobId/retry | Reset a failed or uncertain owned-event job |

The directory accepts q, status, mode, fee, participation, format, theme and sort. Multi-value mode, fee, format and theme inputs can be comma-separated. Sort values are deadline, prize, registered and newest. Omission uses featured order.

Project fields are title, shortDescription, description, stack, github, demo and extra. The extra object stores configured field names as keys. Upload initiation snapshots the draft.

Validation errors return 400, anonymous access 401, permission failures 403, missing records 404, state conflicts 409 and rate limits 429. Infrastructure errors return a safe 500 message and a server log.
