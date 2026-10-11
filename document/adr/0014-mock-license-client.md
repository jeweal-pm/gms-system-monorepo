# ADR-0014: ใช้ Mock License Client ผ่าน Interface ระหว่างรอ License Server

- **Status:** Accepted — SA bundle `auth-license` revision 2 approved 2026-10-11
- **Date:** 2026-10-11
- **Feature / source UI revision:** `auth-license` / none (backend-only)
- **SA revision:** 2
- **Deciders:** Project owner
- **Approval evidence:** Revision 2 approved 2026-10-11 with `อนุมัติชุดนี้`; QL2 correction is recorded in the license spec and central TODO.
- **Supersedes / related ADRs:** Supersedes none; related [ADR-0013](0013-per-user-license-with-signed-token.md) and [backend review bundle](../apps/backend/auth/license-integration/architecture.md)

## Context

`backend-api-auth` and `backend-api-gateway` must enforce license for sessions, but the
license-server has not been created.
ทีมไม่อยากรอ และต้องการทดสอบกรณีต่างๆ (trial, หมดอายุ, ถูกยกเลิก, server ล่ม)
ได้ตั้งแต่ตอนนี้

## Decision

- กำหนด interface `LicenseClient` ตาม [license-server API contract](../spec/0005-license-server-api.md)
- มีสอง implementation: `MockLicenseClient` และ `HttpLicenseClient`
- เลือกด้วย `LICENSE_MODE=mock|remote`
- **mock ต้องเซ็น token จริง** ด้วย dev private key ที่มาจาก local development secret เพื่อให้โค้ดตรวจลายเซ็นถูกทดสอบ; ห้าม commit/embed private key
- เลือก scenario จาก email เฉพาะใน mock mode ตาม scenario table ใน
  [backend testing plan](../apps/backend/auth/license-integration/testing.md); ไม่ใช้ scenario logic ใน remote mode
- **แอปต้องไม่ยอม start** ถ้า `LICENSE_MODE=mock` และ `NODE_ENV=production`

## Alternatives

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| รอ license-server เสร็จก่อน | ไม่ต้องทำ mock | งาน login และ permission ติดค้าง |
| flag ปิดการตรวจ license (`SKIP_LICENSE=true`) | ง่ายที่สุด | ไม่ได้ทดสอบ flow license เลย และอันตรายถ้าหลุดไป production |
| mock HTTP server แยก (เช่น Prism จาก OpenAPI) | ทดสอบ HTTP client จริง | ต้องรัน container เพิ่ม, จำลองสถานการณ์ยาก, token ไม่ได้เซ็นจริง |
| **mock ใน process ผ่าน interface (เลือก)** | สลับด้วย env ตัวเดียว, จำลองทุกสถานการณ์ได้, token เซ็นจริง | ไม่ได้ทดสอบส่วน HTTP จนกว่าจะต่อของจริง |

## Consequences and capacity

**ข้อดี**
- พัฒนา login, LicenseGuard และหน้าจอ license ได้เลย
- QA และ AI ทดสอบทุกกรณีได้ด้วยการสร้าง user ตาม email ที่กำหนด

**ข้อเสีย / ความเสี่ยง**
- mock อาจเพี้ยนจากของจริงเมื่อ API เปลี่ยน
  → ทั้งสองฝั่งต้องทำตาม [license-server API contract](../spec/0005-license-server-api.md) และแก้ไฟล์นั้นก่อนเสมอ
- ส่วน HTTP (timeout, retry, auth header) ยังไม่ถูกทดสอบ
  → เมื่อ license-server พร้อม ให้รัน integration test ชุดเดียวกันด้วย `LICENSE_MODE=remote`

Mock implementation shares the existing auth process and database; no additional
container, worker, or service is introduced. The runtime status cache is capped at 4,096
entries. The 8 GB RAM / 4 vCPU aggregate host budget remains the deployment target; CPU,
memory, and request latency measurements have not been run.

**เมื่อเลิกใช้ ADR นี้**
- license-server ขึ้น staging แล้ว และ integration check ผ่านด้วย `LICENSE_MODE=remote`
- เก็บ `MockLicenseClient` ไว้ใช้ใน local และ test ต่อได้ ไม่ต้องลบ

## Acceptance and approval

Revision 1 approval is historical. The owner approved SA revision 2 with `อนุมัติชุดนี้` on
2026-10-11. Approval covers the API, schema, authorization, security, capacity and dependency
documents linked from [the review bundle](../apps/backend/auth/license-integration/architecture.md):
both ADRs, API contract, auth/gateway architecture, sequence/database diagrams, authorization,
errors, dependency proposal, testing plan, and central TODO. Backend implementation is
authorized for the approved items in that TODO.
