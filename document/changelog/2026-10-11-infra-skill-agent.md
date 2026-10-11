# Infrastructure role

Added `infra` skill/subagent for secure, service-specific container research and approved
configuration. New/changed ADR containers route through infra and relevant SA review;
required cross-container traffic, data/init, secrets and 8 GB RAM / 4 vCPU capacity remain
explicit. Parent serializes shared config/index writes; application adapters stay with their
frontend/backend owner. Review findings enter investigation before later selected fixes.

See [completion](../task/done/2026-10-11-infra-skill-agent.md) and
[workflow](../workflow/infra-delivery.md).
