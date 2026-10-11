# Sequence diagram: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Main user flow: <document/diagram link>
- Related API operations / TODO IDs: <references>

Write an editable fenced Mermaid `sequenceDiagram` for each relevant interaction using
the actual participants: frontend, same-origin proxy, gateway, owning service/database,
and external systems where used. Include authorization, alternate/error paths, transactions,
timeouts/retries, and the user-visible response. Keep the main business flow in its linked
document rather than duplicating it. If reusing an unchanged sequence, link and explain it.
