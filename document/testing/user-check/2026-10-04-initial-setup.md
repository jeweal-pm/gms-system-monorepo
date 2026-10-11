# GMS initial setup: customer check

**Date:** 2026-10-04

## What worked

- I entered the temporary account details on Login; it opened Home and showed the sidebar and shortcut cards.
- I opened Forgot Password, submitted the same email, saw the confirmation message, and received a reset password in the local test inbox. The new password opened Home successfully.
- Home displayed correctly at desktop size and at 390×844 on mobile, with no horizontal scrolling on mobile.
- The temporary test accounts were deleted after the checks. No customer account or personal data was used.

Screenshots: [Login](artifacts/login-desktop.png), [Home desktop](artifacts/home-desktop.png), [Home mobile](artifacts/home-mobile.png), [Forgot Password](artifacts/forgot-password-desktop.png).

## Checks I could not perform

- Keyboard-only navigation, password change, and sign-out were not part of the exercised flow.

## Difference from the supplied Home image

The reference says “9 groups · 38 shortcuts”; the running Home page says “9 groups · 33 shortcuts”. The written project docs and visible part of the image do not name the other five shortcuts, so I did not invent menu items.

All five Compose services are running. You can open the app at `http://localhost:3000` and Mailpit at `http://localhost:8025`.
