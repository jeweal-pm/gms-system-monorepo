# Login Flow Diagrams

- **Last updated:** 2026-10-12 ([ADR-0015](../adr/0015-remove-forgot-password-and-email.md): เอา forgot password และ email ออก)
- **ต้นฉบับ:** Excalidraw (แนบลิงก์ไฟล์ต้นฉบับที่นี่)

> Diagram เขียนด้วย Mermaid แสดงผลได้ใน GitHub, GitLab, VS Code (ติดตั้ง extension Markdown Preview Mermaid)

## 1. ภาพรวม Flow หน้า /login

ล็อกบัญชี 1 นาทีเมื่อใส่ password ผิดครบ 3 ครั้ง ดู [ADR-0012](../adr/0012-change-flow-login.md)

```mermaid
flowchart TD
    A["/login"] --> B{"Login"}
    B -->|"login ปกติ"| C["กรอก email + password"]
    B -->|"ลืมรหัสผ่าน"| F["ติดต่อผู้ดูแลระบบ (นอกระบบ)"]
    C --> D{"Login สำเร็จ?"}
    D -->|"ใช่"| E["Redirect ไปหน้า Home"]
    D -->|"ไม่"| H{"ผิดครบ 3 ครั้ง?"}
    H -->|"ยัง (เหลืออีก n ครั้ง)"| C
    H -->|"ครบ"| L["รอ 1 นาที<br/>(นับถอยหลัง)"]
    L --> C
    E -.->|"เมื่อต้องการ (ไม่บังคับ)"| P["Super Admin Profile page<br/>เปลี่ยน password"]
```

## 2. Login และการล็อกบัญชีชั่วคราว

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend (/login)
    participant BE as Backend API
    participant DB as Database

    U->>FE: เปิดหน้า Login
    U->>FE: กรอก email + password แล้วกด Login
    FE->>BE: POST /api/auth/sign-in/email (email, password)
    BE->>DB: ค้นหา user จาก email
    DB-->>BE: ข้อมูล user (password_hash, failed_login_count, locked_until)

    alt ถูกล็อกอยู่ (locked_until > now)
        BE->>DB: บันทึก login attempt (failed)
        BE-->>FE: 423 Locked + retryAfterSeconds
        FE-->>U: แจ้ง กรุณารอ 1 นาที พร้อมนับถอยหลัง
    else ไม่ได้ถูกล็อก
        BE->>BE: ตรวจสอบ password กับ password_hash

        alt password ถูกต้อง
            BE->>DB: failed_login_count = 0, locked_until = null, last_login_at = now
            BE->>DB: สร้าง session
            BE->>DB: บันทึก login attempt (success)
            BE-->>FE: 200 + HttpOnly session cookie
            FE-->>U: Redirect ไปหน้า Home
        else password ไม่ถูกต้อง
            BE->>DB: failed_login_count + 1
            BE->>DB: บันทึก login attempt (failed)

            alt ผิดยังไม่ครบ 3 ครั้ง
                BE-->>FE: 401 + attemptsRemaining
                FE-->>U: แจ้ง email หรือ password ไม่ถูกต้อง (เหลืออีก n ครั้ง)
            else ผิดครบ 3 ครั้ง
                BE->>DB: locked_until = now + 1 นาที, failed_login_count = 0
                BE-->>FE: 423 Locked + retryAfterSeconds: 60
                FE-->>U: แจ้ง ใส่ password ผิด 3 ครั้ง กรุณารอ 1 นาที
                FE->>FE: นับถอยหลัง 60 วินาที แจ้งเวลาที่จะกด Login ใหม่ได้
                FE-->>U: ครบเวลา เปิดให้ Login ใหม่ได้
            end
        end
    end
```

## 3. สร้าง User ผ่าน CRM

```mermaid
sequenceDiagram
    participant CRM
    participant API as Our System
    participant DB
    participant U as User

    CRM->>API: POST /api/v1/users (email, name, role, password) ผ่าน HTTPS
    alt password ไม่ผ่าน policy หรือข้อมูลไม่ครบ
        API-->>CRM: 400 PASSWORD_POLICY_VIOLATION / VALIDATION_ERROR
    else ผ่าน
        API->>DB: บันทึก user + Argon2id password hash
        API-->>CRM: 201 Created (ไม่มี password)
        CRM-->>U: แจ้งรหัสผ่านเริ่มต้นทางช่องทางของ CRM (ดู ADR-0015)
    end
```

## 4. Forgot Password (ยกเลิกแล้ว)

เอาออกตาม [ADR-0015](../adr/0015-remove-forgot-password-and-email.md) ผู้ใช้ที่ลืมรหัสผ่านติดต่อผู้ดูแลระบบนอกระบบ

## 5. เปลี่ยน Password ที่ Profile Page

```mermaid
sequenceDiagram
    actor U as User
    participant UI as Profile Page
    participant API as Our System

    U->>UI: กรอก password ใหม่ + confirm
    UI->>UI: validate ตาม password policy (real-time)
    U->>UI: กด Save
    UI->>API: PUT /me/password
    alt ผ่าน
        API-->>UI: 204
        UI-->>U: แจ้งเปลี่ยนสำเร็จ (session ปัจจุบันอยู่ต่อ, session อื่นถูก invalidate)
    else ไม่ผ่าน
        API-->>UI: 400 + violations
        UI-->>U: แสดง error
    end
```

## หมายเหตุ

Flow ต้นฉบับมีส่วนที่เป็นสีจาง (popup บังคับเปลี่ยนรหัสหลัง login ครั้งแรก
และ log out หลัง save) diagram ข้างบนวาดตามการตัดสินใจล่าสุดใน ADR-0011
ซึ่งเลือก Profile page แทน popup ตาม ADR-0011
