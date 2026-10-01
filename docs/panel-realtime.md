# Panel Training realtime activation

Implementation prepared; activation requires server credentials and HTTPS hosting.
Until VITE_PANEL_REALTIME_ENABLED=true is configured, the existing on-open/manual
sync remains active. There are no browser polling timers.

## Activate

Existing Vercel project: `pejabat-ara`, domain `araoffice.hsohealthcare.com`.
Use `https://araoffice.hsohealthcare.com/api/panel-webhook` as the callback.
`vercel.json` schedules a daily GET to `/api/panel-watch`. Configure CRON_SECRET
in Vercel Production; Vercel sends it as a Bearer header automatically. The GET
handler accepts only this secret. Manual POST registration uses PANEL_WATCH_SECRET.
The schedule activates on production deployment. Ensure these API routes are
reachable and not behind deployment protection for Google callbacks.

1. Apply `supabase/migrations/202610010002_panel_realtime.sql` to the project's
   existing database. It adds a staff-readable guide catalogue, a service-only
   channel registry, and publishes guide INSERTs to Supabase Realtime.
2. Enable Google Drive API for a dedicated service account. Share only the Panel
   Training folder with that account as Viewer. The code uses metadata-readonly
   access. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY securely
   on the backend. Do not place credentials in browser environment variables.
3. Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, a random PANEL_WATCH_SECRET,
   and PANEL_WEBHOOK_URL on the backend. The callback must be publicly reachable
   HTTPS at `/api/panel-webhook`; localhost is not a Google callback destination.
4. Deploy the API handlers and call POST `/api/panel-watch` with Authorization:
   Bearer <PANEL_WATCH_SECRET>. A successful response returns the file count and
   channel expiry. Do not expose this secret to staff or the browser.
5. Schedule that protected POST once daily. This checks the stored subscription
   expiry and only registers a replacement when fewer than two days remain.
   Google changes channels expire after at most seven days; this code requests
   six. Renewal includes one catch-up listing to recover missed notifications.
   It is subscription maintenance, not periodic file polling.
6. Verify a real new PDF placed in the folder results in an INSERT, then enable
   VITE_PANEL_REALTIME_ENABLED=true and rebuild the frontend. Test with a real
   active Supabase staff session, not a local demo login.

## Behaviour and limits

- A Drive change notification triggers a PDF metadata listing of this folder.
  Changes channels cover everything visible to the service account, hence use a
  dedicated account to avoid unrelated notifications and extra Drive reads.
- Primary-key conflict handling prevents repeated callbacks creating duplicate
  catalogue entries/alerts. Existing records and local admin edits are retained.
- Realtime delivers INSERT events to authenticated active staff. The browser
  fetches metadata on connection, reconnect and an INSERT; no interval runs.
  WebSocket heartbeats and event traffic still consume some bandwidth.
- Alert dismissal remains per account on the current browser. It does not delete
  a guide, affect another account or synchronise dismissal across devices.
- Only new PDFs directly in the folder are imported; nested folders, renames,
  removals and non-PDF files are outside this implementation.
- Google push delivery is best-effort. Renewal performs catch-up, and Check now
  reloads the stored catalogue. Monitor webhook errors and watch expiry in hosting
  logs. Re-run protected watch registration after correcting configuration errors.
- Keep the existing on-demand mode until end-to-end verification passes. Merely
  seeing a Realtime connection proves the browser connection, not Google delivery.

References:
- https://developers.google.com/workspace/drive/api/guides/push
- https://supabase.com/docs/guides/realtime/postgres-changes
