# ADR-0010: ระบบเป็นผู้สร้างรหัสผ่านเริ่มต้น ไม่ใช่ CRM

- **Status:** Superseded by [ADR-0015](0015-remove-forgot-password-and-email.md) (2026-10-12)
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

User ของระบบถูกสร้างจากระบบ CRM ต้องตัดสินใจว่าใครเป็นผู้สร้างรหัสผ่านเริ่มต้น
ระหว่าง CRM สร้างแล้วส่งมาพร้อม request หรือระบบของเราสร้างเอง

ถ้าให้ CRM สร้าง password จะแปลว่ารหัสผ่านต้องผ่านหลายระบบ
ทั้งตอนสร้าง ตอนส่ง และอาจถูกเก็บหรือ log ไว้ใน CRM ด้วย
ซึ่งเพิ่มจุดที่รหัสผ่านอาจรั่วไหล

## Decision

CRM มีหน้าที่แค่ **ยิง API ขอสร้าง user** (email, ชื่อ, role)
ระบบของเราเป็นผู้ generate password เริ่มต้นแบบสุ่มที่ปลอดภัย โดยรหัสผ่านไม่มีวันหมดอายุตาม product decision
ส่งรหัสผ่านเริ่มต้นให้ user ทาง email ตาม [login flow](../diagram/login-flow.md)
และ API ไม่ส่ง password กลับไปให้ CRM

ทางเลือกที่ไม่เลือก:
- **CRM สร้าง password แล้วส่งมา:** CRM ต้องรู้ password policy ของเรา
  และรหัสผ่านจะไปปรากฏในระบบอื่นที่เราควบคุมไม่ได้

## Consequences

**ข้อดี**
- รหัสผ่านอยู่ในระบบเราที่เดียว ลดจุดเสี่ยงรั่วไหล
- Password policy อยู่ที่เดียว แก้ทีเดียวมีผลทั้งระบบ
- CRM ไม่ต้องรู้เรื่อง password เลย integration ง่ายขึ้น

**ข้อเสีย**
- ระบบเราต้องรับผิดชอบการส่ง email แจ้ง credential ให้ user เอง

## References
- [Login Requirements: BR-01, BR-02](../spec/0002-login-requirements.md)
- [Password Policy](../spec/0003-password-policy.md)
- [API Contract](../spec/0001-api-contract.md)
- [Login Flow](../diagram/login-flow.md)
