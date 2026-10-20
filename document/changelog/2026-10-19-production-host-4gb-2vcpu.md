# 2026-10-19 Production host 4 GB RAM / 2 vCPU

- Owner reduced the production host from 8 GB / 4 vCPU to 4 GB / 2 vCPU ([ADR-0024](../adr/0024-production-host-4gb-2vcpu.md)).
- Skills and agent definitions (`AGENTS.md`, `.codex/`, `.claude/`, `agents/`) now state 4 GB RAM / 2 vCPU.
- `docker-compose.yml` limits reduced from 3.20 vCPU / 5.5 GiB to 1.70 vCPU / 2944 MiB with Node heap caps;
  `docker-compose.dev.yml` has its own watch-mode limits. Table: [infra/capacity.md](../infra/capacity.md).
- Living workflow, architecture, handoff and template documents updated. Historical records (accepted ADR-0013…0019,
  changelog, task/done, investigation tickets, versioned infra bundles) keep the values of their time.
- Pending: production-image runtime and load measurements on the real host.
