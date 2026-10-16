# ADR-0021: Code Name บังคับ + เลขรันแนะนำ (C001/V001) และโหมด view/edit แบบ User & Permission สำหรับ Customer/Vendor

- **Status:** Accepted — 2026-10-16
- **Date:** 2026-10-16
- **Feature / source UI revision:** `customer` / 2, `vendor` / 3
- **SA revision:** customer 2, vendor 2
- **Deciders:** project owner
- **Approval evidence:** owner 2026-10-16: "frontend backend ช่วยแก้เเบบให้เป็นแบบในรูปเเละเรื่องปุ่มทำเหมือนใน userandpermission ที่มี save cancel edit delete และ ปรับ codename เป็น require * เเล้วขึ้นแนะนำเป็นเลข running เช่น vendor คนเเรกเป็น V001 customer คนแรกเป็น C001 และปรับ SAMPLE_VENDOR_A คือ codename V-0001 · Sample Vendor A Co., Ltd. คือ name ตัวcustomer ด้วยนะ ทำ adr เเล้วเริ่มทำเลย" (ทำ ADR แล้วเริ่มทำทันที = อนุมัติ ADR นี้และ revision ที่อ้างถึง)
- **Source:** [customer/source/rev2-01](../apps/frontend/customer/source/rev2-01-add-customer-view-edit-header.png), [rev2-02](../apps/frontend/customer/source/rev2-02-drawer-row-code-name.png); vendor ใช้ภาพเดียวกัน ([vendor/source/rev3-*](../apps/frontend/vendor/source/))
- **Related:** [ADR-0018](0018-customer-master-partner-service.md), [ADR-0019](0019-vendor-master.md), [ADR-0020](0020-username-login-and-permission-matrix-v2.md) §header/modes (รูปแบบปุ่มอ้างอิง); ไม่ supersede ADR ใด — เปลี่ยนเฉพาะกฎ `code` และพฤติกรรมหน้าจอ

## Context

- ปัจจุบัน `code` ของ Customer/Vendor **ไม่บังคับ** (`String?`, unique แบบไม่สนตัวพิมพ์ผ่าน `code_key`)
- หน้า Customer/Vendor ปัจจุบันเป็นฟอร์มแก้ได้ตลอด ไม่มีโหมด view/edit แบบหน้า User & Permission (ADR-0020)
- เจ้าของต้องการ: Code Name บังคับ (*) + ระบบแนะนำเลขรัน, ปุ่ม header เหมือน User & Permission,
  และแถวใน drawer แสดง Code Name เป็นบรรทัดหลัก, Name เป็นบรรทัดรอง — ทั้ง Customer และ Vendor

## Decision

### 1. Code Name บังคับ

- `code` required ทั้ง create และ update: trim, 1–120 ตัวอักษร, unique แบบไม่สนตัวพิมพ์ (ใช้ `code_key` เดิม)
- ซ้ำ → `CUSTOMER_CODE_TAKEN` / `VENDOR_CODE_TAKEN` (409, `{path:"code",code:"duplicate"}`) — error เดิม
- ว่าง → `VALIDATION_ERROR` `{path:"code",code:"required"}` (frontend แสดง "Code Name is required")
- DB: migration ใหม่ backfill แถวที่ `code IS NULL` ด้วยเลขรันถัดไปตามข้อ 2 เรียงตาม `created_at, id`
  แล้วตั้ง `code` และ `code_key` เป็น `NOT NULL` (ไม่ลบข้อมูล)

### 2. เลขรันแนะนำ (suggestion ไม่ใช่การจอง)

- รูปแบบ: prefix `C` (Customer) / `V` (Vendor) + เลขอย่างน้อย 3 หลัก เติม 0 ข้างหน้า: `C001`, `C002`, …, `C999`, `C1000`
  (เจ้าของระบุ "V001"/"C001"; `V-0001` ในภาพถือเป็นข้อมูลตัวอย่าง)
- เลขถัดไป = (เลขมากที่สุดของ `code` ที่ตรง `^[Cc][0-9]+$` / `^[Vv][0-9]+$`) + 1; ไม่มี → 1
  code ที่ผู้ใช้ตั้งเองรูปแบบอื่นไม่ถูกนับ
- API ใหม่ (อ่านอย่างเดียว):
  - partner: `GET /customers/next-code`, `GET /vendors/next-code` → `{ code: "C001" }`
  - gateway tRPC: `customer.nextCode` / `vendor.nextCode` (query, input ไม่มี) สิทธิ์ `permittedProcedure(<menu>, "ADD")`
- ไม่จองเลข: ถ้ามีคนบันทึกเลขเดียวกันก่อน จะได้ `*_CODE_TAKEN` → frontend refetch `nextCode` และแสดง error ที่ช่อง Code Name
- Frontend: โหมด Create เติมค่าแนะนำในช่อง Code Name ให้ (แก้ได้) ; ช่องมี `*`

### 3. Header และโหมดหน้าจอ (เหมือน User & Permission / ADR-0020)

- Title: create → "Add Customer" / "Add Vendor"; view/edit → ชื่อ record; ข้าง title "Customer List N" / "Vendor List N"
- ไอคอน Print, Excel, Duplicate, Refresh (พฤติกรรมเดิมของหน้า; ที่ยังไม่มีให้ disabled + tooltip)
- ปุ่ม: **Create Customer / Create Vendor** (ภาพใช้ "Create User" ซึ่งเป็นข้อความคัดลอกจากหน้า User — ใช้ชื่อตาม entity),
  **Cancel**, **Save**, **Edit**, **Delete**
  - Create mode: Cancel + Save ใช้ได้; Create/Edit/Delete disabled
  - View mode: ฟอร์ม read-only; Create/Edit/Delete ใช้ได้ (ตามสิทธิ์ ADD/EDIT/DELETE); Cancel/Save disabled
  - Edit mode: Cancel (คืนค่าที่บันทึกไว้) + Save; Create/Edit/Delete disabled
- ปุ่มที่ไม่มีสิทธิ์ซ่อนหรือ disabled ตาม ADR-0016 เดิม; Delete ใช้ dialog ยืนยันเดิมของหน้า

### 4. Drawer row

- บรรทัดหลัก (ตัวหนา) = **Code Name**; บรรทัดรอง = **Name**; จุดสีเขียว = Active, badge "Inactive" เมื่อปิด
- ค้นหาใน drawer ครอบคลุม code และ name (เหมือนเดิม)
- ใช้ทั้ง Customer และ Vendor

### 5. นอกขอบเขต

- ไม่เปลี่ยน service/container/network/dependency → ไม่ต้องผ่าน infra/devops
- ไม่เปลี่ยนสิทธิ์ (catalog v2 ของ ADR-0020 ใช้ต่อ), ไม่เปลี่ยนโครงสร้าง address
- ข้อความ "Vender" ใน sidebar และหัว drawer "Vendors" บนหน้า Customer ในภาพถือเป็นความคลาดเคลื่อนของ mock — คงชื่อเดิม (Vendor / Customers)

## Consequences

- ทุก record มี Code Name เสมอ → drawer/ค้นหา/รายงานใช้ code ได้ตรงไปตรงมา
- ข้อมูลเดิมที่ไม่มี code จะได้เลข `C…`/`V…` อัตโนมัติจาก migration
- เลขแนะนำอาจชนได้ภายใต้การสร้างพร้อมกัน — ยอมรับได้เพราะ unique constraint กันข้อมูลซ้ำ และ UI แนะนำเลขใหม่ให้
- Contract change: `code` เปลี่ยนจาก optional เป็น required ใน create/update ของ `customer.*`/`vendor.*` และเพิ่ม `nextCode`
