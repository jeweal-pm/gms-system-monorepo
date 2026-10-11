# Database diagram: <service> / <feature>

- Source UI revision / SA revision: <revision> / <revision>
- Owning service / schema: <service> / <schema>
- Actual Prisma schema / migration paths: <paths>

Write an editable fenced Mermaid `erDiagram` with entities, key fields, PK/FK relationships,
cardinality, and ownership. Document unique constraints, indexes, nullability, money/decimal
and timestamp handling where relevant. Distinguish current entities from proposed changes.
List migration, backfill, compatibility, and rollback steps. If no schema change is needed,
state why and link/show the existing affected model. Do not query another service's tables.
