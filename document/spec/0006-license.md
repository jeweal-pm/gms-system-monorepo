# License (ราย User)

- **Status:** Approved for auth-license backend implementation
- **Owner:** Project owner
- **Revision:** 2 — SA review approved; backend implementation in progress
- **Last updated:** 2026-10-11
- **Approval history:** SA revision 1 approval is historical; revision 2 and its QL2 correction were approved by the owner on 2026-10-11.

## เอกสารที่เกี่ยวข้อง

- **Mockup:** ยังไม่ได้รับ Figma URL หรือภาพ mockup
- **ADR:** [ADR-0013 License ราย user](../adr/0013-per-user-license-with-signed-token.md), [ADR-0014 Mock](../adr/0014-mock-license-client.md)
- **API ของ license-server:** [0005-license-server-api.md](0005-license-server-api.md)
- **Login:** [0002-login-requirements.md](0002-login-requirements.md) (license ถูกตรวจหลังรหัสผ่านถูก)
- **การ implement ฝั่ง backend:** [auth license integration](../apps/backend/auth/license-integration/architecture.md)
- **Test cases:** [backend verification plan](../apps/backend/auth/license-integration/testing.md)

---

# ส่วนที่ 1: Requirement

## 1. ภาพรวม

ลูกค้าแต่ละรายใช้แอปบน server แยกของตัวเอง (instance) ผู้ใช้แต่ละคนต้องมี license
ของตัวเองจึงจะใช้งานได้ license ของแต่ละคนเริ่มและหมดอายุไม่พร้อมกัน
และมีช่วงทดลองใช้ (trial) ก่อนซื้อจริง

**เป้าหมาย**
- ผู้ใช้ที่ไม่มี license ที่ใช้ได้ ใช้งานแอปไม่ได้
- ผู้ใช้รู้ล่วงหน้าก่อน license หมดอายุ
- แอดมินของลูกค้าเห็นว่าใครใช้ได้ถึงเมื่อไหร่
- ทีมขายต่ออายุ, เปลี่ยน trial เป็น paid หรือยกเลิกได้จากที่เดียว โดยผู้ใช้ไม่ต้องทำอะไร
- license-server ล่มชั่วคราวต้องไม่กระทบการใช้งานของลูกค้า

## 2. ขอบเขต

**อยู่ใน product scope (`backend-api-auth`, `backend-api-gateway` และ web frontend)**
- ตรวจ license ตอน login และทุก request
- หน้ากรอก license key (activate)
- หน้าแจ้ง license หมดอายุ / ถูกยกเลิก
- banner แจ้งเตือนก่อนหมดอายุ
- หน้ารายการ license ของ user ทั้งหมดสำหรับแอดมินของลูกค้า

**ไม่อยู่ใน scope**
- ระบบหลังบ้านของ license-server สำหรับทีมขาย (เอกสารแยก)
- การชำระเงินออนไลน์
- license สำหรับใช้งานแบบ offline ถาวร

## 3. ผู้เกี่ยวข้อง

| Actor | คำอธิบาย |
|---|---|
| User | ผู้ใช้งานแอปของลูกค้า มี license ของตัวเอง |
| Customer Admin | แอดมินฝั่งลูกค้า ดูสถานะ license ของ user ทุกคนใน instance |
| Sales / Support | ทีมเรา ออก ต่ออายุ ยกเลิก license ผ่าน license-server |
| `backend-api-auth` | NestJS service บน server ลูกค้า; เรียก license server และเป็นเจ้าของ signed-token cache |
| `backend-api-gateway` | NestJS/tRPC gateway; บังคับ license verdict ที่ backend procedure boundary |
| license-server | service กลางของทีมเรา ออกและเซ็น license token |

## 4. User Stories

- **US-L01** ในฐานะ User ฉันต้องการกรอก license key ครั้งเดียว แล้วใช้งานได้จนหมดอายุ
- **US-L02** ในฐานะ User ฉันต้องการรู้ล่วงหน้าก่อน license หมดอายุ เพื่อติดต่อต่ออายุทัน
- **US-L03** ในฐานะ User ที่ license หมดอายุ ฉันต้องการรู้ว่าต้องติดต่อใคร
- **US-L04** ในฐานะ Customer Admin ฉันต้องการเห็นสถานะและวันหมดอายุของ license ทุกคน
- **US-L05** ในฐานะ Sales ฉันต้องการเปลี่ยน trial เป็น paid โดยผู้ใช้ไม่ต้องกรอก key ใหม่
- **US-L06** ในฐานะ User ฉันต้องการใช้งานได้ตามปกติแม้ license-server มีปัญหาชั่วคราว

---

# ส่วนที่ 2: Specification

## 5. ประเภทและสถานะของ License

| type | คำอธิบาย |
|---|---|
| `trial` | ทดลองใช้ [14] วัน ได้ครั้งเดียวต่อ email ต่อ instance |
| `paid` | ซื้อแล้ว อายุตามที่ขาย |

| status (ที่ license-server) | ความหมาย |
|---|---|
| `pending` | ออก key แล้ว ผู้ใช้ยังไม่ได้ activate |
| `active` | ใช้งานได้ (ยังต้องดู expires_at) |
| `suspended` | ระงับชั่วคราว เช่น ค้างชำระ |
| `revoked` | ยกเลิกถาวร |

สถานะที่ auth คำนวณจาก token/upstream และ gateway ใช้บังคับสิทธิ์:

| License state ที่ backend ใช้ | เงื่อนไข | ผล |
|---|---|---|
| `VALID` | active และยังไม่ถึง expires_at | ใช้งานได้ |
| `EXPIRING` | VALID และเหลือ ≤ 14 วัน | ใช้งานได้ + แสดง banner |
| `EXPIRED` | เลย expires_at | เข้าได้เฉพาะหน้าแจ้งหมดอายุ |
| `REVOKED` | revoked หรือ suspended | เข้าได้เฉพาะหน้าแจ้งถูกยกเลิก |
| `REQUIRED` | ไม่มี license หรือ pending | ไปหน้ากรอก key |
| `GRACE` | ติดต่อ license-server ไม่ได้ แต่ token ล่าสุดยังอยู่ในช่วง grace | ใช้งานได้ตามข้อมูลใน token |
| `UNVERIFIABLE` | ติดต่อไม่ได้ และเลยช่วง grace หรือไม่มี token เลย | ใช้งานไม่ได้ แจ้งให้ติดต่อ support |

## 6. Business Rules

| ID | กฎ | อ้างอิง |
|---|---|---|
| BR-L01 | license ผูกกับ (instance_id, email) ใช้ข้าม instance ไม่ได้ | ADR-0013 |
| BR-L02 | 1 email ใน 1 instance มี license ที่ active ได้ 1 อันเท่านั้น | |
| BR-L03 | key ใช้ activate ได้ครั้งเดียว หลังจากนั้นผู้ใช้ไม่ต้องกรอกอีก | ADR-0013 |
| BR-L04 | trial ได้ครั้งเดียวต่อ email ต่อ instance | |
| BR-L05 | เปลี่ยน trial เป็น paid ให้แก้ license เดิม ไม่ออก key ใหม่ | US-L05 |
| BR-L06 | auth ขอ token ใหม่ทุกครั้งที่ login และเมื่อ token เก่ากว่า 24 ชั่วโมง | |
| BR-L07 | ติดต่อ license-server ไม่ได้ ใช้ token ล่าสุดได้อีก 7 วันนับจาก fetched_at | ADR-0013; owner approved 7-day grace for this bundle |
| BR-L08 | token ที่ลายเซ็นไม่ถูกต้องหรือ instance ไม่ตรง ถือว่าไม่มี license | |
| BR-L09 | ฐานข้อมูลของลูกค้าห้ามเก็บ license key เก็บได้เฉพาะ signed token | ADR-0013 |
| BR-L10 | 1 user มี active session ได้ครั้งละ 1 session; login ใหม่ invalidate session เก่า | Owner decision, 2026-10-11 |
| BR-L11 | กรอก key ผิดครบ 3 ครั้ง ล็อกการ activate 1 นาที | Owner decision, 2026-10-11 |
| BR-L12 | ระหว่าง EXPIRED / REVOKED ยังเรียกได้: logout, ดูสถานะ license, activate | |

## 7. Acceptance Criteria

**AC-L01 Login แล้ว license ใช้ได้**
- Given ผู้ใช้มี license ที่ VALID
- When login สำเร็จ
- Then ไปหน้า Dashboard ตามปกติ

**AC-L02 Login ครั้งแรก ยังไม่ได้ activate**
- Given ผู้ใช้มี license สถานะ pending
- When login สำเร็จ
- Then ไปหน้ากรอก license key (`/license/activate`)

**AC-L03 Activate สำเร็จ**
- Given ผู้ใช้อยู่หน้ากรอก key
- When กรอก key ที่ถูกต้องแล้วกด "เปิดใช้งาน"
- Then บันทึก token, แสดง Toast `MSG-LC05` และไปหน้า Dashboard

**AC-L04 Activate ไม่สำเร็จ**
- Given กรอก key ผิด
- Then แสดง `MSG-LC04` ใต้ช่อง key และไม่บันทึกอะไร
- And ผิดครบตาม BR-L11 แสดง `MSG-LC06`

**AC-L05 ใกล้หมดอายุ**
- Given license เหลือ ≤ 14 วัน
- When ผู้ใช้อยู่หน้าใดก็ได้
- Then แสดง banner `MSG-LC10` ด้านบนทุกหน้า ปิดได้ แต่กลับมาแสดงในวันถัดไป

**AC-L06 หมดอายุ**
- Given license เลย expires_at
- When ผู้ใช้เปิดหน้าใดก็ได้ หรือเรียก API ใดก็ได้ (ยกเว้น BR-L12)
- Then หน้าเว็บไปที่ `/license/expired` และ API ตอบ 403 `LICENSE_EXPIRED`

**AC-L07 ถูกยกเลิกระหว่างใช้งาน**
- Given ผู้ใช้กำลังใช้งาน และทีมขายยกเลิก license
- When ถึงรอบขอ token ใหม่ (ภายใน 24 ชม.)
- Then ผู้ใช้ถูกพาไป `/license/revoked`

**AC-L08 trial เปลี่ยนเป็น paid**
- Given ผู้ใช้ใช้ trial อยู่ และทีมขายเปลี่ยนเป็น paid
- When ถึงรอบขอ token ใหม่ หรือผู้ใช้ login ใหม่
- Then วันหมดอายุใหม่แสดงในหน้าโปรไฟล์ และไม่ต้องกรอก key

**AC-L09 license-server ล่ม**
- Given ผู้ใช้เคยได้ token ภายใน 7 วันที่ผ่านมา
- When license-server ติดต่อไม่ได้
- Then ใช้งานได้ตามปกติ ผู้ใช้ไม่เห็นความผิดปกติ และ auth บันทึก warning แบบไม่เปิดเผย token/key; ระบบ telemetry ที่ใช้จริงยังไม่ได้ระบุ

**AC-L10 license-server ล่มนานเกิน grace**
- Given ติดต่อไม่ได้เกิน 7 วันนับจาก token ล่าสุด
- Then ไปหน้า `/license/unavailable` แสดง `MSG-LC30`

**AC-L11 แอดมินดูรายการ license**
- Given ผู้ใช้มีสิทธิ์ `license.view`
- When เปิดหน้า `/settings/licenses`
- Then เห็นรายการ user ทุกคนพร้อม type, สถานะ และวันหมดอายุ เรียงจากใกล้หมดอายุก่อน

**AC-L12 CRM สร้างบัญชีได้เฉพาะเมื่อมี license ที่ออกแล้ว**
- Given CRM requests a new user for a normalized email
- When auth looks up that email and instance before creating the account
- Then `pending` (license issued, awaiting key activation) or a verified usable `active` license allows creation
- And `none`, inactive/expired/revoked, malformed response, or license-server outage creates no account and sends no generated credential

## 8. Field Specification

### ฟอร์มกรอก License Key

| Field | บังคับ | กฎ |
|---|---|---|
| licenseKey | ✅ | 5 กลุ่ม กลุ่มละ 4 ตัว คั่นด้วย `-`, อักขระ A-Z และ 2-9 (ไม่มี 0, 1, I, O) |

- แปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ, ตัดช่องว่าง, ใส่ `-` ให้อัตโนมัติขณะพิมพ์
- วาง (paste) key ที่มีช่องว่างหรือขึ้นบรรทัดใหม่ติดมาได้ ระบบตัดออกให้

## 9. UI Specification

> UI และ mockup อยู่นอก backend bundle; ยังไม่ได้รับ Figma URL หรือภาพอ้างอิง

### 9.1 หน้ากรอก License Key (`/license/activate`)

| ลำดับ | องค์ประกอบ | Component | รายละเอียด |
|---|---|---|---|
| 1 | หัวข้อ | Heading page | `MSG-LC01` |
| 2 | คำอธิบาย | Text secondary | `MSG-LC02` |
| 3 | ช่อง key | TextField | autofocus, font แบบ monospace, placeholder ห้ามใช้แทน label |
| 4 | ปุ่มเปิดใช้งาน | Button primary, เต็มความกว้าง | `MSG-LC03` |
| 5 | ลิงก์ออกจากระบบ | Link | `MSG-LC07` |

### 9.2 หน้า License หมดอายุ / ถูกยกเลิก / ตรวจสอบไม่ได้

| Route | หัวข้อ | ข้อความ | ปุ่ม |
|---|---|---|---|
| `/license/expired` | `MSG-LC20` | `MSG-LC21` + วันที่หมดอายุ | ติดต่อเจ้าหน้าที่ (mailto), ออกจากระบบ |
| `/license/revoked` | `MSG-LC22` | `MSG-LC23` | ติดต่อเจ้าหน้าที่, ออกจากระบบ |
| `/license/unavailable` | `MSG-LC30` | `MSG-LC31` | ลองใหม่, ออกจากระบบ |

ไม่มีเมนูหรือ navigation อื่นในหน้าเหล่านี้

### 9.3 Banner ใกล้หมดอายุ

- แสดงบนสุดของทุกหน้า สี warning, ปิดได้ (จำการปิดใน localStorage ถึงสิ้นวัน)
- เหลือ ≤ 3 วัน เปลี่ยนเป็นสี danger และปิดไม่ได้
- ข้อความ `MSG-LC10` แทนค่า `{days}` และ `{date}`

### 9.4 หน้ารายการ License (`/settings/licenses`)

สิทธิ์ที่ต้องใช้: `license.view`

| คอลัมน์ | รายละเอียด |
|---|---|
| ผู้ใช้ | ชื่อ + email |
| ประเภท | Trial / Paid (Tag) |
| สถานะ | ใช้งานได้ / ใกล้หมดอายุ / หมดอายุ / ถูกยกเลิก / รอเปิดใช้งาน |
| หมดอายุ | `DD/MM/YYYY` (พ.ศ.) + "อีก X วัน" |
| Key | แสดงเฉพาะ 4 ตัวแรก เช่น `ABCD-••••` |

- filter ตามสถานะ, เรียงตามวันหมดอายุ (ใกล้ก่อน) เป็นค่าเริ่มต้น
- แอดมินของลูกค้า **ไม่สามารถ** ต่ออายุหรือยกเลิกเองในหน้านี้ (ทำที่ทีมขาย)

### 9.5 ข้อความทั้งหมดบนหน้าจอ

| ID | ข้อความ |
|---|---|
| MSG-LC01 | เปิดใช้งานบัญชี |
| MSG-LC02 | กรอก License Key ที่ได้รับทางอีเมล เพื่อเริ่มใช้งาน |
| MSG-LC03 | เปิดใช้งาน |
| MSG-LC04 | License Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง |
| MSG-LC05 | เปิดใช้งานเรียบร้อยแล้ว |
| MSG-LC06 | กรอกผิดครบ 3 ครั้ง กรุณาลองใหม่ใน 1 นาที |
| MSG-LC07 | ออกจากระบบ |
| MSG-LC10 | License ของคุณจะหมดอายุใน {days} วัน ({date}) กรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุ |
| MSG-LC20 | License หมดอายุแล้ว |
| MSG-LC21 | License ของคุณหมดอายุเมื่อ {date} กรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุ |
| MSG-LC22 | License ถูกระงับ |
| MSG-LC23 | License ของคุณถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่ |
| MSG-LC30 | ไม่สามารถตรวจสอบ License ได้ |
| MSG-LC31 | ระบบไม่สามารถตรวจสอบ License ได้ในขณะนี้ กรุณาลองใหม่หรือติดต่อเจ้าหน้าที่ |

## 10. API ของ backend gateway

| ใช้โดย | Endpoint / Procedure | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| web frontend | gateway tRPC `license.status` | authenticated session | คืนสถานะตามข้อ 5 + expiry เพื่อให้ frontend ใช้แสดงผล/นำทาง |
| web frontend | gateway tRPC `license.activate` | authenticated session | รับ licenseKey; auth ใช้ email จาก session |
| web frontend | gateway tRPC `license.list` | `license.view` (role mapping pending) | deferred pending authorization decision and bounded API contract |

error code ที่ gateway license enforcement อาจตอบ:

| HTTP | code | frontend ทำอะไร |
|---|---|---|
| 403 | `LICENSE_REQUIRED` | frontend นำทางไปหน้าที่เหมาะสม |
| 403 | `LICENSE_EXPIRED` | ไป `/license/expired` |
| 403 | `LICENSE_REVOKED` | ไป `/license/revoked` |
| 503 | `LICENSE_UNVERIFIABLE` | ไป `/license/unavailable` |

## 11. Data ในฐานข้อมูลลูกค้า

| ตาราง | คอลัมน์ | หมายเหตุ |
|---|---|---|
| `auth.LicenseCache` | user_id (PK, FK `auth.User`), token, fetched_at, last_error_at | auth เป็นเจ้าของ; token ไม่ใช่ความลับ, **ห้ามมีคอลัมน์ key**; schema proposal ดู backend bundle |

## 12. Non-functional Requirements

| หมวด | ข้อกำหนด |
|---|---|
| Performance | เป้าหมายคือ gateway license enforcement เพิ่มเวลา < 5 ms ต่อ request เมื่อมี token ใน cache; ยังไม่มีผลวัดยืนยัน |
| Resilience | เรียก license-server timeout [3] วินาที, retry 1 ครั้ง |
| Resilience | user คนเดียวขอ token ใหม่พร้อมกันหลาย request ต้องเรียก license-server ครั้งเดียว |
| Security | ห้าม log license key; rate-limit diagnostics use user ID/keyed hash only |
| Observability | บันทึก sanitized security event เมื่อลายเซ็นไม่ถูกต้อง และ warning เมื่อเข้า GRACE; telemetry provider ยังไม่ได้กำหนด |

## 13. คำถามที่ยังเปิดอยู่

| # | คำถาม / decision | สถานะและผลต่อ backend |
|---|---|---|
| QL1 | ลบ user แล้ว license ที่เหลือวันย้ายให้คนอื่นได้ไหม | Open; external license-server policy, outside this customer-backend feature |
| QL2 | user เปลี่ยน email แล้ว license ตามไปไหม | Resolved by owner 2026-10-11: no transfer; a licensed account's email cannot be changed. To use another email, create a new account and issue a separate license within the same instance (1 email : 1 license). |
| QL3 | สร้าง user ผ่าน CRM โดยยังไม่มี license ได้ไหม | Resolved by owner 2026-10-11: no account before license exists; `pending` means issued and qualifies; `none`/upstream outage fails closed |
| QL4 | ใครสร้าง license: ทีมขายเท่านั้น หรือมีระบบชำระเงินออกให้อัตโนมัติ | Open; external issuance policy, outside customer backend |
| QL5 | Super Admin ต้องมี license ด้วยไหม หรือได้รับยกเว้น | Resolved by owner 2026-10-11: every user, including Super Admin, requires license; `license.list` deferred |
| QL6 | grace, session concurrency, activation lock | Approved 2026-10-11: 7-day grace; one active session per user; lock activation for one minute after 3 failed keys. Trial duration 14 days remains external product proposal. |
| QL7 | Expected JWT issuer source/value | Approved 2026-10-11: read the expected issuer from deployment configuration |
| QL8 | JWT audience | Approved 2026-10-11: `f1-system-customer-backend` |
| QL9 | Upstream error envelope | Approved 2026-10-11: `{error:{code,message}}` |

## 14. ประวัติการแก้ไข

| วันที่ | แก้ไขโดย | รายละเอียด |
|---|---|---|
| 2026-10-11 | ผู้เขียนไม่ได้ระบุในต้นฉบับ | สร้างเอกสาร |
| 2026-10-11 | Project owner / SA | Approved SA rev1 and answered QL2, QL3, QL5, QL6; revision 2 updates backend contract. |
| 2026-10-11 | Project owner | Corrected QL2: do not transfer licenses; licensed email is immutable; create a new account and issue a separate license for another email. Approved SA revision 2 and confirmed QL6-Q9. |
