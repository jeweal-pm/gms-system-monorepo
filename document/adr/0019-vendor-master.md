# ADR-0019: Vendor master (CRUD) ใน `backend-api-partner` แบบ Customer แต่มีเฉพาะ Invoice address

- **Status:** Accepted — revision 1 approved 2026-10-15 ("อนุมัติ ADR-0019 และ SA vendor rev 1")
- **Date:** 2026-10-15
- **Feature / source UI revision:** `vendor` / 2 (UI revision 2 approved 2026-10-15)
- **SA revision:** 1
- **Deciders:** project owner
- **Approval evidence:** owner 2026-10-15: "อนุมัติ ADR-0019 และ SA vendor rev 1"
- **Owner inputs already given (ไม่ใช่การอนุมัติ ADR นี้):** 2026-10-15 "frontend and backend ช่วยทำ ui และ api หน้า Vendor ให้ตรงตาม ref หน่อย"; Q-VEN-01 labels เหมือน Customer; Q-VEN-02 Phone "ไม่บังคับ (เหมือน Customer)"; Q-VEN-03 " default ไม่ต้องติ๊ก" (default invoice address ไม่บังคับ, มีได้ 0 หรือ 1); Q-VEN-04/05/06 ใช้ค่า default ที่เขียนไว้ (บรรทัดรองใน drawer = Code Name อย่างเดียว, ไม่มี field เพิ่ม)
- **Supersedes / related ADRs:** ไม่ supersede; ต่อยอด [ADR-0018](0018-customer-master-partner-service.md) §1 (partner เป็นเจ้าของ Vendor "ในอนาคต") โดยไม่แก้ ADR-0018; related [ADR-0001](0001-record-architecture-decisions.md), [ADR-0007](0007-trpc-procedure.md), [ADR-0016](0016-per-user-menu-action-permissions.md)

## Context

เจ้าของต้องการหน้า **Vendor** (`/setup/vendor`) ที่ทำงานเหมือนหน้า Customer ทุกอย่าง
ยกเว้น **มีแค่ Invoice address (ไม่มี Shipping)** UI revision 2 อนุมัติแล้ว
([ui-spec](../apps/frontend/vendor/ui-spec.md), [central TODO](../task/todo/vendor.md))
แต่ backend ยังไม่มี `vendor.*`, ตาราง หรือกฎของ Vendor

สิ่งที่มีอยู่แล้ว (ตรวจจาก checkout 2026-10-15, branch `feat/14-10-26-vendor`):

- `backend-api-partner` (NestJS, Prisma 7.10, schema `partner`) ทำ Customer เสร็จและ verify แล้ว
  (`src/customer/**`, migration `20261014120000_customer`) ตาม ADR-0018 และ SA customer revision 1
- Gateway มี `callPartner` (`src/trpc/partner-client.ts`), `customer-schemas.ts`, router `customer.*`
  ผ่าน `permittedProcedure("customer", …)`
- Permission catalog มี leaf `vendor` (กลุ่ม Partner Master) อยู่แล้ว → `vendor:VIEW/ADD/EDIT/DELETE` ไม่ต้องแก้ auth
- Dashboard shortcut ของ Vendor ยังชี้ `/modules/vendor` (ไม่มี `href`)

ADR-0018 กำหนดแค่ว่า partner จะเป็นเจ้าของ Vendor แต่ไม่ได้กำหนด data model, API, error code
หรือกฎ default address ของ Vendor และกฎ default ของ Vendor **ต่างจาก Customer** (Customer: มี default
ประเภทละ 1 รายการเสมอ ระบบตั้งรายการแรกให้; Vendor: มีได้ 0 หรือ 1)

## Decision

### ทำไมเป็น ADR ใหม่ ไม่ใช่ revision ของ ADR-0018

ADR-0018 revision 1 ได้รับอนุมัติและ implement/verify แล้ว การแก้ ADR-0018 จะทำให้ขอบเขตการอนุมัติเดิม
(Customer ที่ใช้งานอยู่) ต้องถูกตรวจใหม่ ทั้งที่ Customer ไม่เปลี่ยน ADR-0019 จึงบันทึกเฉพาะสิ่งใหม่
และอ้าง ADR-0018 สำหรับสิ่งที่ใช้ซ้ำ (service, schema, service token, timeout, การลบถาวร, list มาตรฐาน)

### 1. Service และ schema: ใช้ของเดิม ไม่เพิ่ม container

- Vendor อยู่ใน `backend-api-partner` เดิม, schema `partner` เดิม, migration history เดิม (`partner._prisma_migrations`)
- Internal REST ใหม่ `/internal/v1/vendors…` ใช้ service token + `X-Actor-User-Id` เหมือน customer
- ไม่มี container, image, network, volume, environment variable หรือ package ใหม่

### 2. API (gateway tRPC `vendor.*`) และสิทธิ์

| Procedure | ทำอะไร | สิทธิ์ |
|---|---|---|
| `vendor.list` | ค้นหา Name/Code Name, กรอง active, cursor pagination (`limit` ≤ 50) + total | `vendor:VIEW` |
| `vendor.get` | ข้อมูลเต็ม 1 ราย พร้อม invoice address ทั้งหมด | `vendor:VIEW` |
| `vendor.create` | สร้าง vendor พร้อม invoice address ในครั้งเดียว | `vendor:ADD` |
| `vendor.update` | แก้ทั้งชุด (address ทั้งหมดแทนของเดิม) ตรวจ `expectedUpdatedAt` | `vendor:EDIT` |
| `vendor.delete` | **ลบถาวร** vendor และ address ทั้งหมด | `vendor:DELETE` |
| `vendor.options` | Currency (ISO 4217) + Country (ISO 3166-1) ชุดเดียวกับ customer | `vendor:VIEW` |

- `vendor.options` แยกจาก `customer.options` เพราะผู้ใช้ที่มีแค่ `vendor:VIEW` ต้องโหลด list ได้
  และ `permittedProcedure` บังคับสิทธิ์ menu เดียวแบบตรงตัว (ADR-0016) ข้อมูลมาจาก list ในหน่วยความจำชุดเดียวกัน
- Error codes: `VENDOR_NOT_FOUND` (404), `VENDOR_CODE_TAKEN` (409), `VENDOR_STALE` (409),
  `VALIDATION_ERROR` (400 + field errors เช่น `invoiceAddresses.1.postcode`), `PARTNER_UNAVAILABLE` (503),
  `PERMISSION_DENIED` (403) และ code เดิมของ session/license
- Timeout gateway → partner: อ่าน 3 วินาที, เขียน 5 วินาที; ไม่ retry mutation (เหมือน ADR-0018)
- Dashboard shortcut Vendor ได้ `href: "/setup/vendor"` (additive เหมือน Customer)

### 3. Data model (schema `partner`, ตารางใหม่)

**`vendor`** — field และกฎเหมือน `customer` ทุกตัว: `name` บังคับ ≤ 200; `code` (Code Name) ไม่บังคับ ≤ 120
ห้ามซ้ำแบบไม่สนตัวพิมพ์ **เฉพาะในกลุ่ม vendor** (vendor กับ customer ใช้ Code Name เดียวกันได้);
`currencyCode` ISO 4217; `active` default true; `firstName` บังคับ ≤ 100; `middleName`/`lastName` ≤ 100;
**Phone ไม่บังคับ** (E.164 + country เหมือน customer); `email` บังคับ ≤ 254 ตัวเล็ก ไม่ unique; audit columns

**`vendor_address`** — invoice address เท่านั้น จึง**ไม่มีคอลัมน์ `type`**: `name` (Name/Company Name) ≤ 200,
`taxId` ไม่บังคับ ≤ 32, `address` ≤ 500, `countryCode`, `state`, `city` (ข้อความ ≤ 100), `postcode` ≤ 20,
`position` 1..10, `isDefault`; FK → `vendor` **ON DELETE CASCADE**

กฎ:
- invoice address **1 ถึง 10** รายการ
- **default มีได้ 0 หรือ 1 รายการ** ระบบ**ไม่**ตั้ง default ให้เอง; มากกว่า 1 → `VALIDATION_ERROR`
  (`{path:"invoiceAddresses", code:"multiple_defaults"}`) และมี partial unique index `(vendor_id) WHERE is_default` เป็น backstop
- Index: `code_key` unique (ค่า null ได้หลายแถว), `(name_key, id)`, `(active, name_key, id)`

### 4. การลบและเอกสารในอนาคต

ลบถาวรได้เสมอเหมือน Customer (ไม่มีเงื่อนไข "ถูกใช้แล้ว") ไม่พบเหตุผลหนักพอจะทำต่างจาก Customer:
เอกสารจัดซื้ออยู่คนละ service/schema อยู่แล้ว ซึ่งห้ามมี FK ข้าม schema ตาม ADR-0001 การห้ามลบจึงต้องเรียกข้าม service
ซึ่งยังไม่มีเอกสารให้ตรวจ

**กฎสำหรับ ADR ของ Purchase Order / Purchase (PU) / Payable / Memo ในอนาคต:** ตอนสร้างเอกสาร
ต้อง**บันทึกสำเนาข้อมูล vendor ที่ต้องแสดง/พิมพ์** (ชื่อ, Code Name, Tax ID, invoice address ที่เลือก, currency)
ลงตารางของเอกสารเอง และเก็บ `vendorId` เป็นค่าอ้างอิงแบบไม่มี FK เอกสารเก่าจึงแสดงได้ครบหลัง vendor ถูกลบ
ถ้าธุรกิจต้องห้ามลบ vendor ที่มีเอกสารค้าง ให้ตัดสินใน ADR ของเอกสารนั้น (เช่น ปิด Active แทน)

### 5. การใช้โค้ดร่วมกับ Customer

ย้าย helper ที่ไม่ผูกกับ entity (cursor, reference data, zod building blocks, ILIKE escape, normalized keys,
การแปลง Prisma error) ไปที่ `backend-api-partner/src/common/` และแยก shared schema ของ gateway เป็น
`src/trpc/partner-schemas.ts` โดย**สัญญาของ customer ไม่เปลี่ยน** `callPartner` รับ `notFoundCode`
แทนค่าคงที่ `CUSTOMER_NOT_FOUND` ไม่มีการ copy โค้ด customer ทั้งไฟล์

## Alternatives

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| แก้ ADR-0018 เป็น revision 2 | ทุกอย่างของ partner อยู่ใน ADR เดียว | เปิดการอนุมัติ Customer ที่ใช้งานแล้วใหม่โดยไม่จำเป็น |
| **ADR-0019 ใหม่ (เลือก)** | ขอบเขตอนุมัติชัด, Customer ไม่ถูกแตะในเชิง decision | ต้องอ่านสอง ADR |
| ตาราง `partner` เดียวมี role customer/vendor | ไม่มีตารางซ้ำ | Customer ที่ live อยู่ต้อง migrate/backfill, กฎ default และ address ต่างกัน, unique code ต้องแยกตาม role |
| ใช้ `customer_address` ร่วม (เพิ่ม owner type) | ตารางน้อยลง | FK แบบ polymorphic ทำไม่ได้ใน PostgreSQL, cascade/partial index ซับซ้อน, แตะตาราง live |
| `vendor_address` มีคอลัมน์ `type` เผื่อ Shipping | เพิ่ม Shipping ง่าย | YAGNI; เจ้าของยืนยัน invoice เท่านั้น; ถ้าต้องเพิ่มภายหลังเป็น migration additive |
| `partner.options` ร่วม (VIEW ของ customer **หรือ** vendor) | procedure เดียว | ต้องเพิ่ม middleware "any-of" ที่ ADR-0016 ไม่มี; customer contract เดิมต้องเปลี่ยน |
| default บังคับ 1 แบบ Customer | สอดคล้องกับ Customer | ขัดคำตอบเจ้าของ Q-VEN-03 |
| ห้ามลบ vendor ที่ถูกใช้ / soft delete | ข้อมูลอ้างอิงครบ | ยังไม่มีเอกสารให้อ้าง, ต้องเรียกข้าม service; ใช้กฎสำเนาข้อมูลแทน |
| Copy โค้ด customer ทั้งชุดเป็น vendor | ไม่แตะ customer | โค้ดซ้ำ 2 ชุด แก้บั๊กต้องแก้สองที่ |

## Consequences and capacity

**ข้อดี**
- ไม่มี container, env, network, package ใหม่; ใช้ permission `vendor:*` ที่มีอยู่
- Customer contract และพฤติกรรมไม่เปลี่ยน (ตรวจด้วย regression)

**ข้อเสีย / ความเสี่ยง**
- การย้าย helper ไป `src/common/` แตะไฟล์ customer → ต้องรัน regression ของ customer (BT-VEN-18)
- Vendor ไม่มี default ได้: เอกสารจัดซื้อในอนาคตต้องให้ผู้ใช้เลือก address เองเมื่อไม่มี default
- ลบถาวร: เอกสารในอนาคตต้องเก็บสำเนา (ข้อ 4)
- Rollback: deploy partner/gateway image ก่อนหน้า ตาราง `vendor*` ค้างอยู่ได้โดยไม่กระทบ customer/auth
  (Prisma ไม่มี down migration; ลบจริงต้องเป็น forward migration ที่เจ้าของสั่ง)

**Capacity (8 GB RAM / 4 vCPU)**
- Compose limits ไม่เปลี่ยน: **3.2 vCPU / 5.5 GiB** (postgres 1.25/2G, auth 0.5/1G, gateway 0.5/768M,
  partner 0.35/512M, frontend 0.6/1280M) headroom ~0.8 vCPU / 2.5 GB
- Pool ของ partner ยัง **max 5** ใช้ร่วม customer/vendor; DB connections รวมไม่เปลี่ยน (~17 จาก 100)
- Body limit: partner `express.json` **256 KB** และ gateway tRPC `maxBodySize` **1 MiB** ไม่เปลี่ยน;
  input vendor ที่ถูกต้องใหญ่สุด ≈ 12 KB (10 address)
- List ≤ 50 แถวต่อหน้า; 1 vendor ≤ 10 address; ข้อมูลคาด low thousands (~10 MB ต่อ 10 000 vendors)
- ไม่มี cache/worker/queue ใหม่; options เป็น object เดียวในหน่วยความจำที่ใช้ร่วมกับ customer
- ต้องวัด: RSS ของ partner หลังเพิ่ม module และ p95 ของ `vendor.list` (ไม่บังคับก่อนอนุมัติ)

## Acceptance and approval

**Observable checks**
1. ผู้มี `vendor:ADD` สร้าง vendor พร้อม invoice address 1–10 รายการ โดยไม่เลือก default ได้; get คืน `isDefault: false` ทุกรายการ
2. เลือก default 1 รายการได้, เอาออกได้; สองรายการ → `VALIDATION_ERROR` `multiple_defaults`
3. Code Name ซ้ำในกลุ่ม vendor (ไม่สนตัวพิมพ์) → `VENDOR_CODE_TAKEN`; ซ้ำกับ customer ได้
4. `vendor.list` ค้นหา Name/Code Name, total ถูก, หน้าละ ≤ 50
5. สองคนแก้พร้อมกัน คนหลังได้ `VENDOR_STALE`; ลบแล้ว get/update → `VENDOR_NOT_FOUND`
6. ผู้มีแค่ `customer:*` เรียก `vendor.*` ไม่ได้ (`PERMISSION_DENIED`); ผู้มี `vendor:VIEW` โหลด `vendor.options` ได้
7. Customer, login, user-permission ทำงานเหมือนเดิม; dashboard Vendor ชี้ `/setup/vendor`
8. ไม่มี container/env/package ใหม่; Compose ไม่เปลี่ยน

**การอนุมัติครอบคลุม** ADR นี้ revision 1 และ SA bundle `vendor` SA revision 1
([document/apps/backend/partner/vendor/](../apps/backend/partner/vendor/architecture.md)):
architecture, decisions, api-contract, authorization, sequence-diagram, database-diagram, error-handling,
dependencies (ไม่มี package ใหม่), testing, [vendor-flow.md](../diagram/vendor-flow.md) และ BE-VEN-001…010
ใน [central TODO](../task/todo/vendor.md) ยังคง Proposed จนกว่าเจ้าของจะอนุมัติ revision นี้
