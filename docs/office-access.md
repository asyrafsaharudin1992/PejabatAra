# Office access prototype

The lobby is before each workspace's existing account sign-in. Office codes are
an entrance gate, not a substitute for account authentication or database/API
authorisation. A master code opens all eight doors; it does not impersonate users
or confer a Supabase admin role. Unbuilt offices show a Coming soon screen.

## Local preview

Open the lobby and choose Set up Master Admin. Set a private code of at least
eight characters. No default code is shipped. Master Admin can then use Set office
code under each door. Codes are salted/scrypt-hashed in `.araoffice-access.json`,
which is gitignored and created with owner-only filesystem permissions. Never
commit this file. The browser receives a signed HttpOnly cookie lasting 8 hours.
Lock offices clears the door-access cookie; workspace account sessions are separate.

## Before deployment

Set OFFICE_ACCESS_CONFIG as a private server environment variable containing the
local configuration JSON, or provision a managed code store before deployment.
Never prefix it with VITE_. Local first-time setup and local code editing are
disabled on Vercel. Existing codes can be used there once securely configured.
The current attempt limiter is instance-local; production needs a shared limiter
or Vercel WAF policy. A lobby gate alone is not API-level office isolation: audit
the legacy API and enforce workspace permissions there before staff rollout.
Keep account login for sensitive offices. This change is for local review and
has not deployed a new authentication system to production.
