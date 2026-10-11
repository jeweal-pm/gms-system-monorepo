# ADR-0009: ใช้ vanilla-cookieconsent ทำ Consent Banner และเก็บ Consent Log เอง

- **Status:** Proposed
- **Date:** 2026-10-04
- **Deciders:** [Jakapong Chan-o ( PM )

## Context

ระบบต้องปฏิบัติตาม PDPA ซึ่งกำหนดให้ขอความยินยอมก่อนใช้ cookie
ที่ไม่จำเป็น (analytics, marketing) ต้องให้ user ถอนความยินยอมได้ตลอด
และต้องเก็บหลักฐานการให้ความยินยอมไว้

สถานการณ์ของโปรเจคตอนนี้:
- เป็น Next.js (App Router) + tRPC ทีมเล็ก งบจำกัด
- cookie ที่ใช้ส่วนใหญ่เป็น strictly necessary (session, CSRF)
- ขณะนี้ไม่มีแผนใช้ analytics หรือ marketing tracking และยังไม่โหลด third-party tracking
- มีเว็บเดียว ภาษาไทยเป็นหลัก

หากในอนาคตเพิ่ม cookie หรือ script ที่ไม่จำเป็น ต้องเลือกว่าจะทำ consent banner และระบบเก็บ consent อย่างไร ก่อนเปิดใช้สิ่งนั้น

## Decision Drivers

- ต้องบล็อก script ที่ไม่จำเป็นได้จริงก่อนได้ consent
- ข้อมูล consent log ควรอยู่ในระบบของเราเอง
- ไม่มีค่าใช้จ่ายรายเดือน
- ทีมดูแลต่อได้โดยไม่ต้องมีความรู้เฉพาะทางมาก

## Considered Options

### Option 1: เขียน banner และ logic เองทั้งหมด
- ✅ ควบคุมได้ 100% หน้าตาตรงกับ design system
- ❌ ต้องเขียนเองทั้งหมด ทั้งการบล็อก script, จัดการหมวด, หน้าตั้งค่า, accessibility
- ❌ เสี่ยงทำผิดในจุดเล็กๆ เช่น script หลุดโหลดก่อน consent

### Option 2: ใช้ library โอเพนซอร์ส (vanilla-cookieconsent) + เก็บ log เอง
- ✅ ฟรี (MIT license) มีระบบหมวดหมู่, หน้าตั้งค่า, การบล็อก script มาให้แล้ว
- ✅ แปลข้อความเป็นภาษาไทยเองได้ ปรับหน้าตาด้วย CSS ได้
- ✅ consent log อยู่ใน DB ของเรา ผ่าน tRPC
- ❌ ต้องดูแลรายการ cookie (cookie inventory) เอง ไม่มีการสแกนอัตโนมัติ
- ❌ ต้องติดตามการเปลี่ยนแปลงของกฎหมายเอง

### Option 3: ใช้ CMP สำเร็จรูปแบบเสียเงิน (เช่น CookieHub, Cookiebot)
- ✅ สแกน cookie อัตโนมัติ, มี consent log และ dashboard ให้
- ✅ ผู้ให้บริการอัปเดตตามกฎหมายให้
- ❌ ค่าใช้จ่ายรายเดือน
- ❌ ต้องโหลด script ของ third party เพิ่ม และ consent log อยู่นอกระบบเรา
- ❌ คุ้มค่าเมื่อมีหลายเว็บหรือ tracking เยอะ ซึ่งตอนนี้ยังไม่ใช่

## Decision

เสนอ **Option 2** หากมีการเพิ่ม cookie ที่ไม่จำเป็นในอนาคต เพราะจำนวน cookie ที่ไม่จำเป็นยังน้อย
library ครอบคลุมส่วนที่เสี่ยงทำผิด (การบล็อก script, หน้าตั้งค่า) ให้แล้ว
และเก็บ consent log ใน DB ของเราได้ตาม Decision Drivers โดยไม่มีค่าใช้จ่าย

การตัดสินใจนี้ยังเป็น Proposed: ปัจจุบันไม่มี analytics/marketing tracking จึงยังไม่ต้องติดตั้ง banner, library หรือ consent log ตามแนวทางนี้

รายละเอียดการ implement:
- ห่อ library ไว้ใน component กลาง `ConsentProvider` ตัวเดียว
- script ของ third party ทุกตัวต้องโหลดผ่าน `ConsentProvider` ห้ามใส่ใน layout ตรงๆ
- บันทึก consent ผ่าน tRPC procedure `consent.record` ลงตาราง `consent_logs`
- กติกาและรายการ cookie อยู่ที่ [Cookie & Consent Spec](../spec/0004-cookie-and-consent.md)

## Consequences

**ข้อดี**
- มีแนวทางให้พิจารณาเมื่อเพิ่ม cookie ที่ไม่จำเป็น โดยไม่มีค่าใช้จ่ายรายเดือน
- ข้อมูล consent อยู่ในระบบเรา ตรวจสอบและส่งให้หน่วยงานได้เอง
- ไม่ต้องพึ่ง script ภายนอกเพิ่ม

**ข้อเสีย / ความเสี่ยง**
- ถ้ามีคนเพิ่ม script ใหม่แล้วลืมอัปเดต cookie inventory จะผิด PDPA โดยไม่รู้ตัว
- ทีมต้องรับผิดชอบการตามกฎหมายเอง

**เงื่อนไขก่อน implement ในอนาคต**
- ยืนยันว่าจะเพิ่ม cookie หรือ third-party script ที่ไม่จำเป็น
- ให้ DPO/privacy owner ตรวจข้อกำหนดและข้อความก่อนเปิดใช้งาน
- จากนั้นจึงเพิ่ม `vanilla-cookieconsent`, consent logging และ checklist ใน PR template

**ทบทวนการตัดสินใจนี้เมื่อ**
- มี marketing pixel หรือ third-party tracking เกิน 3 ตัว
- มีเว็บไซต์มากกว่า 1 เว็บที่ต้องจัดการ consent
- ต้องรองรับกฎหมายประเทศอื่นเพิ่ม (เช่น GDPR)

## References
- [Cookie & Consent Spec](../spec/0004-cookie-and-consent.md)
- [Tech Stack](tech-stack.md)
