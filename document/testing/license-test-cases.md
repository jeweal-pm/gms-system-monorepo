# Test Cases: License

- **Last updated:** 2026-10-11
- **Spec:** [license.md](../spec/license.md)
- **Email ที่ใช้:** ดู [apps/core-api/testing.md](../apps/core-api/testing.md) (โหมด mock)

## Login และ Activate

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L01 | license ใช้ได้ | login `active@` | เข้า Dashboard | AC-L01 |
| TC-L02 | ยังไม่ activate | login `pending@` | ไป `/license/activate` | AC-L02 |
| TC-L03 | activate สำเร็จ | กรอก `TEST-TEST-TEST-TEST-TEST` | Toast สำเร็จ, เข้า Dashboard | AC-L03 |
| TC-L04 | key ผิด | กรอก `AAAA-AAAA-AAAA-AAAA-AAAA` | error ใต้ช่อง | AC-L04 |
| TC-L05 | key ผิดหลายครั้ง | กรอกผิด 5 ครั้ง | ล็อก 15 นาที | BR-L11 |
| TC-L06 | วาง key มีช่องว่าง/ตัวเล็ก | วาง ` test-test-test-test-test ` | ระบบจัดรูปแบบให้ activate ได้ | Field spec |
| TC-L07 | ไม่มี license | login `nolicense@` | ไป `/license/activate` | REQUIRED |

## สถานะระหว่างใช้งาน

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L10 | ใกล้หมด 14 วัน | login `trial@` | banner warning ปิดได้ | AC-L05 |
| TC-L11 | ใกล้หมด 3 วัน | login `expiring@` | banner danger ปิดไม่ได้ | AC-L05 |
| TC-L12 | หมดอายุ | login `expired@` | ไป `/license/expired` แสดงวันที่ | AC-L06 |
| TC-L13 | API ตอนหมดอายุ | เรียก API ใดๆ ด้วย session ของ `expired@` | 403 `LICENSE_EXPIRED` | AC-L06 |
| TC-L14 | logout ตอนหมดอายุ | `expired@` กด ออกจากระบบ | ออกได้ปกติ | BR-L12 |
| TC-L15 | ถูกยกเลิกระหว่างใช้ | `revoked@` ใช้งาน แล้วเลื่อนเวลาไป 25 ชม. | ไป `/license/revoked` | AC-L07 |
| TC-L16 | ถูกระงับ | login `suspended@` | ไป `/license/revoked` | ข้อ 5 |

## License Server ล่ม

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L20 | ล่มในช่วง grace | `down@` มี token อายุ 6 วัน | ใช้งานได้ปกติ + log warn | AC-L09 |
| TC-L21 | ล่มเกิน grace | `down@` มี token อายุ 8 วัน | ไป `/license/unavailable` | AC-L10 |
| TC-L22 | ล่มและไม่เคยมี token | login `down@` ครั้งแรก | ไป `/license/unavailable` | UNVERIFIABLE |

## Security

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L30 | token ลายเซ็นผิด | login `badsig@` | ถือว่าไม่มี license + Sentry warning | BR-L08 |
| TC-L31 | token ของ instance อื่น | login `otherinstance@` | ถือว่าไม่มี license | BR-L01 |
| TC-L32 | แก้ token ใน DB เอง | แก้ `license_expires_at` ใน license_cache | ลายเซ็นไม่ผ่าน ถือว่าไม่มี license | ADR-0011 |
| TC-L33 | ไม่มี key ใน DB | ค้นทุกตารางหลัง activate | ไม่พบ license key | BR-L09 |
| TC-L34 | ไม่มี key ใน log | ค้น log หลัง activate | เจอแค่ 4 ตัวแรก | NFR |
| TC-L35 | mock ใน production | start ด้วย `LICENSE_MODE=mock NODE_ENV=production` | แอปไม่ start | ADR-0012 |

## Race Condition

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L40 | refresh พร้อมกัน | token หมด แล้วยิง 10 request พร้อมกัน | เรียก LicenseClient.refresh ครั้งเดียว | NFR |
| TC-L41 | activate พร้อมกัน | กด activate 2 request พร้อมกันด้วย key เดียว | สำเร็จทั้งคู่หรือหนึ่งได้ ALREADY_ACTIVATED, license_cache มีแถวเดียว | |

## หน้าแอดมิน

| ID | กรณี | ขั้นตอน | ผลที่คาดหวัง | อ้างอิง |
|---|---|---|---|---|
| TC-L50 | ดูรายการ | ผู้มีสิทธิ์ `license.view` เปิด `/settings/licenses` | เห็นทุกคน เรียงใกล้หมดก่อน | AC-L11 |
| TC-L51 | ไม่มีสิทธิ์ | ผู้ไม่มีสิทธิ์เรียก `license.list` | 403 | AC-L11 |
| TC-L52 | ไม่เห็น key เต็ม | ดูคอลัมน์ Key | เห็นแค่ 4 ตัวแรก | 9.4 |
