# Attendance location — 30 October 2026

- Clock In/Out requests browser location directly from the button click. A blocked browser or OS permission opens instructions; the app cannot override permission denial.
- For staff restricted to a workplace, use a short high-accuracy GPS watch. Accept the first reading at or below the existing 200 m accuracy threshold, with no cached fix. Stop immediately after success, denial, cancellation, or a 12-second deadline.
- If accuracy remains poor, show the best reported accuracy in metres. Do not submit a clock using a poor reading. Timeouts and unavailable location have separate messages.
- Leaving the attendance screen cancels a pending location check. There is no background location watch.
- The server still enforces allowed workplaces, distance, GPS accuracy and active staff account rules. Retrying does not guarantee an accurate fix indoors.
- Staff allowed to clock anywhere retain their existing optional-location behavior.
- Office (Putra Walk) was updated directly in Supabase at the user's request: latitude `2.992548`, longitude `101.674141`, radius `500 m`. KJ and SK clinic radii were unchanged. This does not grant office access to additional staff.
- Izzah currently has KJ clinic access only. Syahirah has SK clinic and Office access.

Run `node --import tsx scripts/check-clock-location.ts` for location flow checks and `node --import tsx scripts/check-leave-calendar-access.ts` for calendar permissions.

Home Screen icons include the AO symbol and AraOffice wordmark, with no surrounding white margin. iPhone uses `/icons/apple-touch-icon.png`; Android uses `/manifest.webmanifest`. Existing shortcuts may need removal and re-adding to refresh the cached icon.

Staff attendance no longer locks a person to their first browser or phone. Browser IDs are recorded only as audit metadata. Existing registration columns are retained as historical data but are not enforced or updated. This does not change the separate registered-device security for office administration accounts.
