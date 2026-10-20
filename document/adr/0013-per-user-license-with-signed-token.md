# ADR-0013: License ราย User ผูกกับ Instance + Email ตรวจสอบด้วย Signed Token

- **Status:** Accepted — SA bundle `auth-license` revision 2 approved 2026-10-11
- **Date:** 2026-10-11
- **Feature / source UI revision:** `auth-license` / none (backend-only)
- **SA revision:** 2
- **Deciders:** Project owner
- **Approval evidence:** Revision 2 approved 2026-10-11 with `อนุมัติชุดนี้`, including QL2 correction: no transfer; licensed email immutable; new email requires a new account and separate license.
- **Supersedes / related ADRs:** Supersedes none; related [ADR-0014](0014-mock-license-client.md) and [backend review bundle](../apps/backend/auth/license-integration/architecture.md)

## Context

Current implementation uses `backend-api-auth` and `backend-api-gateway`. Auth owns the
license client/cache and gateway enforces access from authenticated session context. See
the [backend design bundle](../apps/backend/auth/license-integration/architecture.md).

แอปติดตั้งบน server แยกของลูกค้าแต่ละราย (instance) ที่ทีมเราติดตั้งและดูแลให้
ขาย license แบบ **1 user 1 key** เพราะแต่ละคนเริ่มใช้และหมดอายุไม่พร้อมกัน
และมีช่วงทดลองใช้ (trial)

ฐานข้อมูลของลูกค้าเก็บแค่ข้อมูล login ไม่ต้องการให้ข้อมูล license (ราคา, แพ็กเกจ, key)
ไปอยู่ที่ลูกค้า

การผูก key กับ email อย่างเดียวไม่พอ เพราะ:
- email เดียวกันอาจมีอยู่ใน instance ของลูกค้าหลายราย
- ไม่มีวันหมดอายุ สถานะ หรือการยกเลิก
- ถ้าแอปแค่ถามว่า "valid ไหม" แล้วเชื่อคำตอบ ใครแก้ response ก็ข้ามได้

## Decision

**1. มี license-server กลางที่ทีมเราดูแลที่เดียว** เป็นแหล่งความจริงของ license ทุกลูกค้า

**2. license ผูกกับ (instance_id, email)** key ของลูกค้า A ใช้ที่ลูกค้า B ไม่ได้
แต่ละ instance มี instance_id และ API key ของตัวเองไว้เรียก license-server; license จะไม่
โอนไปยังอีเมลใหม่ บัญชีที่มี license เปลี่ยนอีเมลไม่ได้ หากต้องใช้อีเมลใหม่ให้สร้างบัญชีใหม่
และออก license แยกภายใน instance ตามกติกา 1 email ต่อ 1 license

**3. key ใช้ครั้งเดียวตอน activate** หลังจากนั้นต่ออายุ, เปลี่ยน trial เป็น paid
หรือยกเลิก ทำที่ license-server อย่างเดียว ผู้ใช้ไม่ต้องกรอก key ใหม่

**4. license-server ส่ง token ที่เซ็นด้วย Ed25519 (JWT, alg EdDSA)**
auth service ตรวจลายเซ็นด้วย public key ที่จัดการผ่าน environment/config ที่อนุมัติ จึงปลอม token ไม่ได้
และไม่ต้องถาม license-server ทุก request

**5. auth service เก็บ token ไว้ในตาราง `auth.LicenseCache`** (token ไม่ใช่ความลับ)
ถ้า license-server ติดต่อไม่ได้ ใช้ token เดิมต่อได้ภายใน grace period ที่เจ้าของอนุมัติ

**6. ฐานข้อมูลลูกค้าไม่เก็บ license key** เก็บ signed token และข้อมูลขั้นต่ำที่จำเป็นเท่านั้น

**7. การเลือกสร้างหรือใช้ license-server เป็นแหล่งจริงอยู่นอก backend bundle นี้**
เอกสารนี้กำหนดเฉพาะ contract ที่ customer backend ใช้; ยังไม่อนุมัติการสร้าง service กลาง

CRM verifies an eligible license before creating a user; `pending` means an issued
license/key and qualifies for account creation. Every account, including Super Admin, must
hold a license. Activation locks for one minute after three failed attempts, and each user
has one active session. Outage grace is seven days from the cached token's `fetchedAt`. A
licensed account's email is immutable. To use a new email, create a new account and issue a
separate license; never transfer or rebind the existing license. See the [license spec](../spec/0006-license.md)
and approved implementation details in the linked backend bundle.

## Alternatives

| ทางเลือก | ไม่เลือกเพราะ |
|---|---|
| email + key อย่างเดียว | แชร์ได้ไม่จำกัด, ไม่มีหมดอายุ, ยกเลิกไม่ได้ |
| license ต่อ instance (1 key ต่อลูกค้า) | วันหมดอายุของแต่ละ user ไม่ตรงกัน |
| ถาม license-server ทุก request | license-server ล่มเมื่อไหร่ ลูกค้าทุกรายใช้งานไม่ได้พร้อมกัน |
| ใช้บริการสำเร็จรูป (Keygen, LicenseSpring, Cryptolens) | ยังไม่มีหลักฐานเปรียบเทียบราคา/การดูแล/ข้อกำหนดข้อมูล และยังไม่มีการตัดสินใจว่าจะซื้อบริการหรือสร้างเอง; อยู่นอก backend integration revision นี้ |

## Consequences and capacity

**ข้อดี**
- ปลอม license ไม่ได้แม้มีสิทธิ์เข้าฐานข้อมูลลูกค้า
- ต่ออายุหรือยกเลิกได้จากที่เดียว มีผลภายในรอบ refresh (24 ชม.)
- license-server ล่มชั่วคราวไม่กระทบลูกค้า

**ข้อเสีย / ความเสี่ยง**
- ต้องดูแล license-server อีก 1 service และต้องสำรองข้อมูลให้ดี
- ต้องดูแล signing key: ถ้า private key หลุด ต้องหมุนเปลี่ยนและอัปเดต public key ทุก instance
- license ราย user เสี่ยงต่อการแชร์บัญชี ต้องจำกัด session พร้อมกัน (BR-L10)

ไม่มี container, worker, cache service หรือ database ใหม่ใน backend bundle นี้ ใช้ auth และ
PostgreSQL ที่มีอยู่; production มีงบรวม 8 GB RAM / 4 vCPU และต้องคง headroom ตาม
[capacity plan](../apps/backend/auth/license-integration/architecture.md) การรับประกัน latency
ยังต้องวัดก่อนอ้างเป็นค่ารับประกัน

**สิ่งที่ต้องทำต่อ**
- [ ] ตัดสินใจ business rules ใน [license spec](../spec/0006-license.md) ข้อ 13
- [ ] runbook: ติดตั้ง instance ใหม่ (สร้าง instance_id, API key, ฝัง public key)
- [ ] runbook: หมุนเปลี่ยน signing key (ใช้ `kid` รองรับหลาย key ช่วงเปลี่ยน)
- [ ] ระหว่างรอ license-server ใช้ mock ตาม ADR-0014

## References
- [License spec](../spec/0006-license.md)
- [License server API](../spec/0005-license-server-api.md)
- [SA backend design bundle](../apps/backend/auth/license-integration/architecture.md)

## Acceptance and approval

Revision 1 approval is historical. Revision 2 was approved with `อนุมัติชุดนี้` on 2026-10-11.
Approval covers ADR-0013 revision 2 and the exact linked bundle: backend architecture, API,
sequence and database diagrams, authorization, error handling, dependency proposal, testing
plan, central TODO, license spec/API contract, and ADR-0014. Defer out-of-scope product
questions in the central TODO. Implementation, migration and approved dependency installation
may proceed under the central TODO. The owner approved the configured JWT issuer, audience,
and error-envelope defaults. No license rebind endpoint is proposed or required by this
revision; licensed account email is immutable and a new email requires a separate account/license.

## GMS migration amendment (2026-10-20)

The owner approved [SA revision 1](../reviews/sa/2026-10-20-gms-platform-migration-rev1.md)
with [ADR-0026](0026-gms-access-tokens-and-live-authorization.md) and the
[offline policy amendment](../spec/gms-license-offline-policy.md). For the staged
GMS target, license freshness changes from the historical 24-hour refresh and
seven-day grace to an online check on each protected request while reachable,
with configurable transient-outage grace of 0–2 days (default 2) under the
separately approved [three-day signed-token contract revision 2](../spec/gms-license-server-contract-rev2.md).
The v2 customer client and policy are staged; this amendment does not alter the
current protected routes until the external license-server implementation,
capacity and cutover are verified. The one-email/one-license and no-transfer
decisions above remain in force.
