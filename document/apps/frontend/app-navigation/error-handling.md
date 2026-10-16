# Frontend error handling: app-navigation

- UI revision: 1 (pending-review)
- API/domain error mapping: none (no new operation). Session errors keep the existing `AppShell` behavior (skeleton → redirect to `/login`).

| User action | Error / condition | Inline / page / toast feedback | Recovery action | Focus / accessibility | TODO ID |
|---|---|---|---|---|---|
| Load any page | Session pending / signed out | Existing skeleton; redirect to `/login` | Sign in | unchanged | existing |
| Toggle sidebar | `localStorage` unavailable or throws (private mode, blocked site data, quota) | None; the toggle still works for the current page view; the next load starts expanded | none needed | Toggle keeps focus semantics | FE-NAV-003 |
| Load as a collapsed user | Server renders expanded; preference applies after hydration | One-frame width change (accepted limitation) | none | No focus change | FE-NAV-003 |
| Hover / focus a rail button | Browser without the Popover API | No tooltip; button keeps its `aria-label` and native behavior | none | Name still announced | FE-NAV-003 |
| Open a placeholder (`/modules/<slug>`) | Slug unknown to the model (typo or stale link) | Existing page text "ไม่พบเมนู" with breadcrumbs `Home › Module` and a link back to Home | Use the link | Heading present | FE-NAV-001, 008 |
| Open a placeholder | Slug known but no workflow yet | Existing text "เมนูนี้แสดงในโครงระบบเริ่มต้นแล้ว แต่ยังไม่มี workflow…" with the correct title/breadcrumbs | Back to Home | — | FE-NAV-008 |
| Open `/setup` directly | — | Landing renders; no data needed | — | `h1` "Setup" | FE-NAV-006 |
| Open Master Code | `showModal()` unsupported (very old browser) | Not expected for supported browsers (Baseline 2022); no fallback page | — | — | FE-NAV-007 |
| Close Master Code | Escape / backdrop / Close | Dialog closes | — | Focus returns to the Master Code tile | FE-NAV-007 |
| Activate a modal tile | Navigation | Dialog closes as navigation starts | — | Focus moves with the new page (`main` skip target unchanged) | FE-NAV-007 |
| Use a real page reached from the menu without permission | Page-level access check (existing user-permission/vendor/customer guards) | Existing access-denied state on that page | Ask an administrator | unchanged | out of scope (Q-NAV-11) |

There is no loading, empty, or partial-data state for the menu itself: its content is static. Badge errors do not
exist in revision 1 because badges are not rendered. No message exposes internal details.
