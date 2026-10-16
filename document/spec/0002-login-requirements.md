# Login & Password Management: Requirements

- **Status:** Draft
- **Last updated:** 2026-10-15 ([ADR-0020](../adr/0020-username-login-and-permission-matrix-v2.md): login ด้วย **Username** แทน email); 2026-10-12 ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md): CRM กำหนดรหัสผ่านเริ่มต้น, เอา forgot password และ email ออก)
- **Related:** [Password Policy](0003-password-policy.md), [API Contract](0001-api-contract.md), [Flow](../diagram/login-flow.md)

## 1. ภาพรวม

ระบบให้ผู้ใช้ login ด้วย **username** และ password (ADR-0020; username เช่น `user1` หรือค่าหน้าตาเหมือน email ก็ได้
แต่ระบบไม่ตรวจว่าเป็น email) โดยบัญชี Super Admin ถูกสร้างจากระบบ CRM ผ่าน API และบัญชี user ทั่วไปถูกสร้างโดย Super Admin
ที่หน้า User and Permission (ADR-0017) ซึ่ง CRM เป็นผู้กำหนดรหัสผ่านเริ่มต้น ผู้ใช้เปลี่ยนรหัสผ่านเองได้ที่หน้า Profile
ระบบไม่ส่ง email และไม่มี flow ลืมรหัสผ่าน ผู้ใช้ที่ลืมรหัสติดต่อผู้ดูแลระบบนอกระบบ

## 2. ขอบเขต

**อยู่ใน scope**
- Login ด้วย username + password (`POST /api/auth/sign-in/username`; `/sign-in/email` ปิดแล้ว)
- สร้าง user ผ่าน API ที่ CRM เรียก พร้อมรหัสผ่านเริ่มต้นที่ CRM กำหนด
- เปลี่ยน password ด้วยตัวเองที่ Super Admin Profile page

**ไม่อยู่ใน scope**
- สมัครสมาชิกด้วยตัวเอง (self sign-up)
- Login ด้วย social / SSO
- Multi-factor authentication (MFA)
- Forgot password และการส่ง email ทุกประเภท ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md))
- (ย้ายเข้า scope แล้วตาม ADR-0017) Super Admin reset รหัสผ่านของ user ทั่วไปได้ที่หน้า User and Permission

ส่วนที่เป็นสีจางเรื่องบังคับเปลี่ยน password หลัง login ครั้งแรกไม่อยู่ใน scope ตาม [ADR-0011](../adr/0011-change-password-via-profile-page.md)

## 3. ผู้เกี่ยวข้อง (Actors)

| Actor | คำอธิบาย |
|---|---|
| User | ผู้ใช้งานระบบ (Super Admin) |
| CRM | ระบบภายนอก ขอสร้าง user ผ่าน API พร้อมกำหนดรหัสผ่านเริ่มต้นและแจ้งรหัสให้ user |
| System | ระบบของเรา ทำหน้าที่ตรวจ policy, เก็บ password hash และยืนยันตัวตน |

## 4. User Stories

- **US-01** ในฐานะ User ฉันต้องการ login ด้วย username และ password เพื่อเข้าใช้งานระบบ
- **US-02** ในฐานะ CRM ฉันต้องการเรียก API เพื่อสร้าง user ใหม่พร้อมรหัสผ่านเริ่มต้น
- **US-03** (ยกเลิกตาม ADR-0015) ขอรหัสผ่านใหม่ทาง email เมื่อลืมรหัสผ่าน
- **US-04** ในฐานะ User ฉันต้องการเปลี่ยนรหัสผ่านเป็นของตัวเองได้เมื่อต้องการ โดยไม่ถูกบังคับ

## 5. Business Rules

| ID | กฎ | ที่มา |
|---|---|---|
| BR-01 | CRM ส่งรหัสผ่านเริ่มต้นมาพร้อม request สร้าง user และรับผิดชอบแจ้งรหัสให้ user เอง | [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) (แทน ADR-0010) |
| BR-02 | รหัสผ่านเริ่มต้นต้องผ่าน [Password Policy ข้อ 1](0003-password-policy.md); ไม่มีวันหมดอายุ; ระบบเก็บเฉพาะ hash และไม่ส่งกลับ | [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) |
| BR-03 | (ยกเลิก) ไม่มี forgot password; ผู้ใช้ที่ลืมรหัสติดต่อผู้ดูแลระบบนอกระบบ | [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) |
| BR-04 | ไม่บังคับให้ user เปลี่ยน password หลัง login ครั้งแรก user เปลี่ยนเองได้ที่ Profile page | [ADR-0011] |
| BR-05 | Password ที่ user ตั้งเองต้องผ่าน [Password Policy](0003-password-policy.md) | [จาก flow] |
| BR-06 | ช่อง Confirm password ต้องตรงกับ Password | [จาก flow] |
| BR-07 | ใส่ password ผิดติดกัน 3 ครั้งให้ล็อกบัญชี 1 นาที และแจ้งจำนวนครั้งที่เหลือ/เวลาที่เหลือตาม ADR-0012 (นับตาม username ที่ normalize แล้ว) | [ADR-0012], [ADR-0020] |
| BR-08 | Username: trim, ตัวพิมพ์เล็ก, 3–64 ตัว, `a-z 0-9 . _ - @ +`, ห้ามซ้ำ, แก้ไม่ได้หลังสร้าง (ผูก license); user เดิมใช้ email เดิมเป็น username | [ADR-0020] |
| BR-09 | บัญชีที่ถูกปิดใช้งาน (Active off) login ไม่ได้แม้ password ถูก (`403 ACCOUNT_INACTIVE`) | [ADR-0017] |

## 6. Acceptance Criteria

**AC-01 Login (US-01)**
- Given user มีบัญชีอยู่แล้ว
- When กรอก username (ตัวพิมพ์ใหญ่/เล็กได้) และ password ถูกต้องที่หน้า `/login`
- Then เข้าสู่ระบบสำเร็จและไปหน้า default

- Given user กรอก username หรือ password ผิด
- When กด login
- Then แสดงข้อความ "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" โดยไม่บอกว่าผิดช่องไหน (API 401 `INVALID_USERNAME_OR_PASSWORD`)

- Given บัญชีถูกปิดใช้งาน
- When กรอก password ถูก
- Then แสดง "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" (API 403 `ACCOUNT_INACTIVE`) และไม่เข้าสู่ระบบ

- Given user อยู่ที่หน้า `/login`
- Then ไม่มีลิงก์หรือข้อความเรื่องลืมรหัสผ่าน

**AC-02 สร้าง user ผ่าน CRM (US-02)**
- Given CRM ส่ง request สร้าง user พร้อม `username` (หรือ `email` แบบ deprecated) ที่ยังไม่มีในระบบและ password ที่ผ่าน policy
- When ระบบรับ request
- Then สร้าง user, เก็บ password แบบ hash และตอบ `201` โดยไม่มี password ใน response

- Given ไม่มี password หรือ password ไม่ผ่าน policy
- Then ตอบกลับ `400` และไม่สร้าง user

- Given username ซ้ำกับที่มีในระบบ
- Then ตอบกลับ `409 Conflict` และไม่สร้าง user

**AC-03 Forgot password (US-03)** — ยกเลิกตาม ADR-0015
- `/forgot-password` และ API forgot/reset password ตอบ `404`

**AC-04 เปลี่ยน password (US-04)**
- Given user login อยู่ และอยู่ที่ Profile page
- When กรอก password ใหม่ที่ผ่าน policy และ confirm ตรงกัน แล้วกด Save
- Then บันทึก password ใหม่สำเร็จและ invalidate session อื่น โดย session ปัจจุบันยังใช้งานต่อได้

- Given password ไม่ผ่าน policy หรือ confirm ไม่ตรง
- Then แสดง error ตาม [Password Policy](0003-password-policy.md) และไม่บันทึก

## 7. Non-functional Requirements [ข้อเสนอ]

- **Security:** เก็บ password แบบ hash ด้วย bcrypt หรือ Argon2 ห้ามเก็บหรือ log plaintext
- **Security:** API login ต้องมี rate limit
- **Security:** ใช้ HTTPS เท่านั้น รวมถึงการเรียก API สร้าง user จาก CRM
- **Audit:** บันทึก log เหตุการณ์ login สำเร็จ/ล้มเหลว, สร้าง user, เปลี่ยน password (ห้าม log ตัว password)
- **Performance:** API login ตอบกลับภายใน 1 วินาทีในสภาวะปกติ
