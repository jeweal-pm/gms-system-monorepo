# ADR-0018: Customer master (CRUD) ในหน้า Setup โดยแยก service ใหม่ `backend-api-partner`

- **Status:** Accepted — revision 1 approved 2026-10-14 ("อนุมัติ ADR-0018")
- **Date:** 2026-10-14
- **Feature / source UI revision:** `customer` / 1 (screenshot 3 ภาพจากผู้ใช้ 2026-10-14: ฟอร์มว่างพร้อม error, ฟอร์มที่ address #2 เปิดอยู่และ drawer ปิด, ฟอร์มที่ drawer เปิด)
- **SA revision:** 1
- **Deciders:** Panyapol
- **Approval evidence:** 2026-10-14 ผู้ใช้: "อนุมัติ ADR-0018" (revision 1) — ข้อมูลตั้งต้นจากผู้ใช้ 2026-10-14: "frontend backend ทำadr มาให้อ่านหน่อยหน้านี้คือ customer อยู่ใน setup เหมือน userpermissoin ขอเพิ่มปุ่ม delete ด้วยเหมือน permission ใน design ยังไม่มีก็จะมี create get put delete ธรรมดาเลย" และเลือก (1) service ใหม่ `partner` (2) ลบถาวร (3) Currency/Country ใช้ list มาตรฐาน (4) ทำปุ่ม header ครบยกเว้น export Excel; ผู้ใช้ชี้แจงเพิ่ม 2026-10-14 ก่อนอนุมัติ: บรรทัดหนาในรายการคือ Name, บรรทัดรองคือ Code Name (ไม่มีเลขที่อัตโนมัติ), drawer ใช้ "Customers", ลบถาวรได้เสมอ โดย Quotation/Sale เก็บชื่อ customer ไว้ในเอกสารของตัวเอง
- **Supersedes / related ADRs:** related [ADR-0001](0001-record-architecture-decisions.md) (แยก service/schema ตาม domain), [ADR-0007](0007-trpc-procedure.md), [ADR-0016](0016-per-user-menu-action-permissions.md), [ADR-0017](0017-super-admin-managed-users.md)

## Context

ผู้ใช้ต้องการหน้า **Customer** ใน Setup แบบเดียวกับหน้า User and permission
(ฟอร์มด้านซ้าย + drawer รายการด้านขวา) ให้ create / get / update / delete ได้
และเพิ่มปุ่ม Delete ซึ่งใน design ยังไม่มี

สิ่งที่เห็นใน design:

| ส่วน | รายละเอียด |
|---|---|
| Header | "Add Customer" + จำนวน "Customer list 8", ปุ่ม Print, Excel, Duplicate, Refresh, **Create Customer** |
| Customer Information | Code Name, Name\*, Currency\* (dropdown), toggle Active |
| Basic Information | First name\*, Middle name, Last name, Phone No. (รหัสประเทศ + เบอร์), Email\* |
| Invoice Address (หลายรายการ) | Name/Company Name\*, Tax ID, Address\*, Country\*, State/Province\*, City\*, Postcode\*, "Set as default address", ปุ่มถังขยะ (ยกเว้นรายการแรก), "Add another invoice address" |
| Shipping Address (หลายรายการ) | Name\*, Address\*, Country\*, State/Province\*, City\*, Postcode\*, "Set as default address", "Add another …" |
| Drawer ขวา | ค้นหาชื่อ/รหัส, แถว draft "New user", รายการบรรทัดหนา = Name (เช่น `SAMPLE-VENDOR-A`) และบรรทัดรอง = Code Name (เช่น `V-0001 · Sample Vendor A Co., Ltd.`), ป้าย Inactive |
| Validation | ช่องบังคับที่ว่างเป็นกรอบแดง + ข้อความ error |

สิ่งที่มีในระบบตอนนี้:
- Permission catalog ([ADR-0016](0016-per-user-menu-action-permissions.md)) มี menu key `customer` อยู่แล้ว
  (กลุ่ม Partner Master) และ gateway มี `permittedProcedure(menuKey, action)` สำหรับบังคับสิทธิ์
- Sidebar มี Partner Master › Customer ที่ยังเป็นหน้า placeholder `/modules/customer`
- ยังไม่มี service, schema หรือตารางของ customer; ยังไม่มี Currency master หรือรายการประเทศ
- [ADR-0001](0001-record-architecture-decisions.md) กำหนดให้แยก module ตาม domain
  แต่ละ module เป็นเจ้าของตารางใน schema ของตัวเอง และห้าม query ตารางของ module อื่น

## Decision

### 1. Service ใหม่ `backend-api-partner` และ schema `partner`

- NestJS HTTP service ใหม่ใน monorepo (`backend-api-partner/`, package `@gem-crm/backend-api-partner`)
  เป็นเจ้าของข้อมูลคู่ค้า: **Customer** ในรอบนี้ และ **Vendor** ในอนาคต
- Prisma project แยก ใช้ schema PostgreSQL `partner` ในฐานข้อมูลเดิม (`f1_system`)
  และเก็บประวัติ migration ไว้ใน schema `partner` ของตัวเอง ไม่ปนกับของ auth
- ไม่ query ตาราง `auth` และ auth ไม่ query ตาราง `partner`; เก็บ `createdBy`/`updatedBy` เป็น user id (ไม่มี FK ข้าม schema)
- เรียกได้จาก **gateway เท่านั้น** ผ่าน internal REST (`/internal/v1/customers…`)
  โดย gateway ส่ง service token ลับ (`PARTNER_SERVICE_TOKEN`) และ actor user id ใน header
  partner ปฏิเสธ request ที่ไม่มี token ถูกต้อง (`401`) — production ไม่ publish port ของ partner

### 2. API (gateway tRPC `customer.*`) และสิทธิ์

| Procedure | ทำอะไร | สิทธิ์ (`permittedProcedure`) |
|---|---|---|
| `customer.list` | ค้นหาด้วย Name/Code Name, กรอง active, cursor pagination (`limit` ≤ 50) + จำนวนทั้งหมด | `customer:VIEW` |
| `customer.get` | ข้อมูลเต็ม 1 ราย พร้อม address ทั้งหมด | `customer:VIEW` |
| `customer.create` | สร้าง customer พร้อม address ในครั้งเดียว | `customer:ADD` |
| `customer.update` | แก้ทั้งชุด (ส่ง address ทั้งหมดแทนของเดิม) ตรวจ `updatedAt` กันการเขียนทับ | `customer:EDIT` |
| `customer.delete` | **ลบถาวร** customer และ address ทั้งหมด | `customer:DELETE` |
| `customer.options` | รายการ Currency (ISO 4217) และ Country (ISO 3166-1) | `customer:VIEW` |

- Super Admin ผ่านทุกสิทธิ์ตาม ADR-0016; action `CANCEL` และ `PRICE` ไม่ใช้กับหน้านี้
- Error codes: `CUSTOMER_NOT_FOUND` (404), `CUSTOMER_CODE_TAKEN` (409),
  `CUSTOMER_STALE` (409 เมื่อ `updatedAt` ไม่ตรง), `VALIDATION_ERROR` (400 + field errors),
  `PARTNER_UNAVAILABLE` (502/503 เมื่อเรียก partner ไม่ได้)
- Timeout gateway → partner: อ่าน 3 วินาที, เขียน 5 วินาที; ไม่ retry mutation

### 3. Data model (schema `partner`)

**`Customer`**

| Field | Type / rule |
|---|---|
| `id` | UUID PK |
| `name` | Name, บังคับ, ≤ 200 — แสดงเป็นบรรทัดหนาใน drawer |
| `code` | Code Name, ไม่บังคับ, ข้อความอิสระ ≤ 120 (ตัดช่องว่างหัวท้าย), ห้ามซ้ำแบบไม่สนตัวพิมพ์เล็ก/ใหญ่เมื่อมีค่า — แสดงเป็นบรรทัดรองใน drawer; ระบบไม่ออกเลขที่ให้อัตโนมัติ |
| `currencyCode` | บังคับ, ISO 4217 3 ตัวอักษร (ตรวจกับ list ในโค้ด) |
| `active` | boolean, default `true` |
| `firstName` | บังคับ, ≤ 100; `middleName`, `lastName` ไม่บังคับ ≤ 100 |
| `phoneE164`, `phoneCountry` | ไม่บังคับ, รูปแบบเดียวกับ user-permission (E.164 + ISO country) |
| `email` | บังคับ, ≤ 254, normalize เป็นตัวเล็ก (ไม่บังคับ unique — หลาย customer ใช้ email บริษัทเดียวกันได้) |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | audit |

**`CustomerAddress`**

| Field | Type / rule |
|---|---|
| `id` | UUID PK; `customerId` FK → `Customer` **ON DELETE CASCADE** |
| `type` | `INVOICE` หรือ `SHIPPING`; `position` ลำดับที่แสดง (#1, #2, …) |
| `name` | บังคับ ≤ 200 (Invoice = Name/Company Name) |
| `taxId` | ไม่บังคับ ≤ 32, ใช้เฉพาะ `INVOICE` |
| `address` | บังคับ ≤ 500 |
| `countryCode` | บังคับ ISO 3166-1 alpha-2 |
| `state`, `city` | บังคับ ≤ 100 (ข้อความ ดูข้อ 4) |
| `postcode` | บังคับ ≤ 20 |
| `isDefault` | partial unique index: default ได้ **1 รายการต่อ customer ต่อ type** |

กฎ: ต้องมี Invoice และ Shipping อย่างน้อยประเภทละ 1 รายการ, ไม่เกินประเภทละ 10 รายการ,
และมี default ประเภทละ 1 รายการพอดี (ถ้าผู้ใช้ไม่เลือก ระบบตั้งรายการแรกเป็น default)
Index: `lower(code)` (unique เมื่อมีค่า), `lower(name)` สำหรับค้นหา, `(active, name)` สำหรับรายการ

### 4. Currency, Country, State/City

- **Currency:** list ISO 4217 ในโค้ดของ partner (ใช้ `Intl.supportedValuesOf("currency")` และ `Intl.DisplayNames`)
  เมื่อมี Currency master ในอนาคตค่อยเปลี่ยนแหล่งข้อมูล โดยคอลัมน์ `currencyCode` เดิมใช้ต่อได้
- **Country:** list ISO 3166-1 alpha-2 เป็น constant ในโค้ด ชื่อประเทศแสดงด้วย `Intl.DisplayNames`
- **State/Province และ City:** ช่องพิมพ์ข้อความ เปิดให้กรอกหลังเลือก Country แล้ว
  (design เป็น dropdown "Choose a country first" — ไม่มีข้อมูลรัฐ/เมืองจนกว่าจะมี ADR แยก)
- ไม่ติดตั้ง package ใหม่

### 5. Frontend

- Route ใหม่ **`/setup/customer`** เพิ่มแท็บ "Customer" ใน Setup tabs และให้ sidebar Partner Master › Customer ชี้มาที่หน้านี้
- โครงหน้าใช้แบบเดียวกับ user-permission: ฟอร์มซ้าย, drawer รายการขวา (พับ/กางได้), ค้นหา,
  แถว draft, ป้าย Inactive, validation ด้วย react-hook-form + Zod (กฎตรงกับ backend)
- Drawer ใช้หัวข้อ **"Customers"** (ผู้ใช้ยืนยันว่า "Vendors" ใน design ลืมเปลี่ยน) แต่ละแถวแสดง Name เป็นบรรทัดหนาและ Code Name เป็นบรรทัดรอง
  แถว draft แสดงชื่อ customer ที่กำลังกรอก
- **ปุ่ม Delete (เพิ่มใหม่):** แสดงเมื่อเปิด customer ที่บันทึกแล้วและผู้ใช้มีสิทธิ์ `customer:DELETE`,
  กดแล้วมี dialog ยืนยันแบบเดียวกับ delete user ใน user-permission
- ปุ่มบน header:

| ปุ่ม | พฤติกรรม | สิทธิ์ |
|---|---|---|
| Create Customer / Save | สร้างใหม่ หรือบันทึกการแก้ไข | ADD / EDIT |
| Duplicate | คัดลอกฟอร์มจาก customer ที่เปิดอยู่เป็น draft ใหม่ (ล้าง Code Name เพราะห้ามซ้ำ) | ADD |
| Print | พิมพ์ข้อมูล customer ที่เปิดอยู่ด้วย print stylesheet ของเบราว์เซอร์ (ไม่มี library) | VIEW |
| Refresh | โหลดรายการและข้อมูลที่เปิดอยู่ใหม่ (ถามก่อนถ้ามีการแก้ที่ยังไม่บันทึก) | VIEW |
| Excel | **ยังไม่ทำ** แสดง disabled พร้อม tooltip | — |

- ปุ่มที่ไม่มีสิทธิ์จะถูกซ่อนหรือ disabled ตาม `permission.mine` (เป็น UX เท่านั้น gateway ยังบังคับสิทธิ์จริง)

### 6. Infrastructure และ delivery

- Compose: service ใหม่ `backend-api-partner` (port ภายใน 3201) จำกัด **0.35 vCPU / 512 MB**,
  `depends_on` postgres healthy, gateway `depends_on` partner; dev override ใช้ dev image + watch mode เหมือน service อื่น
- ตัวแปรใหม่: `PARTNER_DATABASE_URL` (ใช้ schema `partner`), `PARTNER_SERVICE_URL` (ฝั่ง gateway),
  `PARTNER_SERVICE_TOKEN` (ทั้งสองฝั่ง, ≥ 32 ตัว) ใน Compose และ `.env.example`
- Dockerfile ใหม่ `backend-api-partner/Dockerfile`; devops เพิ่ม service นี้ใน CI และ service-images matrix
- **ก่อน implement** infra ต้องวิจัยและทำ infra bundle ของ container ใหม่
  (network, non-root, resource, secret, DB role) ตาม [infra delivery](../workflow/infra-delivery.md)

## Alternatives

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| ใส่ใน auth service | ไม่เพิ่ม container ทำเร็วสุด | ผิดหลัก domain ของ ADR-0001; auth ควรดูแลแค่ user/session/license |
| Service รวม master-data (Customer, Vendor, Currency, Location, Stone …) | container เดียวสำหรับ master ทั้งหมด | ขอบเขตกว้าง; ผู้ใช้เลือก `partner` ซึ่งแยก domain ชัดกว่า |
| **Service `partner` (เลือก)** | domain ชัด, Customer และ Vendor อยู่ด้วยกัน | +1 container; master อื่นในอนาคตอาจได้ service แยกอีก ต้องดู capacity ทุกครั้ง |
| Partner ตรวจ session เองผ่าน auth | ป้องกันซ้อนอีกชั้น | เพิ่ม hop และ latency ทุก request และผูก partner กับ auth; gateway บังคับสิทธิ์อยู่แล้ว |
| Soft delete | เก็บประวัติไว้ได้ | ต้องกรองทุก query และจัดการ code ซ้ำ; ผู้ใช้เลือกลบถาวร |
| ห้ามลบ customer ที่เอกสารอ้างถึง (ให้ปิด Active แทน) | ข้อมูลอ้างอิงครบ | ผู้ใช้ต้องการลบได้เสมอ; เอกสารเก็บชื่อของตัวเองแทน |
| ระบบออกเลขที่อัตโนมัติ (`C-0001`) | เลขไม่ซ้ำโดยไม่ต้องกรอก | ผู้ใช้ยืนยันว่าบรรทัดรองคือ Code Name ที่กรอกเอง ไม่ต้องมีเลขอัตโนมัติ |
| Library ประเทศ/รัฐ/เมือง (เช่น `country-state-city`) | State/City เป็น dropdown ตรง design | dependency ข้อมูลขนาดใหญ่; ผู้ใช้เลือก list มาตรฐาน |
| Export Excel | ครบตาม design | ต้องเพิ่ม library; ผู้ใช้ให้เลื่อนไปก่อน |

## Consequences and capacity

**ข้อดี**
- Customer มีเจ้าของข้อมูลชัดเจน และพร้อมสำหรับ Vendor ในอนาคต
- ใช้ระบบสิทธิ์เดิม (`customer:VIEW/ADD/EDIT/DELETE`) ไม่ต้องแก้ permission catalog
- ไม่มี package ใหม่

**ข้อเสีย / ความเสี่ยง**
- **ลบถาวรได้เสมอ:** ไม่มีกฎห้ามลบ customer ที่ถูกใช้แล้ว เอกสารในอนาคต (Quotation, Sale ฯลฯ)
  ต้อง**บันทึกชื่อ customer (และข้อมูลที่ต้องพิมพ์ในเอกสาร) ลงตารางของตัวเองตอนสร้างเอกสาร**
  ไม่อ้างอิงแบบ FK ไปที่ `partner.Customer` เอกสารเก่าจึงยังแสดงชื่อได้หลัง customer ถูกลบ
  ข้อนี้เป็นกฎที่ ADR ของ Quotation/Sale ต้องทำตาม
- **ไม่มี distributed transaction:** create/update/delete อยู่ใน partner service เดียว จึงทำใน transaction เดียวได้
- State/City เป็นข้อความอิสระ อาจสะกดไม่สม่ำเสมอ
- Service token เป็น shared secret: ต้องเก็บนอก repository ใน production และ rotate ได้
- Rollback: ปิด route/tab ฝั่ง frontend และเอา service ออกจาก Compose; schema `partner` ไม่กระทบ auth

**Capacity (8 GB RAM / 4 vCPU)**
- Compose limits ปัจจุบัน 2.85 vCPU / 5.0 GiB → **3.2 vCPU / 5.5 GiB** เหลือ headroom ~0.8 vCPU / 2.5 GB สำหรับ OS/Docker
- Prisma pool ของ partner สูงสุด 5 connections; list จำกัด 50 แถวต่อหน้า; 1 customer ไม่เกิน 20 address
- Request body จำกัด 256 KB บน route ของ customer
- ต้องวัดการใช้ RAM จริงของ container ใหม่ก่อน production

## งานต่อเนื่องเมื่อ Accepted

1. **ui-spec:** UI spec `document/apps/frontend/customer/` และ central TODO `document/task/todo/customer.md`
2. **SA:** bundle `document/apps/backend/partner/customer/` (sequence/database diagram, API contract,
   authorization, error handling, testing) และ `document/diagram/customer-flow.md`
3. **infra:** infra bundle ของ `backend-api-partner` + อัปเดต service index — ต้องได้ก่อนแก้ Compose
4. **backend:** service ใหม่ + migration + gateway router `customer.*`
5. **frontend:** หน้า `/setup/customer`, Setup tab, sidebar link
6. **devops:** CI/image matrix สำหรับ service ใหม่

## Acceptance and approval

**Observable checks**
1. ผู้มี `customer:ADD` สร้าง customer พร้อม Invoice และ Shipping address ได้ และ drawer แสดง Name (บรรทัดหนา) กับ Code Name (บรรทัดรอง)
2. ช่องบังคับว่างหรือผิดรูปแบบ → แสดงกรอบแดงและข้อความ error ตาม design และ backend ตอบ `400` พร้อม field errors
3. Code Name ซ้ำ → `CUSTOMER_CODE_TAKEN`; ไม่มี Invoice หรือ Shipping address → `400`
4. `customer.list` ค้นหาด้วย Name/Code Name ได้, แสดง Inactive, จำนวนรวมถูกต้อง, แบ่งหน้าไม่เกิน 50
5. แก้ไขแล้วบันทึกได้; สองคนแก้พร้อมกัน คนที่บันทึกทีหลังได้ `CUSTOMER_STALE`
6. Delete ถามยืนยัน แล้วลบ customer และ address ทั้งหมดถาวร (ไม่มีเงื่อนไขห้ามลบ)
7. ผู้ไม่มีสิทธิ์ถูก gateway ปฏิเสธ (`FORBIDDEN`) และปุ่มที่ไม่มีสิทธิ์ถูกซ่อน/disabled
8. Duplicate สร้าง draft ใหม่จากข้อมูลเดิม; Print แสดงหน้าพิมพ์; Refresh โหลดใหม่; Excel disabled
9. เรียก partner โดยตรงโดยไม่มี service token → `401`; partner ไม่ publish port ใน production
10. Login, user-permission และ license ยังทำงานเหมือนเดิม

**การอนุมัติครอบคลุม**
- ADR นี้ revision 1: service `backend-api-partner`, schema `partner`, API/สิทธิ์, data model, การลบถาวร, list มาตรฐาน, ปุ่ม header
- Container ใหม่และตัวแปร `PARTNER_*` (รายละเอียด security อยู่ใน infra bundle ซึ่งจะนำเสนอก่อนแก้ Compose)
- ไม่มี package ใหม่

อนุมัติ revision 1 แล้ว 2026-10-14 ("อนุมัติ ADR-0018") การอนุมัตินี้ครอบคลุมการตัดสินใจใน ADR
ส่วน UI spec, SA bundle และ infra bundle ที่เขียนตามมาต้องให้เจ้าของตรวจก่อน implement ส่วนที่พึ่งพาเอกสารเหล่านั้น
