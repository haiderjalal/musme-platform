# API

All route handlers return the standard envelope:

```json
{ "success": true, "message": "Joining.", "data": { } }
{ "success": false, "message": "Live video is not connected yet." }
```

Field-level problems are returned as `fieldErrors` (a map from field name to message) on server actions. Responses that depend on a user are sent with `cache-control: no-store`.

## Route handlers

### `GET /api/health`

Liveness check for uptime monitors. Returns `{ "status": "ok", "time": "<ISO timestamp>" }`. It exposes no configuration and reads no data.

### `POST /api/classes/{bookingId}/token`

Issues a short-lived join token for a class. Checks, in order:

| Step                                                                  | Failure response                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| `bookingId` is a UUID                                                 | `404` Lesson not found                                 |
| Caller is signed in                                                   | `401` Sign in to join this lesson                      |
| Booking exists and the caller is a party to it (RLS)                  | `404` Lesson not found                                 |
| Booking is `confirmed` or `in_progress`                               | `409` This lesson is not confirmed yet                 |
| Now is within the join window (10 minutes before to 15 minutes after) | `403` The classroom opens 10 minutes before the lesson |
| Video provider is configured                                          | `503` Live video is not connected yet                  |

Success: `200` with `data.token`. The token is scoped to the room `musme-{bookingId}` and expires after 10 minutes. The room name is never supplied by the caller.

### `GET /api/cron/expire-holds`

Releases pending holds whose `hold_expires_at` has passed. Scheduled every 5 minutes by Vercel Cron (`vercel.json`).

- Requires `Authorization: Bearer <CRON_SECRET>`. The comparison is constant-time. Without a valid secret the route returns `404`, so it does not reveal that it exists.
- Response: `{ "success": true, "data": { "released": <count> } }`.
- Safe to repeat: only `pending_payment` rows are updated.

## Server actions

Server actions are called from forms or from client components. They check the session themselves. Form actions redirect with a `notice` query parameter rather than returning data.

| Action                         | Module                        | Input                                                           | Result                                                                              |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `requestMagicLinkAction`       | `features/auth/actions.ts`    | `{ email, next? }`                                              | Envelope. Sends a sign-in link.                                                     |
| `signOutAction`                | `features/auth/actions.ts`    | none                                                            | Signs out, redirects to `/`                                                         |
| `requestLessonFormAction`      | `features/booking/actions.ts` | form: `teacherSlug`, `offeringId`, `startsAt`, `idempotencyKey` | Redirects to `/learn/bookings?held=<id>`, or back to the teacher page with `notice` |
| `saveTeacherApplicationAction` | `features/teach/actions.ts`   | `TeacherApplicationInput`                                       | Envelope with `fieldErrors`                                                         |
| `submitTeacherForReviewAction` | `features/teach/actions.ts`   | form (none)                                                     | Redirects to `/teach?notice=sent` or `review-failed`                                |
| `reviewTeacherFormAction`      | `features/admin/actions.ts`   | form: `teacherId`, `decision` (`approve`/`reject`), `reason`    | Redirects to `/admin?notice=...`                                                    |
| `openConversationFormAction`   | `features/chat/actions.ts`    | form: `teacherId`                                               | Redirects to the conversation, or `book-first` when no booking exists               |
| `sendMessageFormAction`        | `features/chat/actions.ts`    | form: `conversationId`, `body` (max 2,000)                      | Redirects to the conversation                                                       |

## Notice codes

Pages map these codes to plain-language messages. Unknown codes are ignored.

- Teacher page: `slot-unavailable`, `lesson-unavailable`, `own-lesson`, `hold-failed`
- Admin: `reviewed`, `review-failed`, `review-invalid`
- Teach: `sent`, `review-failed`
- Messages: `book-first`, `failed`, `invalid`, `not-allowed`, `send-failed`, `message-invalid`
