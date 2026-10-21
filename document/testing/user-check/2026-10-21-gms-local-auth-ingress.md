# GMS local authentication ingress check

- Date: 2026-10-21 (Asia/Bangkok)
- Environment: local Docker preview at `http://localhost:8080`
- User journey: login → home → Vendor → account menu → Sign out
- Test account: demo Super Admin (credentials omitted)

## Result

1. Login page loaded and the demo account quick-fill completed sign-in.
2. The app reached the GMS home page and identified the account as Super Admin.
3. Vendor opened successfully. The existing vendor list and create form rendered, including the currency options.
4. The account menu displayed the signed-in email and role. Selecting Sign out returned to the login page.
5. No vendor was created or saved.

**Result: pass for this local journey.** This is a preview of the existing Better Auth and frontend behavior through Nginx; it does not prove the target access-JWT/refresh implementation, master-service API cutover, or production deployment readiness.

## Related checks

- `GET /login`: 200
- `GET /api/auth/get-session` through Nginx: 200
- `GET /api/trpc/system.health` through the retained Next/gateway path: 200
- `GET /internal/v1/customers` through Nginx: 404
- Nginx health endpoint: 200
