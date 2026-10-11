# Login screen and demo accounts

## What I tried

- Opened the login page in Chrome at the same 657 × 641 viewport as the reference.
- Checked the two account cards, prefilled email and password fields, remember-device checkbox, password visibility icon, forgot-password link, and Log in button.
- Submitted sign-in requests for each demo account through the local auth route.

## What worked

- The page showed both account choices and prefilled the Super Admin test account.
- Both local sign-in requests succeeded and returned the matching account.
- Forgot Password appeared as a blue link, and the remember-device checkbox started unchecked.

## Not checked

- I did not complete the card-click and submit journey with interactive mouse/keyboard automation. The available Chrome run was headless, so the screenshot confirms the rendered page but not those clicks.

## Screenshot

See [login-demo.png](artifacts/login-demo.png).
