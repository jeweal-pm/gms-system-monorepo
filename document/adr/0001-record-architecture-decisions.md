# ADR-0001: เริ่มต้นด้วยสถาปัตยกรรมแบบ Microservices

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

โปรเจคนี้เป็นระบบ web application ที่เพิ่งเริ่มพัฒนา ทีมมีนักพัฒนา 3 คน
ต้องส่งมอบให้ลูกค้าทดลองใช้ภายใน 3 เดือน

ตอนนี้ความต้องการของระบบยังไม่นิ่ง คาดว่า feature และขอบเขตของแต่ละส่วน
จะเปลี่ยนอีกหลายรอบหลังได้ feedback จากผู้ใช้จริง


## Decision

- เราจะพัฒนาเป็น **Microservices ตั้งแต่ต้น** เพื่อแยก scale และ deploy แต่ละ service ได้อิสระ
  โดยทีมต้องดูแลหลาย service, CI/CD, network และ distributed transaction

- Docker Compose file ที่พร้อมใช้งานทั้ง local และ production
- Production baseline คือ **RAM 4 GB และ 2 vCPU** (เดิม 8 GB / 4 vCPU; เปลี่ยนตาม [ADR-0024](0024-production-host-4gb-2vcpu.md) เมื่อ 2026-10-19) ทุก service, image, connection pool,
  worker concurrency และ Docker configuration ต้องออกแบบให้ระบบทั้งหมดอยู่ภายในขีดจำกัดนี้
  โดยกันทรัพยากรไว้ให้ OS และ Docker host ด้วย

- รูปแบบการพัฒนา ในแต่ละ Module จะต้องเผื่อไว้ให้สามารถพัฒนาได้ภายหลัง โดยไม่กระทบระบบโดยรวมทั้งหมด


Version Control

เราจะใช้ GITHUB เป็น Version Control และทำในยรูปแบบ Monorepo ( 1 repo รันทั้ง frontend-backend )
เพราะทำให้ง่ายต่อการควบคุม ผ่าน human และ AI


กติกาที่ทีมต้องทำตาม:
- แบ่ง module ตาม domain เช่น `user`, `order`, `payment`, `notification`
- แต่ละ module เรียกกันผ่าน public interface ที่กำหนดไว้เท่านั้น
- ห้าม import class ภายในของ module อื่นโดยตรง
- แต่ละ module เป็นเจ้าของตารางในฐานข้อมูลของตัวเอง
- ห้าม query ตารางของ module อื่นตรงๆ
- ใช้ฐานข้อมูลเดียว (PostgreSQL) แต่แยก schema ตาม module

ทางเลือกที่พิจารณาแล้วไม่เลือก:
    การทำแบบเป็น MVP  เพราะ เวลาในการทำค่อนข้างน้อยอยู่แล้ว module ที่ออกไป ต้องพร้อมใช้งานทันที

## Consequences

**ข้อดี**
- แยก deploy และ scale service ตาม domain ได้
- ขอบเขตและเจ้าของข้อมูลแต่ละ service ชัดเจน

**ข้อเสีย**
- ทีมต้องดูแล service, network, CI/CD และ distributed transaction เพิ่มขึ้น

**สิ่งที่ต้องทำต่อ**
- ตั้งค่าเครื่องมือตรวจ dependency ระหว่าง module ใน CI
- ทบทวน resource limits และการใช้ CPU/RAM จาก workload จริงก่อนเพิ่ม replica หรือ worker
