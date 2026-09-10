# Inbox WhatsApp photo media (owner dashboard)

## Symptom
Customer photo bubbles show **Photo (not stored for viewing yet)** + Open WhatsApp instead of an `<img>`.

## UI behaviour (correct)
- `lib/conversations/message-media.ts` → `classifyMessageMedia`
  - `media_url` (or resolvable storage path) present → `kind: 'image'` → `<img>` in `ConversationsInbox`
  - `[Photo]` / image-like type / media id without URL → `kind: 'missing_image'` → honest fallback
- `app/conversations/page.tsx` loads `messages` with `select('*')` (includes `media_url` when set)

## Live evidence (2026-09-10, Europe/London)
Broken thread `job_id=50e14bae-2d29-486f-a149-17b464106add`:

| message id | created_at (UTC) | message_text | media_url | message_type |
|---|---|---|---|---|
| ffc2dc33-f6ef-48f3-ac6e-332cb88a06cb | 2026-09-06T02:35:06Z | `[Photo]` | null | null |
| 1b9a932b-bfbd-4324-a660-4d6a0f6e767f | 2026-09-10T17:32:30Z (~18:32 London) | `[Photo]` | null | null |

- All `[Photo]` rows in DB: **media_url null** (0 rows with media_url set)
- Storage bucket `job-media` exists and is **public**, but was **empty** at investigation time
- No `job_media` / attachments table in PostgREST schema

## Root cause
**B — persistence gap (not a render bug).**

WF-01 nodes **Store Inbound Message** / **Store Inbound (Paused)** insert only:
`job_id`, `customer_id`, `channel`, `direction`, `sender`, `message_text`, `provider_message_id`.

They do **not** set `media_url` or `message_type`. Image bytes are downloaded for OpenAI Vision only and are not uploaded to `job-media`.

## Dashboard fix posture
- Frontend keeps honest fallback when nothing is stored
- When a URL/path **is** stored on the message (or `storage_path`), `resolveStoredMediaUrl` maps relative `job-media/...` paths to the public object URL so newest photos display in-app
- Backend/WF change (out of this repo’s frozen automation): after media download, upload to `job-media/{job_id}/...` and PATCH/INSERT `messages.media_url` (+ ideally `message_type`)

## Do not
- Flip automation switches from the dashboard
- Deploy Production / `vercel --prod` for this fix
