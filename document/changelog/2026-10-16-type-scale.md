# 2026-10-16 type scale (whole system)

- Owner instruction: body 14 px, headings 16 px, labels 12 px, page titles 24 px (answer to the follow-up question), whole system.
- Added tokens `text-gms-title/heading/body/label` in `frontend/src/app/globals.css`; `body` defaults to 14 px. Replaced every `text-xs/sm/base/lg/xl/2xl` and arbitrary `text-[12…30px]` in `frontend/src` (43 files; 0 old size classes left). Mapping: `h1` → title; card/section/drawer/dialog/panel headings and Home group titles → heading; 14–17 px text, inputs, buttons → body; 12–13 px labels, hints, errors, breadcrumbs, tooltips, group labels → label.
- Checks: frontend typecheck pass, lint 0 errors (2 existing warnings), unit tests 40 pass; dev CSS verified to contain the four utilities. Visual browser check not run (no test session). The frontend dev container was restarted because its file watcher missed the changes.
- Documented in [frontend architecture](../apps/frontend/architecture.md#typography-scale-owner-standard-2026-10-16).
