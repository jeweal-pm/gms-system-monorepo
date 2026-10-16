# ADR-0020: Login ด้วย Username และ Permission matrix v2 ตาม design ใหม่ของหน้า User and Permission

- **Status:** Accepted — revision 1 approved 2026-10-15 ("frontend backend อนุมัติ ADR-0020")
- **Date:** 2026-10-15
- **Feature / source UI revision:** `user-permission` / 2 (screenshot 4 ภาพจากผู้ใช้ 2026-10-15: ตาราง permission ทั้งหมด, ฟอร์มเพิ่ม user, Super Admin แบบล็อก, dialog ลบ user)
- **SA revision:** 1 (ของ ADR นี้)
- **Deciders:** Project owner
- **Approval evidence:** 2026-10-15 ผู้ใช้: "frontend backend อนุมัติ ADR-0020" (revision 1; ถือเป็นคำสั่ง implement ด้วย) — ข้อมูลตั้งต้นจากผู้ใช้ 2026-10-15: "frontend backend ปรับ design กับ api ให้ตรงตามแบบหน่อย เเล้วก็ ตรง Username ไม่บังคับให้ต้องเป็นฟอร์ม gmail นะ กรอก แบบ user1 ได้เลย เปิด adr มา" และตอบคำถามว่า (1) "email ไม่ได้ใช้เเล้ว … ใส่เป็น gmail ก็ได้ หรือ username ก็ได้ เป็นในช่อง Username" (ขอให้แนะนำวิธี) (2) ล้างสิทธิ์เดิมทั้งหมด (3) Super Admin ได้ทุกสิทธิ์รวม PRINT/EXCEL
- **Supersedes / related ADRs:** แก้ไข [ADR-0016](0016-per-user-menu-action-permissions.md) ข้อ 1–3 (catalog, action, Super Admin) และ [ADR-0017](0017-super-admin-managed-users.md) ข้อ 4 (identity = email) และข้อ 8 (Super Admin read-only); แก้ [ADR-0013](0013-per-user-license-with-signed-token.md) เรื่องตัวระบุ license จาก email เป็น username; related [ADR-0008](0008-use-better-auth.md), [ADR-0012](0012-change-flow-login.md), [ADR-0015](0015-remove-forgot-password-and-email.md)

## Context

Design ใหม่ของหน้า User and Permission ต่างจากที่ทำไว้ (ADR-0016/0017) ดังนี้

| เรื่อง | ตอนนี้ | Design ใหม่ |
|---|---|---|
| Action | 6: VIEW, ADD, EDIT, DELETE, CANCEL, PRICE | **9:** VIEW, ADD, EDIT, DELETE, CANCEL, **APPROVE**, PRICE, **PRINT**, **EXCEL** |
| เมนู | 34 เมนูตาม sidebar เดิม (Stone Master แยก 9 เมนูย่อย ฯลฯ) | 39 เมนูใหม่ แบ่งหมวด SETUP / PRE-SALE / Memo / PURCHASE / INVENTORY / SALE / ACCOUNT / REPORT + Dashboard (รายการเต็มด้านล่าง) |
| Dashboard | มีครบทุก action | มีแค่ VIEW, APPROVE, PRICE, PRINT, EXCEL (ADD/EDIT/DELETE/CANCEL เป็น "—") |
| แถวพิเศษ | — | "Select All" และแถวแม่ของกลุ่มย่อย (เช่น Master Code "7 sub-menus") ติ๊กแล้วได้ทั้งกลุ่ม |
| ปุ่ม header | Create User / Save | **Create User, Cancel, Save, Edit, Delete** (โหมดดู/โหมดแก้) + ไอคอน Print, Excel, Duplicate, Refresh |
| Super Admin | ทั้งแถวอ่านอย่างเดียว | สิทธิ์ล็อกครบ แต่ **แก้ข้อมูลส่วนตัวได้** — banner "Super Admin always has every permission and can't be turned off. Personal information can still be edited." |
| Username | ต้องเป็น email (ใช้ login และผูก license) | ช่อง "Username" กรอก `user1` ได้ ไม่บังคับรูป email |
| Dialog ลบ | — | "Delete User 001?" / "The account and its permissions will be removed. This can't be undone." / Keep user, Delete |

ระบบตอนนี้ login ด้วย `POST /api/auth/sign-in/email`, lockout (ADR-0012) และ license (ADR-0013, ส่ง email ไป license server) ผูกกับ email ทั้งหมด

## Decision

### 1. Username เป็นตัวระบุตัวตนเพียงตัวเดียว (คำแนะนำสำหรับคำถามของผู้ใช้)

- ช่อง **Username** รับได้ทั้ง `user1` และค่าที่หน้าตาเหมือน email เช่น `somchai@gmail.com` — ระบบถือเป็น **ข้อความชื่อผู้ใช้** ไม่ตรวจว่าเป็น email และไม่ส่ง email ใด ๆ (ADR-0015 ยังมีผล)
- กฎ: 3–64 ตัวอักษร, ใช้ได้ `a-z 0-9 . _ - @ +`, ไม่มีช่องว่าง, เก็บเป็นตัวพิมพ์เล็ก (normalize ก่อนตรวจซ้ำและก่อน login), **ห้ามซ้ำ**, **แก้ไม่ได้หลังสร้าง** (เพราะผูก license)
- ใช้ Better Auth **`username` plugin** ที่มีอยู่ใน `better-auth` 1.7.7 แล้ว (ไม่เพิ่ม package): เพิ่มคอลัมน์ `username` (unique) ใน `auth.User`, login ผ่าน `POST /api/auth/sign-in/username`, ตั้ง `usernameValidator` ให้ตรงกฎข้างบน
- Better Auth ยังบังคับคอลัมน์ `email`: ระบบเติมค่าภายใน `<user id>@users.invalid` ให้อัตโนมัติ ไม่แสดงในหน้าจอ ไม่ใช้ส่งอะไร และไม่ให้แก้ (โดเมน `.invalid` สงวนไว้ไม่ให้ใช้งานจริง)
- ปิด `/sign-in/email` (`disabledPaths`) เหลือทาง login เดียว
- หน้า Login: เปลี่ยนป้าย "Email" เป็น **"Username"** และไม่ตรวจรูปแบบ email
- Lockout 3 ครั้ง / 1 นาที (ADR-0012) และ rate limit ย้ายไปใช้กับ `/sign-in/username` โดย hash จาก username แทน email
- **ข้อมูลเดิม:** migration เติม `username` ของ user ที่มีอยู่ = email เดิม (ตัวพิมพ์เล็ก) เช่น `superadmin@demo.com` จึง login ด้วยค่าเดิมได้ต่อ แล้วเปลี่ยน `email` เป็นค่าภายใน
- **CRM provisioning** (`POST /api/v1/users`, ADR-0015): รับ field `username` แทน `email`; ช่วงเปลี่ยนผ่านยังรับ `email` ได้โดยถือเป็น username (ใส่ทั้งสองค่าแต่ไม่ตรงกัน → `400`) แล้วค่อยเลิกรับ `email` ใน ADR ถัดไปเมื่อ CRM เปลี่ยนแล้ว
- Dev seed: `superadmin@demo.com` / `user@demo.com` ใช้เป็น username ต่อ (ไม่ต้องเปลี่ยน)

### 2. License ผูกกับ username

- License ยังเป็น "1 user 1 key ผูกกับ instance" ตาม ADR-0013 แต่ตัวระบุบุคคลเปลี่ยนจาก email เป็น **username** (ซึ่งแก้ไม่ได้ เหมือนกฎ email เดิมใน QL2)
- License client ส่ง username ไปใน field เดิมของ license server (`email`) ไปก่อน — license server ปัจจุบันเป็น mock (ADR-0014) จึงไม่กระทบ; **ต้องแจ้งทีม license server** ให้เปลี่ยนชื่อ field เป็น `username`/`subject` และไม่ตรวจรูปแบบ email ก่อนต่อ server จริง
- Mock scenario ที่ใช้ local-part ของ email (`license-expired@…` ฯลฯ) เปลี่ยนเป็นตรวจ username ทั้งคำ เช่น `license-expired`

### 3. Permission catalog v2 และ 9 action

- Action: `VIEW, ADD, EDIT, DELETE, CANCEL, APPROVE, PRICE, PRINT, EXCEL` (เพิ่ม enum `APPROVE`, `PRINT`, `EXCEL`)
- Catalog v2 (key = slug, ทุกเมนูมี 9 action ยกเว้น Dashboard):

| หมวด | เมนู (key) |
|---|---|
| — | Dashboard (`dashboard`: VIEW, APPROVE, PRICE, PRINT, EXCEL) |
| SETUP | Company Profile (`company-profile`), User and Permission (`user-and-permission`), Notifications (`notifications`), **Master Code**: Vendor (`vendor`), Customer (`customer`), Stone Master (`stone-master`), Location Master (`location-master`), Certificate Type (`certificate-type`), Labor Name (`labor-name`), Sale Person (`sale-person`) |
| PRE-SALE | Quotation (`quotation`), Reserve (`reserve`) |
| Memo | Memo Receive (`memo-receive`), Memo Return (`memo-return`), Memo Out (`memo-out`), Memo Out-Return (`memo-out-return`), **Memo Outstanding**: From Vendor (`memo-outstanding-vendor`), From Customer (`memo-outstanding-customer`) |
| PURCHASE | Purchase Order (PO) (`purchase-order`), Purchase (`purchase`), Purchase Outstanding (`purchase-outstanding`) |
| INVENTORY | Load to Stock (`load-to-stock`), Merge/Split (`merge-split`), Stock Transfer Location (`stock-transfer-location`), Stock Adjustment (`stock-adjustment`), Barcode (`barcode`) |
| SALE | Sale (`sale`) |
| ACCOUNT | Payable (`payable`), Receivable (`receivable`), **Account Outstanding**: Outstanding Payable (`outstanding-payable`), Outstanding Receivable (`outstanding-receivable`) |
| REPORT | **Stock Movement**: Primary Stock (`stock-movement-primary`), Consignment Stock (`stock-movement-consignment`); **Closing Stock**: Primary Stock (`closing-stock-primary`), Consignment Stock (`closing-stock-consignment`); **Sale Report**: Compare with costing (`sale-report-costing`), Shareholder Report (`sale-report-shareholder`), Commission Report (`sale-report-commission`) |

- รวม 39 เมนูที่ติ๊กได้ = 5 + 38 × 9 = **347 ช่อง** (ตัวเลข "176 of 176" ใน design เป็นค่าตัวอย่าง หน้าจอจะคำนวณจาก catalog จริง)
- หัวกลุ่ม (Master Code, Memo Outstanding, Account Outstanding, Stock Movement, Closing Stock, Sale Report) และ "Select All" **ไม่ใช่สิทธิ์ที่เก็บใน DB** เป็นตัวช่วยติ๊กในหน้าจอ แสดงสถานะติ๊กครบ/บางส่วน/ไม่ติ๊ก
- Key `vendor` และ `customer` คงเดิม gateway procedure ของ ADR-0018/0019 จึงไม่ต้องแก้
- **ล้างสิทธิ์เดิมทั้งหมด** ใน migration (`DELETE FROM auth."UserPermission"`) ตามที่ผู้ใช้เลือก; Super Admin ไม่กระทบเพราะได้สิทธิ์โดยปริยาย; dev seed ให้ `user@demo.com` ได้ `dashboard:VIEW`
- Super Admin ได้ **ครบทั้ง 9 action** รวม PRINT/EXCEL (design ที่ไม่ติ๊ก PRINT/EXCEL ถือว่าลืมติ๊ก)
- เมนู "User and Permission" ในตาราง: รอบนี้การจัดการ user **ยังเป็นของ Super Admin เท่านั้น** (ตาม ADR-0017) — สิทธิ์ที่ติ๊กในแถวนี้ถูกเก็บไว้แต่ยังไม่เปิดให้ user ทั่วไปจัดการ user ได้ (ต้องมี ADR แยกถ้าต้องการ)

### 4. หน้า User and Permission ตาม design

- **โหมด:** เปิด user ที่บันทึกแล้ว = โหมดดู (ฟอร์ม read-only, ปุ่ม Create User / Edit / Delete ใช้ได้, Cancel/Save จาง); กด **Edit** = โหมดแก้ (Cancel/Save ใช้ได้); Create User = ฟอร์มว่างในโหมดแก้
- **Super Admin:** สิทธิ์ทุกช่องติ๊กและล็อก พร้อม banner ตาม design; **แก้ได้:** Name, Phone, Photo, Location, Active ไม่ได้ (Super Admin ปิดตัวเองไม่ได้); รหัสผ่านของ Super Admin ยังเปลี่ยนผ่านหน้า Profile เท่านั้น (ADR-0011); Delete ปิดสำหรับ Super Admin และตัวเอง
- Password: ไม่บังคับตอนแก้ (เว้นว่าง = ไม่เปลี่ยน), บังคับตอนสร้าง, 4–64 ตัว (ADR-0017 คงเดิม)
- **Dialog ลบ:** "Delete {username}?" / "The account and its permissions will be removed. This can't be undone." / ปุ่ม **Keep user** และ **Delete**
- ปุ่มไอคอน Print / Excel / Duplicate / Refresh แสดงตาม design; Duplicate คัดลอกสิทธิ์และข้อมูลไปเป็น draft ใหม่ (ล้าง Username/Password) — Print/Excel ของหน้านี้ทำงานตามสิทธิ์ `user-and-permission:PRINT/EXCEL` (Super Admin มีครบ) โดย Excel export ทำใน ADR แยก ตอนนี้แสดงแบบ disabled เหมือนหน้า Customer
- ค้นหาเมนู, ตัวกรอง "All Permissions", Expand All / Collapse All, ตัวนับ "x of 347 permissions on"

### 5. API ที่เปลี่ยน

| จุด | เปลี่ยน |
|---|---|
| `userAdmin.create/update/get/list` | `email` → `username`; update รับข้อมูลส่วนตัวของ Super Admin (ไม่รับ permissions/active/password ของ Super Admin) |
| `permission.catalog` | คืน catalog v2 (`version: 2`) พร้อม action ที่ใช้ได้ต่อเมนู |
| `permission.mine` / session-context `authz` | ใช้ key v2; Super Admin คืน `"ALL"` เหมือนเดิม |
| `POST /api/v1/users` (CRM) | รับ `username` (+ `email` แบบ deprecated ดูข้อ 1) |
| Better Auth | เพิ่ม `/sign-in/username`, ปิด `/sign-in/email` |
| Dashboard shortcut filter | ใช้ `dashboard:VIEW` และ key v2 |

## Alternatives

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **Username เดียว + username plugin + email ภายใน (เลือก/แนะนำ)** | ตรง design, ผู้ใช้กรอกอะไรก็ได้ในช่องเดียว, ไม่เพิ่ม package, ข้อมูลเดิม login ได้ต่อ | ต้องแก้ license client และแจ้งทีม license server; ต้องย้าย lockout ไป endpoint ใหม่ |
| Login ได้ทั้ง email หรือ username (แยก 2 ช่อง/2 endpoint) | ยืดหยุ่น | ผู้ใช้บอกว่าไม่ใช้ email แล้ว; ซ้ำซ้อน, ต้องตรวจซ้ำสองคอลัมน์ |
| เพิ่มช่อง Email ไว้ผูก license แยกจาก Username | license server ไม่ต้องแก้ | ไม่มีใน design และผู้ใช้ไม่ต้องการ email |
| ใช้ username ใส่คอลัมน์ email ตรง ๆ (ไม่ใช้ plugin) | แก้น้อย | Better Auth ตรวจรูปแบบ email ตอน sign-in จึงกรอก `user1` ไม่ได้ |
| ย้ายสิทธิ์เดิมไป key ใหม่ | user ไม่ต้องตั้งใหม่ | ผู้ใช้เลือกล้างทั้งหมด; mapping หลายเมนูไม่ตรงกัน |

## Consequences and capacity

**ข้อดี**
- หน้าจอและ API ตรง design; กรอก Username แบบ `user1` ได้
- ไม่มี package ใหม่ ไม่มี container ใหม่

**ข้อเสีย / ความเสี่ยง**
- **License server ภายนอก** ต้องยอมรับค่าที่ไม่ใช่ email ก่อนต่อของจริง (ตอนนี้เป็น mock)
- **CRM** ต้องเปลี่ยนไปส่ง `username`; ช่วงเปลี่ยนผ่านยังรับ `email`
- **สิทธิ์ของ user ทุกคนหายหลัง migrate** (ตามที่เลือก) Super Admin ต้องตั้งให้ใหม่
- Gateway ที่ยังเป็นเวอร์ชันเก่าจะไม่รู้จัก key ใหม่ → ต้อง deploy auth + gateway + frontend พร้อมกัน
- ADR-0012 test cases และ login spec ต้องเปลี่ยนจาก email เป็น username
- Rollback: revert โค้ดทั้ง 3 ส่วน; คอลัมน์ `username` และค่า enum ใหม่ทิ้งไว้ได้ (additive) แต่สิทธิ์ที่ล้างไปแล้วไม่กลับมา และ email เดิมต้องคืนจาก `username` (เก็บสำเนาไว้ในคอลัมน์ `username` อยู่แล้ว)

**Capacity:** ต่อ user สูงสุด 347 grant (เดิม 204) ยังอยู่ใต้ขอบ 64 เมนู × 9 = 576 ของ ADR-0016; query session-context ยังเป็น PK-prefix query เดียว ไม่มีผลต่อ RAM/CPU ที่วัดได้

## งานต่อเนื่องเมื่อ Accepted

1. ui-spec: UI revision 2 ของ `user-permission` (ui-spec, testing) + TODO
2. SA: แก้ bundle `document/apps/backend/auth/user-permission/` (api-contract, database-diagram, decisions) เป็น revision 2; อัปเดต login spec, API contract spec, login-flow diagram, ADR-0012 test cases
3. backend: migration (username, enum, ล้างสิทธิ์, email ภายใน), username plugin + lockout, catalog v2, user-admin/CRM API, license identity
4. frontend: หน้า login (Username), หน้า User and Permission ตาม design, matrix v2
5. แจ้งทีม CRM และทีม license server (ผู้ใช้หรือ PM เป็นผู้แจ้ง)

## Acceptance and approval

**Observable checks**
1. สร้าง user ด้วย Username `user1` ได้ และ login ด้วย `user1` + password ได้; `User1` login ได้เหมือนกัน (ตัวพิมพ์เล็ก)
2. Username ซ้ำ, สั้นกว่า 3 ตัว หรือมีช่องว่าง → error ที่ช่อง Username; Username แก้ไม่ได้หลังสร้าง
3. `superadmin@demo.com` และ `user@demo.com` login ได้เหมือนเดิมหลัง migrate; `/api/auth/sign-in/email` ใช้ไม่ได้
4. Lockout 3 ครั้ง / 1 นาที ทำงานกับ username
5. ตาราง permission แสดงหมวดและเมนูตาม design, 9 คอลัมน์, Dashboard มี "—" 4 ช่อง, หัวกลุ่มและ Select All ติ๊กทั้งกลุ่มได้, ตัวนับถูกต้อง
6. หลัง migrate ไม่มี grant เหลือ; Super Admin ยังเข้าได้ทุกหน้า; user ที่ได้ `customer:VIEW` ใหม่เข้าหน้า Customer ได้
7. Super Admin: สิทธิ์ล็อกครบ 9 action พร้อม banner, แก้ Name/Phone/Photo/Location ได้, ปิด Active/ลบ/เปลี่ยนสิทธิ์ไม่ได้
8. ปุ่ม Create User / Cancel / Save / Edit / Delete ทำงานตามโหมด; dialog ลบตรงข้อความ design
9. CRM ส่ง `username` สร้าง user ได้; ส่ง `email` อย่างเดียวยังได้ (deprecated)
10. Customer, Vendor และ license ยังทำงานเหมือนเดิม

**การอนุมัติครอบคลุม**
- ADR นี้ revision 1 และงานต่อเนื่องที่ระบุ
- ไม่มี package ใหม่ (ใช้ username plugin ใน `better-auth` ที่ติดตั้งอยู่)

อนุมัติ revision 1 แล้ว 2026-10-15 พร้อมคำสั่งให้ frontend และ backend implement; เอกสาร UI revision 2 และ SA bundle revision 2 ที่ทำตามมาต้องตรงกับ ADR นี้ การเปลี่ยนที่มีนัยสำคัญต้องออก revision ใหม่
