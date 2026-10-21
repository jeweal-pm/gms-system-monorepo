# Sequence — GMS file storage migration

- Feature / SA revision: `gms-file-storage-migration` / 3
- Main current flows: [user photo](../../auth/user-permission/user-photo.md), [company profile](../../partner/company-profile/sequence-diagram.md)
- Status: implementation in progress; SA revision 3 approved 2026-10-21

```mermaid
sequenceDiagram
    actor U as User
    participant FE as Frontend
    participant GW as Same-origin gateway
    participant API as Owning API (auth or partner)
    participant DB as Owning PostgreSQL schema
    participant ST as @gms/storage (fs driver)
    participant NG as Nginx protected file location

    U->>FE: Upload JPEG/PNG through existing UI
    FE->>GW: Existing authenticated binary REST request
    GW->>API: Forward bounded stream and verified actor context
    API->>API: Check permission, entity, size and image signature
    API->>ST: putStream(files, service-prefixed key, SHA-256)
    ST->>ST: Stream to /srv/gms/storage/.tmp; validate; atomic publish
    API->>DB: Upsert service-owned stored_files metadata and association
    DB-->>API: Ready metadata
    API-->>GW: Existing version/hash response
    GW-->>FE: Existing response; photo/logo remains private

    U->>FE: View image
    FE->>GW: Existing authorized GET with version
    GW->>API: Forward request
    API->>DB: Resolve ready metadata and authorize entity
    DB-->>API: Bucket/key/content type/hash
    API->>ST: Create short-lived protected download capability
    API-->>GW: Content headers and internal delivery directive
    GW->>NG: Internal redirect; browser cannot call location directly
    NG->>ST: Read-only file access
    NG-->>U: Image bytes

    Note over API,DB: Any uploaded asset delete/replace hides it; metadata and bytes remain indefinitely
```
