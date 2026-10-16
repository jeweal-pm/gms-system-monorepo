# Handoff: app-navigation → SA (deferred topics)

- **Status: not dispatched.** Nothing in `app-navigation` UI revision 1 depends on SA. This file records the two
  service gaps found during UI analysis so a later session can start them only if the owner selects them.
- Feature ID / UI revision: `app-navigation` / 1 (**pending-review**; not approved)
- SA revision / source UI revision (if applicable): none / 1
- From role/scope: ui-spec (`ui-spec-docs`)
- To role/scope / parent integration owner: SA (`sa-design-docs`), via the parent — only after the owner answers Q-NAV-06 and/or Q-NAV-11 asking for these features
- Exact TODO IDs and source documents: FE-NAV-012 (badges, deferred); Q-NAV-06, Q-NAV-11 in [open-questions.md](../../apps/frontend/app-navigation/open-questions.md); [data-fetching.md](../../apps/frontend/app-navigation/data-fetching.md#requirements-for-a-later-sa-bundle); source S3 [03-setup-landing-sidebar-expanded.png](../../apps/frontend/app-navigation/source/03-setup-landing-sidebar-expanded.png) (red dots on Home, Approve, Quotation)
- Approval status, approved revision, and owner evidence: none. The owner request of 2026-10-15 ("frontend ช่วยทำ sidebar ให้หน่อย และ เมื่อกดที่ setup จะกลายเป็นหน้าที่ฉันส่งไปให้") is not an approval of UI revision 1 or of any SA work.
- Required contract / diagrams / ADRs (if selected):
  - **SA-NAV-01 Badges:** meaning of each dot (unread notifications? pending approvals? open quotations?), per-user/permission scope, dot vs number, freshness (poll interval vs push), owning service(s), bounded aggregate query, error/timeout behavior (hide on failure), sequence diagram, tRPC contract, capacity note.
  - **SA-NAV-02 Menu permissions:** whether menu items hide without VIEW; permission catalog v1 lacks most new keys (approve, memo-receive, memo-outstanding-*, purchase-outstanding, load-to-stock, merge-split, stock-transfer-location, stock-adjustment, barcode-printing, os-*, report items, notifications, location-master, certificate-master, labor-name, sale-person); renaming (e.g. `memo-in` → `memo-receive`) needs a grant migration rule; `MAX_CATALOG_LEAVES` = 64 bound must be rechecked.
- Dependency ledger entries and installation status: none
- Allowed code/document paths: SA documents only (`document/apps/backend/**`, `document/adr/**`, `document/diagram/app-navigation-flow.md` refinements). No code.
- Integration-owned changes: none expected
- Infra service bundle/revision, ADR/config drift, network/egress and secret-adapter prerequisites (when containers change): none expected; a push channel (SSE/WebSocket) for badges would be an architecture change → ADR + infra research
- DevOps pipeline/source revision, …: none
- Resource budget / capacity impact (8 GB RAM / 4 vCPU total): revision 1 adds none. A badge query must be one bounded aggregate per user with a short cache and a conservative refresh interval; no per-item fan-out or unbounded polling.
- Expected output and acceptance criteria: an SA bundle for the selected topic(s), presented for separate owner approval; backend TODO items added to [app-navigation.md](../../task/todo/app-navigation.md)
- Verification completed / not run: none (not dispatched)
- Blocking item, if any: owner answers to Q-NAV-06 / Q-NAV-11 requesting the features
- Resume action and destination: owner selects → parent dispatches SA → owner approves SA bundle → backend → frontend FE-NAV-012
- Corrective work ID / root-cause ledger link: n/a
- Existing pass limit / allocated passes / active pass: n/a (no corrective work)
- Changed evidence, contract, or prerequisite justifying this handoff: initial record
- Concrete receiving-role output / next fact needed: the owner's definition of what each badge counts
- Stop reason / terminal outcome / explicit extension evidence, if any: stopped at review boundary (not dispatched)
