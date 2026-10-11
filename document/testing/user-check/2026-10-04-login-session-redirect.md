# Login session redirect

## What I checked

- The sign-in endpoint accepted the current test account and issued a session cookie.
- The session endpoint recognized that cookie and returned the signed-in user.
- The local HTTP configuration had been issuing a `Secure` cookie, which could prevent the browser from keeping the session.

## Change made

The auth service now sets the cookie's `Secure` attribute from the configured frontend URL scheme. Local HTTP uses a regular cookie; an HTTPS frontend keeps the secure cookie setting.

## Browser check

In isolated Chrome sessions with clean cookie jars, I opened Login at both `http://localhost:3000` and `http://127.0.0.1:3000`, entered the current test account, and submitted the form. Both stayed on Home for 8 seconds, displayed the dashboard, and the session checks returned successfully. The test did not use a real customer account.

The auth service now trusts the configured frontend origin and its `127.0.0.1` loopback alias when the configured host is `localhost`.
