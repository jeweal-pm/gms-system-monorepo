# ADR-0025: Quotation Module — Frontend Structure

- **Status:** Proposed (draft — คาดว่าจะมีการแก้ไข)
- **Date:** 2026-10-21
- **Branch:** `feat/21-10-26-Quotation`
- **Scope:** frontend เท่านั้น (Next.js) — **backend ยังไม่อยู่ในขอบเขต** ใช้ mock data ไปก่อน

---

## 1. Context

ระบบ GMS ต้องมีหน้า **Quotation** ใต้เมนู Pre-Sale สำหรับออกใบเสนอราคาพลอย ใน concept UI หน้านี้ประกอบด้วย

- **Header:** Quotation No. (`QTGMS2609001`) + status stepper `Save → Pending Approval → Approve → Approved` + action bar (Print, Excel, Duplicate, Refresh, Cancel, Save, Edit, Delete)
- **Info form:** Doc Date, Due Date, Customer, Shipping Address, Invoice Address, Currency, Exchange Rate, Ref.
- **Items:** ตารางพลอย (Stone Code / Location / Stone / Color · Clarity / Cer / PCS / Weight / Sale Price / Amount / More) มีแถวว่างเริ่มต้น 5 แถว เพิ่มได้ 2 ทาง
  1. คลิกแถว → **side panel "New item"** (Row x of N, prev / next, Remove row, Next row)
  2. **From Stock** → modal เลือกพลอยหลายรายการ แล้วข้อมูลจะ fill และ lock อัตโนมัติ
- **Photo box:** รูปของแถวที่เลือก ≤ 4 รูป + Item Note
- **Document Note:** ≤ 500 ตัวอักษร
- **Summary Value:** Subtotal → Discount (% / amount) → Total after Discount → Tax (VAT 7%) → Other Charge (Service Charge, Labor แบบ pcs / weight) → Grand Total
- **Right rail:** ปุ่มเปิด panel **Daybook** และ **Summary Value**

Stack ฝั่ง frontend ที่มีอยู่: Next.js (App Router), TanStack Query, react-hook-form, zod, Tailwind

---

## 2. Decisions

### D1. Routes

```
app/pre-sale/quotation/
  page.tsx            # list (ทำทีหลัง)
  page.tsx            # create (ยังไม่มีหน้า list) — sidebar ลิงก์มาที่นี่
  [id]/page.tsx       # view / edit
```

ทั้ง `page.tsx` และ `[id]` ใช้ component `QuotationForm` ตัวเดียวกัน ต่างกันแค่ค่าเริ่มต้นและ mode

### D2. Folder structure (feature-based)

```
src/features/quotation/
  components/
    QuotationForm.tsx            # root: FormProvider + layout
    header/
      QuotationHeader.tsx        # doc no + stepper + actions
      StatusStepper.tsx
      QuotationActions.tsx
    info/
      QuotationInfoForm.tsx      # header fields
    items/
      ItemSection.tsx            # title "Item · N rows" + From Stock + toolbar
      ItemTable.tsx
      ItemRow.tsx                # filled row / empty-row placeholder
      ItemTotalsRow.tsx
      ItemEditorPanel.tsx        # side panel "New item"
      ItemPhotoBox.tsx           # ≤4 photos + item note
      FromStockModal.tsx
    summary/
      SummaryValue.tsx           # ใช้ทั้งใต้ตารางและใน right rail
      DiscountField.tsx
      TaxField.tsx
      OtherChargeField.tsx
      LaborField.tsx
      GrandTotal.tsx
    note/
      DocumentNote.tsx
    rail/
      RightRail.tsx
      DaybookPanel.tsx
      SummaryPanel.tsx
  hooks/
    useQuotationForm.ts          # RHF setup + useFieldArray
    useQuotationTotals.ts        # useWatch → calculate
    useItemEditor.ts             # active row index, prev/next
  lib/
    calculate.ts                 # pure functions (มี unit test)
    defaults.ts                  # empty quotation / empty line
    format.ts                    # money, weight, date
  schema.ts                      # zod schema + inferred types
  mock/
    stock.ts                     # mock สำหรับ From Stock
    masters.ts                   # customer / address / stone options
    daybook.ts
  api.ts                         # data access layer (ตอนนี้ return mock)
```

> `api.ts` เป็นจุดเดียวที่ component ใช้ดึงข้อมูล ตอนนี้ return mock พอ backend พร้อมค่อยเปลี่ยนเป็น tRPC call โดยไม่ต้องแก้ component

### D3. Form state

- **react-hook-form + zodResolver** เป็น state เดียวของเอกสารทั้งใบ
- `useFieldArray` ใช้กับ `lines` และ `charges`
- ค่าที่คำนวณได้ (amount, subtotal, grand total) **ไม่เก็บใน form** ให้ derive จาก `useWatch` ผ่าน `useQuotationTotals`
- UI state ที่ไม่ใช่ข้อมูลเอกสาร (row ที่เลือก, panel ที่เปิดอยู่, modal) เก็บใน `useState` ที่ `QuotationForm` หรือ context เล็กๆ ของ feature
- TanStack Query ใช้กับข้อมูลที่ดึงมา (options, stock list, daybook) ผ่าน `api.ts`

### D4. Types (zod schema คร่าวๆ)

```ts
type QuotationStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";

type QuotationLine = {
  key: string;                       // client id (ใช้กับ useFieldArray)
  source: "MANUAL" | "STOCK";
  stockId?: string; lot?: string; stoneCode?: string; locationId?: string;
  stone?: string; shape?: string; size?: string;
  color?: string; clarity?: string; cutting?: string; quality?: string;
  cerType?: string; cerNo?: string;
  pcs: number; weightCt: string;     // decimal เก็บเป็น string
  priceUnit: "PER_CT" | "PER_PCS"; unitPrice: string;
  photos: PhotoRef[];                // max 4
  itemNote?: string;
};

type QuotationFormValues = {
  docNo?: string; status: QuotationStatus;
  docDate: string; dueDate: string;
  customerId: string; shippingAddressId: string; invoiceAddressId: string;
  currency: string; exchangeRate?: string; ref?: string;
  lines: QuotationLine[];
  discount: { enabled: boolean; type: "PERCENT" | "AMOUNT"; value: string };
  tax: { enabled: boolean; code: string; rate: string };
  serviceChargeIds: string[];
  labor: { enabled: boolean; work?: string; basis: "PCS" | "WEIGHT"; qty: string; rate: string };
  documentNote?: string;             // ≤500
};
```

- แถวที่ **ว่างอยู่** (ยังไม่มี stoneCode / stockId) ไม่นับใน validation และไม่นับในยอดรวม
- แถวที่ `source = "STOCK"` ให้ field คุณสมบัติพลอยเป็น read-only

### D5. การคำนวณ — `lib/calculate.ts`

ใช้ decimal lib (เช่น `decimal.js`) ห้ามใช้ JS float กับเงิน

```
line.amount          = priceUnit = PER_CT ? weightCt × unitPrice : pcs × unitPrice
subtotal             = Σ line.amount
discountAmount       = PERCENT ? subtotal × value / 100 : value
totalAfterDiscount   = subtotal − discountAmount
-- tax.includeInPrice = false
priceBeforeTax       = totalAfterDiscount
taxAmount            = tax.enabled ? priceBeforeTax × (tax.rate ÷ 100) : 0      -- tax.rate กรอกเองเป็น %
-- tax.includeInPrice = true (ราคารวม VAT แล้ว → ถอด VAT ออก)
priceBeforeTax       = totalAfterDiscount ÷ (1 + rate)
taxAmount            = totalAfterDiscount − priceBeforeTax
serviceCharges       = Σ charge.amount          (เลือกได้หลายรายการ เช่น Shipping, Handling fee)
laborAmount          = basis = PCS ? qty × rate : qty(ct) × rate
grandTotal           = priceBeforeTax + taxAmount + serviceCharges + laborAmount
```

ตรวจกับ mockup แล้ว: 29,760 + 72,800 + 28,812 = **131,372.00** ✔
เขียนเป็น pure function + unit test เพื่อนำไปใช้ซ้ำฝั่ง backend ได้ในภายหลัง

### D6. Item editing

- คลิกแถวในตาราง → เปิด `ItemEditorPanel` ทางขวา และ highlight แถวนั้น
- ปุ่ม ▲ / ▼ = เลื่อนไปแถวก่อน / ถัดไป, **Next row** = ไปแถวถัดไป (ถ้าเป็นแถวสุดท้ายให้เพิ่มแถวใหม่)
- **Remove row** = ลบแถวที่เลือก, ⊖ ในตาราง = ลบแถวนั้น
- Panel bind กับ `lines.${index}` โดยตรง (ไม่ต้อง copy state)
- เมื่อ panel เปิด ตารางจะแคบลง และ right rail กับ panel ไม่แสดงพร้อมกัน

### D7. From Stock

- `FromStockModal`: search + ตัวกรองวันที่ + ตาราง checkbox เลือกได้หลายแถว
- กด OK → เติมลงแถวว่างก่อน ถ้าแถวว่างไม่พอให้ append แถวใหม่ → `source = "STOCK"` → แสดง toast "Added N items from stock"
- ซ่อน / disable stock ที่อยู่ในเอกสารแล้ว (ห้ามซ้ำ)
- ตอนนี้ใช้ข้อมูลจาก `mock/stock.ts`

### D8. Mode & status

| Status | Mode | Edit | Delete | Save |
|---|---|---|---|---|
| ใหม่ (ยังไม่มี docNo) | edit | – | – | ✔ |
| DRAFT | view → กด Edit | ✔ | ✔ | ✔ (ตอน edit) |
| PENDING_APPROVAL / APPROVED | view | ✗ | ✗ | ✗ |

- คำนวณ `mode` จาก status ที่ `QuotationForm` แล้วส่งลงไปเป็น `disabled` / `readOnly`
- Permission จริงรอ backend ตอนนี้ hard-code ไปก่อนเป็นเปิดทุกสิทธิ์

### D9. Right rail

- Icon bar ขวาสุดมีปุ่ม Daybook 🔍 และ Summary
- คลิกเพื่อเปิด panel (เปิดได้ทีละ panel) ปุ่ม × เพื่อปิด
- `SummaryPanel` ใช้ `SummaryValue` ตัวเดียวกับที่อยู่ใต้ตาราง
- `DaybookPanel` แสดง **รายการเอกสาร Quotation** (#, จุดสถานะ: ส้ม = รออนุมัติ, เขียว = อนุมัติแล้ว, เลขเอกสาร, ลูกค้า, วันที่) โดยเอกสารที่รออนุมัติอยู่บน ส่วนที่อนุมัติแล้วอยู่ล่าง ถ้าไม่มีข้อมูลให้แสดง "No results found."

---

## 3. Consequences

**ข้อดี**
- ทำ UI ครบ flow ได้ก่อนโดยไม่ต้องรอ backend
- `api.ts` + `schema.ts` + `calculate.ts` เป็นสัญญา (contract) ที่ backend เอาไปใช้อ้างอิงได้
- Feature folder แยกชัด ทำให้แบ่งงานกันได้ (items / summary / header)

**ข้อเสีย / ความเสี่ยง**
- Mock data อาจไม่ตรงกับ shape จริงของ backend ต้องปรับ schema ภายหลัง
- เลขเอกสาร, status flow และ permission เป็นแบบจำลองชั่วคราว

---

## 4. Open Questions

1. **Currency:** ราคาเป็น USD แต่ Total after Discount แสดงเป็น THB → ต้องแปลงด้วย exchange rate หรือไม่? ปุ่ม toggle `% / THB` ของ Discount ควรเปลี่ยนตาม currency ของเอกสารหรือเปล่า?
2. **Tax base:** VAT คิดรวม Service Charge / Labor ด้วยหรือไม่?
3. **Service Charge:** เลือกได้หลายรายการไหม? คิดเป็น % หรือ fixed?
4. **Labor:** มีได้รายการเดียวต่อเอกสารใช่ไหม?
5. **Due Date:** หมายถึง valid until ใช่ไหม? ค่า default = Doc Date + N วัน?
6. **Item photo / note:** ผูกกับแถวที่เลือกอยู่ใช่ไหม? (ใน mockup กล่องรูปอยู่ข้างตาราง)
7. ตอนกด **Cancel** ระหว่าง edit → ทิ้งการแก้ไขและกลับเป็น view พร้อมยืนยันก่อน?
8. ตอนเปลี่ยน Customer → reset Shipping / Invoice Address อัตโนมัติ?

---

## 5. UI notes จาก mockup (ส่งต่อ designer)

- Document Note placeholder มีข้อความ `placeholder="..."` ติดมาด้วย
- กล่อง Labor: label "Total after Discount" ควรเป็น "Labor Total"
- ปุ่ม "Create User" บนหน้า Quotation น่าจะไม่เกี่ยว
- "Rfe." → "Ref."
- From Stock modal: "Search for a project" → "Search stock code / stock ID / lot"
- Toast "Added 1 item from stock" แต่เพิ่มไป 3 รายการ
- Modal ตัวอย่าง: Weight / Sale Price เป็น 0.00 แต่ Amount มีค่า (mock ไม่สอดคล้อง)
- Totals weight ในตารางแสดง 3.66 แต่ผลรวมจริงคือ 0.62 + 1.12 + 2.94 = 4.68
- Tax 7% แสดง "10,386.04.04" → ควรเป็น "10,386.04"
- "Total other charges" ใช้ font monospace ต่างจากส่วนอื่น

---

## 6. Phasing (frontend)

1. Layout + Header + Info form + Item table (แถวว่าง) + Summary (คำนวณได้)
2. Item editor panel (prev / next / remove / next row)
3. From Stock modal (mock) + photo box + item note
4. Right rail (Daybook / Summary panel) + mode view/edit + status stepper
5. เชื่อม backend (ADR แยก) → [ADR-0032](0032-quotation-backend-in-master-service.md) (Accepted 2026-10-26)

---

## 8. Revision 2026-10-26 (owner, Figma row panel)

- **รูป:** อัปโหลด/ลบ/ตั้งรูปหลักย้ายไปที่แถบด้านข้างของ row (ส่วน "Photos n / 5": Add files, ลากวาง, สูงสุด 5 รูป) กล่องรูปทางซ้ายดูได้อย่างเดียว เลื่อนดูและกดขยาย (lightbox) ได้
- **ส่วนลดต่อรายการ:** เพิ่ม Discount (%) และ Discount Amt ในแถบด้านข้าง กรอกได้ช่องเดียว (SA-QT-08a)
- **Amount:** แสดงในตารางเท่านั้น ไม่แสดงในแถบด้านข้าง

## 7. Revision 2026-10-21 (feedback จาก owner)

- **Photo:** viewer เลื่อนดูทีละรูป (1…4) พร้อมตัวนับ `Photo · n / N`, thumbnail และมงกุฎสำหรับตั้งรูปหลัก (รูปหลัก = `photos[0]`) เลื่อนดูได้แม้อยู่ใน view mode
- **Select:** ใช้ dropdown แบบ custom (`SelectMenu` / `FormSelect`) แทน native `<select>`
- **Tax:** เปลี่ยนจาก dropdown เป็นช่องกรอก % (`tax.rate`, ค่าเริ่มต้น 7)
- **Stock ID / Location:** กล่องสีเทา กรอกไม่ได้ แสดงค่าเมื่อมาจาก From Stock เท่านั้น ส่วน Lot กรอกได้ในแถว manual
- **ช่องตัวเลข** (ราคา, จำนวน, น้ำหนัก, %, ค่าบริการ, ค่าแรง): กรองตัวอักษรออก (`sanitizeDecimal`) เหลือตัวเลขและจุดทศนิยมจุดเดียว
