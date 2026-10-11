# Bounded corrective work

Selected fixes now share a persistent root-cause ledger across frontend/backend and
sessions, with three corrective passes total by default. Retries need a diagnosed failure
and new evidence; success, no-progress, missing verification, or exhaustion ends the cycle.
New independent findings return to owner review. No automatic full audit after each patch.

See [policy](../workflow/remediation.md) and
[analysis/completion](../task/done/2026-10-11-bounded-remediation-workflow.md).
