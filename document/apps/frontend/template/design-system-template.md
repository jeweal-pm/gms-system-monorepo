> แม่แบบนี้ใช้เป็นโครงเอกสาร ตัวอย่างสี ฟอนต์ ขนาด และกติกายังไม่ใช่ดีไซน์ที่อนุมัติของทุกหน้า ให้แทนค่าด้วย Figma/ภาพและ token ที่ตรวจพบจริง พร้อมแยกค่าที่วัดได้ออกจากค่าประมาณ และระบุ UI revision ก่อนส่งตรวจ

# Design System: web-frontend

- **Owner:** [ชื่อ]
- **Last updated:** 2026-10-11
- **ค่าจริงในโค้ด:** `frontend/src/app/globals.css`
- **Component จริง:** `frontend/src/features/<feature>/components/ หรือ shared location ที่ตรวจพบจริง`
- **Storybook:** [ลิงก์ เมื่อตั้งค่าแล้ว]

เอกสารนี้บอกว่ามี token และ component อะไรบ้าง แต่ละตัวใช้เมื่อไหร่
spec ของแต่ละหน้าอ้างถึงชื่อในเอกสารนี้เท่านั้น (เช่น "Button primary") ไม่ระบุค่าสีหรือขนาดเอง

> ถ้าค่าในเอกสารนี้ต่างจาก `frontend/src/app/globals.css` ให้ตรวจ source และ UI revision ที่อนุมัติ: ค่าตัวอย่างในแม่แบบไม่เปลี่ยนดีไซน์เดิม ส่วน token ใหม่ที่อนุมัติแล้วต้องแก้โค้ดและเอกสารให้ตรงกันในงานเดียวกัน

---

# ส่วนที่ 1: Design Tokens

## 1. สี

### 1.1 สีหลัก (Brand)

| Token | ค่า | ใช้กับ |
|---|---|---|
| `primary` | `#2563EB` | ปุ่ม action หลัก, ลิงก์, focus ring |
| `primary-hover` | `#1D4ED8` | สถานะ hover ของ primary |
| `primary-subtle` | `#EFF6FF` | พื้นหลังจางของสิ่งที่ถูกเลือก |
| `on-primary` | `#FFFFFF` | ตัวอักษรบนพื้น primary |

### 1.2 สีพื้นและตัวอักษร (Neutral)

| Token | ค่า | ใช้กับ |
|---|---|---|
| `bg` | `#FFFFFF` | พื้นหลังหน้า |
| `surface` | `#F8FAFC` | พื้นหลังการ์ด, กล่อง, sidebar |
| `border` | `#E2E8F0` | เส้นขอบช่องกรอก, เส้นแบ่ง |
| `border-strong` | `#94A3B8` | เส้นขอบช่องกรอกตอน hover |
| `text` | `#0F172A` | ตัวอักษรหลัก |
| `text-secondary` | `#475569` | คำอธิบาย, label รอง |
| `text-disabled` | `#94A3B8` | ตัวอักษรของสิ่งที่ใช้ไม่ได้ |

### 1.3 สีสถานะ (Semantic)

| Token | ค่า | พื้นจาง | ใช้กับ |
|---|---|---|---|
| `danger` | `#DC2626` | `#FEF2F2` | error, ปุ่มลบ, ข้อความผิดพลาด |
| `success` | `#16A34A` | `#F0FDF4` | สำเร็จ, เงื่อนไขที่ผ่านแล้ว |
| `warning` | `#D97706` | `#FFFBEB` | คำเตือน |
| `info` | `#0284C7` | `#F0F9FF` | ข้อมูลเพิ่มเติม |

### 1.4 กติกาการใช้สี

- ห้ามใช้ค่าสี (hex) ตรงๆ ในโค้ด ให้ใช้ token เท่านั้น
- ห้ามใช้สีอย่างเดียวในการสื่อความหมาย ต้องมีไอคอนหรือข้อความประกอบเสมอ (คนตาบอดสีต้องเข้าใจได้)
- ตัวอักษรบนพื้นหลังต้องมี contrast อย่างน้อย 4.5:1 (WCAG AA) ทุกคู่ในตารางนี้ผ่านแล้ว
- Dark mode: [ยังไม่รองรับ / ดูตาราง dark ใน frontend/src/app/globals.css]

## 2. ตัวอักษร

- **ฟอนต์:** IBM Plex Sans Thai (โหลดผ่าน `next/font`) fallback เป็น `system-ui, sans-serif`
- **ตัวเลขในตาราง:** ใช้ `font-variant-numeric: tabular-nums` เพื่อให้ตัวเลขเรียงตรงกัน

| Token | ขนาด / ความสูงบรรทัด | น้ำหนัก | ใช้กับ |
|---|---|---|---|
| `heading-page` | 28px / 36px | 600 | หัวข้อหลักของหน้า (1 ครั้งต่อหน้า) |
| `heading-section` | 20px / 28px | 600 | หัวข้อส่วนในหน้า |
| `body` | 16px / 24px | 400 | ข้อความทั่วไป, ค่าในช่องกรอก |
| `body-strong` | 16px / 24px | 600 | ข้อความเน้น, ตัวอักษรบนปุ่ม |
| `small` | 14px / 20px | 400 | label, คำอธิบายใต้ช่อง, ข้อความ error |
| `caption` | 12px / 16px | 400 | ข้อความประกอบเล็กๆ |

> ภาษาไทยมีสระบนล่าง ความสูงบรรทัดต้องไม่ต่ำกว่า 1.4 เท่าของขนาดตัวอักษร ไม่งั้นสระจะชนกัน

## 3. ระยะห่าง

ใช้ฐาน 4px ทั้งระบบ ห้ามใช้ค่าที่ไม่อยู่ในตาราง

| Token | ค่า | ใช้กับ (ตัวอย่าง) |
|---|---|---|
| `space-1` | 4px | ระยะระหว่างไอคอนกับข้อความ |
| `space-2` | 8px | ระยะระหว่าง label กับช่องกรอก |
| `space-3` | 12px | padding ในปุ่มแนวตั้ง |
| `space-4` | 16px | ระยะระหว่างช่องกรอกในฟอร์ม |
| `space-6` | 24px | padding ในการ์ด |
| `space-8` | 32px | ระยะระหว่างส่วนในหน้า |
| `space-12` | 48px | ระยะขอบหน้าบนจอใหญ่ |

## 4. มุมโค้ง เงา และอื่นๆ

| Token | ค่า | ใช้กับ |
|---|---|---|
| `radius-sm` | 4px | checkbox, tag |
| `radius-md` | 8px | ปุ่ม, ช่องกรอก |
| `radius-lg` | 12px | การ์ด, modal |
| `shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.05)` | การ์ด |
| `shadow-lg` | `0 10px 15px rgb(0 0 0 / 0.1)` | toast, dropdown, modal |
| `focus-ring` | 2px `primary` ห่างจากขอบ 2px | ทุกสิ่งที่กดหรือกรอกได้ เมื่อได้ focus จากคีย์บอร์ด |

## 5. Breakpoints

| Token | ความกว้างขั้นต่ำ | หมายเหตุ |
|---|---|---|
| `sm` | 640px | มือถือแนวนอน |
| `md` | 768px | แท็บเล็ต |
| `lg` | 1024px | desktop |

ออกแบบจากมือถือก่อน (mobile-first) แล้วค่อยขยาย

---

# ส่วนที่ 2: Components

แต่ละ component ระบุ: แบบ (variant), สถานะ (state) และกติกาการใช้

## 6. Button

### Variants

| Variant | พื้น | ตัวอักษร | ขอบ | ใช้เมื่อ |
|---|---|---|---|---|
| `primary` | `primary` | `on-primary` | - | action หลักของหน้าหรือฟอร์ม **หน้าละ 1 ปุ่ม** |
| `secondary` | `bg` | `text` | `border` | action รอง เช่น ยกเลิก, ย้อนกลับ |
| `danger` | `danger` | `on-primary` | - | action ที่ทำลายข้อมูล เช่น ลบ (ต้องมี dialog ยืนยัน) |
| `ghost` | โปร่งใส | `primary` | - | action ที่ไม่สำคัญ, ปุ่มในแถบเครื่องมือ |

### Sizes

| Size | ความสูง | padding แนวนอน | ตัวอักษร |
|---|---|---|---|
| `md` (ค่าเริ่มต้น) | 40px | `space-4` | `body-strong` |
| `lg` | 48px | `space-6` | `body-strong` |

ตัวเลือกเพิ่ม: `fullWidth` (เต็มความกว้างของกล่องที่อยู่)

### States

| State | การแสดงผล |
|---|---|
| hover | เปลี่ยนเป็นสี `-hover` ของ variant |
| focus | แสดง `focus-ring` |
| loading | แสดง spinner แทนข้อความ, กดไม่ได้, ความกว้างคงเดิม (ไม่กระตุก) |
| disabled | ความทึบ 50%, กดไม่ได้ |

### กติกา
- ตัวอักษรบนปุ่มเป็นคำกริยาที่บอกผลลัพธ์ เช่น "บันทึก", "ส่งรหัสผ่านใหม่" ไม่ใช้ "ตกลง" หรือ "OK"
- ไม่ disable ปุ่มเพราะฟอร์มยังไม่ถูก ดู form-login-guildlines.md

## 7. TextField

ช่องกรอกข้อความหนึ่งบรรทัด ประกอบด้วย label, ช่องกรอก, คำอธิบาย (ไม่บังคับ) และข้อความ error

| ส่วน | Token |
|---|---|
| label | `small`, สี `text`, อยู่เหนือช่อง ห่าง `space-2` |
| ช่องกรอก | สูง 40px, ขอบ `border`, `radius-md`, ตัวอักษร `body` |
| คำอธิบาย | `small`, สี `text-secondary`, อยู่ใต้ช่อง |
| ข้อความ error | `small`, สี `danger`, มีไอคอนเตือนข้างหน้า, แทนที่คำอธิบาย |

| State | การแสดงผล |
|---|---|
| hover | ขอบ `border-strong` |
| focus | ขอบ `primary` + `focus-ring` |
| error | ขอบ `danger` + ข้อความ error ใต้ช่อง |
| disabled | พื้น `surface`, ตัวอักษร `text-disabled` |

กติกา
- ต้องมี label เสมอ ห้ามใช้ placeholder แทน label
- ข้อความ error ผูกกับช่องด้วย `aria-describedby` เพื่อให้ screen reader อ่านได้
- ช่องที่บังคับกรอกไม่ต้องใส่ดอกจัน ให้ใส่ "(ไม่บังคับ)" ต่อท้าย label ของช่องที่ไม่บังคับแทน

## 8. PasswordField

ต่อยอดจาก TextField ทุกอย่าง เพิ่มเติม:
- ปุ่มรูปตาด้านขวาในช่อง สลับแสดง/ซ่อนรหัส (Button ghost ขนาดไอคอน)
- ปุ่มรูปตามี `aria-label` เปลี่ยนตามสถานะ: "แสดงรหัสผ่าน" / "ซ่อนรหัสผ่าน"
- ไม่ trim ช่องว่างอัตโนมัติ

## 9. PasswordChecklist

รายการเงื่อนไขของรหัสผ่าน แสดงใต้ PasswordField ตอนตั้งรหัสใหม่

| สถานะของแต่ละข้อ | ไอคอน | สีตัวอักษร |
|---|---|---|
| ยังไม่ผ่าน | วงกลมว่าง | `text-secondary` |
| ผ่านแล้ว | เครื่องหมายถูก | `success` |

- ตัวอักษร `small`, ระยะระหว่างข้อ `space-1`
- ข้อความเงื่อนไขมาจาก document/spec/0003-password-policy.md ข้อ 3
- ใช้ `aria-live="polite"` ให้ screen reader แจ้งเมื่อเงื่อนไขเปลี่ยนสถานะ

## 10. FormError

กล่องแสดง error ที่ไม่ผูกกับช่องใดช่องหนึ่ง เช่น error จาก server

- อยู่เหนือฟอร์ม พื้น `danger` จาง, ขอบซ้าย 4px สี `danger`, `radius-md`, padding `space-3`
- ไอคอนเตือน + ข้อความ `small` สี `text`
- ใช้ `role="alert"` เพื่อให้ screen reader อ่านทันทีเมื่อแสดง
- ซ่อนไว้ (ไม่กินพื้นที่) เมื่อไม่มี error

## 11. Toast

ข้อความแจ้งชั่วคราว แสดงมุมขวาล่าง (มือถือ: ด้านล่างเต็มความกว้าง)

| Variant | ไอคอน | ใช้เมื่อ |
|---|---|---|
| `success` | เครื่องหมายถูก | ทำรายการสำเร็จ เช่น บันทึกแล้ว |
| `error` | กากบาท | ทำรายการไม่สำเร็จ ที่ไม่มีที่แสดงในหน้า |
| `info` | ตัว i | แจ้งข้อมูลทั่วไป |

- พื้น `bg`, `shadow-lg`, `radius-lg`, ขอบซ้าย 4px ตามสีของ variant
- หายเองใน 5 วินาที (`error` ไม่หายเอง ต้องกดปิด)
- แสดงพร้อมกันได้ไม่เกิน 3 อัน
- ห้ามใช้ Toast แสดง error ของฟอร์ม ให้ใช้ FormError หรือ error ใต้ช่องแทน

## 12. Link

- สี `primary`, ขีดเส้นใต้เมื่อ hover
- ลิงก์ไปเว็บภายนอกเปิดแท็บใหม่ และมีไอคอนลูกศรออกนอกหน้าต่อท้าย

## 13. Heading และ Text

| Component | Token |
|---|---|
| Heading page | `heading-page` (ใช้ `<h1>` หน้าละครั้ง) |
| Heading section | `heading-section` (`<h2>`) |
| Text | `body` |
| Text secondary | `body` สี `text-secondary` |

---

# ส่วนที่ 3: การเปลี่ยนแปลง

## 14. กติกาการเพิ่มหรือแก้

- **เพิ่ม token หรือ variant ใหม่:** แก้ `frontend/src/app/globals.css` และเอกสารนี้ใน PR เดียวกัน
- **ก่อนสร้าง component ใหม่:** เช็กเอกสารนี้ก่อนว่ามีตัวที่ใช้แทนได้หรือไม่
- **เปลี่ยนค่าสีหรือขนาด:** เปลี่ยนที่ token เท่านั้น ห้ามแก้เฉพาะหน้า
- หน้าไหนต้องการสีหรือ component ที่ไม่มีในนี้ ให้คุยกันก่อนว่าควรเพิ่มเป็นของกลางหรือไม่

## 15. ตัวอย่างโค้ด frontend/src/app/globals.css

```css
/* frontend/src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-subtle: #EFF6FF;
  --color-on-primary: #FFFFFF;

  --color-bg: #FFFFFF;
  --color-surface: #F8FAFC;
  --color-border: #E2E8F0;
  --color-border-strong: #94A3B8;
  --color-text: #0F172A;
  --color-text-secondary: #475569;
  --color-text-disabled: #94A3B8;

  --color-danger: #DC2626;
  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-info: #0284C7;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

ใช้ในโค้ดเป็น class ของ Tailwind เช่น `bg-primary text-on-primary rounded-md`

## 16. ประวัติการแก้ไข

| วันที่ | แก้ไขโดย | รายละเอียด |
|---|---|---|
| 2026-10-11 | [ชื่อ] | สร้างเอกสาร พร้อม component ที่หน้า Login ใช้ |
