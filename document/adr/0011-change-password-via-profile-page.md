# ADR-0011: เปลี่ยนรหัสผ่านที่ Profile Page แทนการบังคับด้วย Popup

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

User ได้รหัสผ่านที่ระบบ generate ให้ทั้งตอนสร้างบัญชีและตอน forgot password
ต้องตัดสินใจว่าจะให้ user เปลี่ยนเป็นรหัสผ่านของตัวเองอย่างไร

Flow แรกออกแบบให้แสดง popup บังคับเปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก
แล้ว log out ให้ login ใหม่ แต่ได้รับ feedback ว่า user ไม่ได้อยากถูกบังคับ
ให้เปลี่ยนรหัสผ่าน และไม่จำเป็นต้องเข้าไปเปลี่ยนอีกถ้า user ไม่ต้องการ

## Decision

เลือก **Option 2: เปลี่ยนรหัสผ่านที่ Setting > Super Admin Profile page**
user เปลี่ยนได้เองเมื่อต้องการ ไม่มี popup บังคับ

ทางเลือกที่พิจารณา:
- **Option 1: Popup บังคับเปลี่ยนหลัง login ครั้งแรก**
  ปลอดภัยกว่าเพราะรหัสที่ระบบส่งทาง email จะถูกเปลี่ยนทันที
  แต่ขัดจังหวะ user และ user ไม่ต้องการ
- **Option 2: Profile page (เลือก)**
  ใช้งานสะดวก user ควบคุมเอง และหน้า Profile ก็ต้องมีฟังก์ชันเปลี่ยนรหัสอยู่แล้ว

## Consequences

**ข้อดี**
- ประสบการณ์ใช้งานดีขึ้น ไม่ถูกขัดจังหวะตอน login
- ลดงานพัฒนา เพราะทำหน้าเปลี่ยนรหัสผ่านที่เดียว ไม่ต้องทำทั้ง popup และ profile

**ข้อเสีย / ความเสี่ยง**
- รหัสผ่านที่ระบบ generate อาจถูกใช้ไปตลอด ทั้งที่เคยถูกส่งผ่าน email
  ถ้า email ของ user รั่ว รหัสผ่านก็รั่วด้วย
- Product ยืนยันให้รหัสผ่านที่ระบบ generate ไม่มีวันหมดอายุ; user เปลี่ยนเองได้จากหน้า Profile

**ทางลดความเสี่ยงที่ควรพิจารณา**
- แสดง banner แนะนำ (ไม่บังคับ) ให้เปลี่ยนรหัสผ่าน ถ้ายังใช้รหัสที่ระบบ generate
- ใช้ lockout และ API rate limit ตาม [ADR-0012](0012-change-flow-login.md) เพื่อลดความเสี่ยงจากการเดารหัสผ่าน

## References
- [Login Requirements: BR-04, AC-04](../spec/0002-login-requirements.md)
- [Password Policy](../spec/0003-password-policy.md)
- [Cookie & Consent](../spec/0004-cookie-and-consent.md)
