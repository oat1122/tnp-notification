# Code Review — 2026-05-08

Reviewer: Claude (Opus 4.7)
Scope: ทั้งโปรเจกต์ `tnp-notification` + cross-check กับ
- `E:\TNP-FormHelpers\tnp-backend\app\Services\NotificationService.php`
- `E:\TNP-FormHelpers\tnp-backend\config\services.php`
- `E:\TNP-FormHelpers\tnp-frontend\src\hooks\useSocketNotification.js`

---

## สรุปผล

พบประเด็น **10 ข้อ** แบ่งตาม severity:

| # | Severity | หัวข้อ | กระทบ |
|---|---|---|---|
| 1 | 🔴 Critical | Socket.io ไม่มี auth — ใครก็ดักฟังของคนอื่นได้ | ความเป็นส่วนตัว |
| 2 | 🔴 High | `notification-sync` ฝั่ง FE ไม่มี handler — endpoint ตาย | feature เสียหาย |
| 3 | 🔴 High | `pino` ไม่อยู่ใน `package.json` | crash on fresh install |
| 4 | 🔴 High | Production auth bypass แบบเงียบ | API เปิดสาธารณะถ้าลืม set env |
| 5 | 🟡 Medium | ไม่มี JSON schema validation บน body | input ไม่ถูก validate, ไม่มี type guard |
| 6 | 🟡 Medium | `console.log` ปนกับ pino logger | log หาย, ไม่ structured |
| 7 | 🟡 Medium | ชื่อ env var API key ไม่ตรงกัน 2 repo | brittle config |
| 8 | 🟢 Low | Debug `fetchSockets()` อยู่ใน hot path | เปลือง resource |
| 9 | 🟢 Low | ไม่มี rate limiting | DoS risk จาก bug ใน BE worker |
| 10 | 🟢 Low | Body size limit เป็น default 1MB | DoS risk เล็กน้อย |

---

## รายละเอียด

### 1. 🔴 Critical — Socket.io ไม่มี authentication

**File:** [src/plugins/socket/index.ts:18-25](../../src/plugins/socket/index.ts#L18-L25)

```ts
io.on("connection", (socket) => {
  socket.on("join_user", (userId: string) => {
    socket.join(`user_${userId}`);
  });
});
```

**ปัญหา:**
- ไม่มีการ verify ว่า client ที่ connect เข้ามาเป็นใคร
- `join_user` รับ `userId` arbitrary จาก client → คน A join `user_<id_ของB>` ได้
- Notification ทั้งหมดของ user B จะ broadcast ไป A ทันที

**ยืนยันจาก FE side** ([tnp-frontend/src/hooks/useSocketNotification.js:131-138](../../../TNP-FormHelpers/tnp-frontend/src/hooks/useSocketNotification.js#L131-L138)):
- FE อ่าน `user_id` จาก `localStorage.getItem("userData")` ตรง ๆ
- ใครแก้ localStorage ก็เป็นใครก็ได้
- ไม่มี token ส่งตอน socket handshake

**Impact:** ดักฟัง notification ของ user อื่นได้ทั้งหมด รวมถึงข้อมูลลูกค้า, การโอนเปลี่ยนช่องทาง, อาจรวมข้อมูลทางการเงินในอนาคต

---

### 2. 🔴 High — `notification-sync` event ไม่มี handler ฝั่ง FE

**Files:**
- emit ที่ [src/modules/notify/notify.route.ts:65](../../src/modules/notify/notify.route.ts#L65) — `io.to(roomName).emit("notification-sync", ...)`
- Laravel เรียก `/notify/sync` ที่ [tnp-backend/app/Services/NotificationService.php:158](../../../TNP-FormHelpers/tnp-backend/app/Services/NotificationService.php#L158)
- FE listener — **ไม่มี!** [useSocketNotification.js](../../../TNP-FormHelpers/tnp-frontend/src/hooks/useSocketNotification.js) มีแค่ `socket.on("notification", ...)`

**ปัญหา:** Laravel call `syncNotificationCount()` แล้ว → notify emit `notification-sync` แล้ว → FE ไม่รับ unread count badge ไม่ update real-time

**ทางเลือก:**
- (A) เพิ่ม `socket.on("notification-sync", ...)` ใน FE → update unread count ตรง โดยไม่ต้อง refetch
- (B) ลบ endpoint `/notify/sync` + method `syncNotificationCount` ทิ้ง ถ้าไม่ใช้

ต้องคุยกับเจ้าของ feature ก่อนตัดสินใจ

---

### 3. 🔴 High — `pino` หายจาก `package.json`

**File:** [src/core/config/logger.ts:1](../../src/core/config/logger.ts#L1) `import pino from "pino"`

[package.json](../../package.json) มี `rotating-file-stream` แต่ไม่มี `pino`

**Impact:** `npm install` บนเครื่องใหม่ → `npm run dev` → `Cannot find module 'pino'` → crash

**คำอธิบายชั่วคราว:** ปัจจุบันรันได้เพราะมี `pino` ใน `node_modules` (อาจติดตั้งโดยตรง หรือเป็น transitive dep ของอะไรบางอย่าง) — ไม่ stable

---

### 4. 🔴 High — Auth bypass แบบเงียบใน production

**File:** [src/modules/notify/notify.route.ts:8-10](../../src/modules/notify/notify.route.ts#L8-L10)

```ts
if (config.nodeEnv === "production" && config.apiSecretKey) {
  // ตรวจ x-api-key
}
```

**ปัญหา:** ถ้า deploy prod แต่ลืม set `API_SECRET_KEY` → `config.apiSecretKey === null` → middleware ผ่าน → **endpoint เปิดสาธารณะ** ใครก็ POST notification ได้

ไม่มี warning, ไม่มี log ที่ boot — silent

---

### 5. 🟡 Medium — ไม่มี JSON schema validation

**File:** [src/modules/notify/notify.route.ts:22-27](../../src/modules/notify/notify.route.ts#L22-L27)

ใช้ manual check `if (!user_id || !title || !message)` → Fastify support JSON schema built-in (ผ่าน Ajv) ที่:
- Validate ก่อน handler รัน (เร็วกว่า)
- Auto reply 400 พร้อม error structure
- ป้องกัน oversized payload (`maxLength`)
- Generate types ฟรี (ผ่าน `@sinclair/typebox` หรือ `json-schema-to-ts`)

---

### 6. 🟡 Medium — `console.log` ปนกับ pino

**Files:**
- [src/plugins/socket/index.ts:19,24,28](../../src/plugins/socket/index.ts#L19) — connection log, join log, disconnect log
- [src/modules/notify/notify.route.ts:32,42,60](../../src/modules/notify/notify.route.ts#L32) — debug log

มี logger ดี ๆ แล้ว (rotating file ที่ `storage/logs/`) แต่ `console.log` ไม่ถูก capture ลงไฟล์ → log production จะหาย

---

### 7. 🟡 Medium — ชื่อ env var API key ไม่ตรงกัน

| Repo | Env var |
|---|---|
| `tnp-notification` | `API_SECRET_KEY` |
| `tnp-backend` | `NOTIFICATION_API_KEY` |

ทั้งคู่ต้อง set ให้ค่าเดียวกัน — ถ้าลืมตรงนี้ ผู้ดูแลจะงง เพราะชื่อต่างกัน

**แก้:** เปลี่ยนชื่อให้ตรงกัน (แนะนำ `NOTIFICATION_API_KEY` ทั้งคู่ — Laravel side มีหลายคนเรียกใช้, เปลี่ยนยากกว่า) หรืออย่างน้อย document ความสัมพันธ์ใน CLAUDE.md/.env.example

---

### 8. 🟢 Low — Debug `fetchSockets()` ใน hot path

**File:** [src/modules/notify/notify.route.ts:31-32, 59-61](../../src/modules/notify/notify.route.ts#L31-L32)

```ts
const socketsInRoom = await fastify.io.in(roomName).fetchSockets();
console.log(`Room ${roomName} has ${socketsInRoom.length} socket(s)`);
```

ทุก request เพื่อ log อย่างเดียว → ใน prod ไม่จำเป็น ทำให้ช้าลง

**แก้:** wrap ใน `if (config.nodeEnv === 'development')` หรือเปลี่ยนเป็น `fastify.log.debug(...)` (debug level จะถูก strip ใน prod)

---

### 9. 🟢 Low — ไม่มี rate limiting

Laravel เป็น trusted source ตอนนี้ก็จริง แต่:
- Bug ใน worker queue → loop call `notifyMany` ใส่ user เดียวกัน 1000 รอบ ได้
- ถ้า API key รั่ว → spam ได้ทันที

**แก้:** `npm i @fastify/rate-limit` แล้ว apply ที่ `/notify/*` (เช่น 100 req/sec per IP)

---

### 10. 🟢 Low — Body size limit ไม่ได้กำหนด

Fastify default = 1MB notification payload จริง ๆ < 1KB → ลดเหลือ 10KB กัน DoS

```ts
Fastify({ bodyLimit: 10240, loggerInstance: logger });
```

---

## แผนการแก้ไข

แก้ตามลำดับ severity บางข้อจะแยกเป็นหลาย step เพราะกระทบ cross-repo

### Phase 1 — แก้ทันที (วันเดียวจบ, low risk)

| Step | งาน | ไฟล์ | ความเสี่ยง |
|---|---|---|---|
| 1.1 | `npm install pino` + commit `package.json` | [package.json](../../package.json) | ไม่มี |
| 1.2 | Boot-time guard: ถ้า `NODE_ENV=production` แต่ไม่มี `API_SECRET_KEY` → throw | [src/server.ts](../../src/server.ts) (หรือสร้าง `core/config/validate.ts`) | ไม่มี |
| 1.3 | ลด body size limit เป็น 10KB | [src/app.ts](../../src/app.ts) | ไม่มี |
| 1.4 | ย้าย debug `fetchSockets()` log → wrap ด้วย `if dev` หรือ `logger.debug` | [src/modules/notify/notify.route.ts](../../src/modules/notify/notify.route.ts) | ไม่มี |
| 1.5 | สร้าง `.env.example` + document ความสัมพันธ์กับ `NOTIFICATION_API_KEY` ของ Laravel | `.env.example` (ใหม่) | ไม่มี |

**Output:** PR เดียว เปลี่ยนแค่ในรีโป tnp-notification, ไม่กระทบ FE/BE

---

### Phase 2 — Schema validation + structured logging (1-2 วัน)

| Step | งาน | ไฟล์ |
|---|---|---|
| 2.1 | สร้าง `notify.schema.ts` ด้วย JSON schema (POST /, POST /sync) | `src/modules/notify/notify.schema.ts` (ใหม่) |
| 2.2 | Refactor `notify.route.ts` ใช้ `{ schema: notifySchema }` แทน manual check | [src/modules/notify/notify.route.ts](../../src/modules/notify/notify.route.ts) |
| 2.3 | แทน `console.log` ทั้งหมด → `fastify.log.info/debug` | socket plugin + notify route |
| 2.4 | Update [CLAUDE.md](../../CLAUDE.md) ลบ tech debt warning เรื่อง console.log |

**Output:** PR เดียว ยังไม่กระทบ FE/BE

---

### Phase 3 — `notification-sync` decision (ต้องคุยกับ owner ก่อน)

ถามทีมก่อน 2 ทาง:

**Option A: เปิดใช้จริง**
- เพิ่ม `socket.on("notification-sync", ({ unread_count }) => ...)` ใน [useSocketNotification.js:170](../../../TNP-FormHelpers/tnp-frontend/src/hooks/useSocketNotification.js#L170) → set unread count ตรงเข้า RTK cache (อาจใช้ `dispatch(api.util.updateQueryData(...))`)
- ตรวจสอบจุดที่ Laravel เรียก `syncNotificationCount` ว่า trigger ถูกต้อง

**Option B: ลบทิ้ง**
- ลบ method `syncNotificationCount` ใน [tnp-backend NotificationService.php](../../../TNP-FormHelpers/tnp-backend/app/Services/NotificationService.php)
- ลบ endpoint `POST /notify/sync` ใน [notify.route.ts](../../src/modules/notify/notify.route.ts)
- ลบ `SyncPayload` type ใน [core/types/index.ts](../../src/core/types/index.ts)
- Update [socket-events.md rule](../../.claude/rules/socket-events.md)

**Output:** PR ข้าม 2-3 รีโป (ถ้าเลือก A) หรือ 2 รีโป (ถ้าเลือก B)

---

### Phase 4 — Socket authentication (งานใหญ่ที่สุด, ต้องวางแผนละเอียด)

**เป้าหมาย:** ห้าม client join `user_<id>` room ได้ ถ้าไม่ใช่เจ้าของ id นั้นจริง

**ทางเลือก:**

| Option | วิธี | Pros | Cons |
|---|---|---|---|
| A | Sanctum token verify โดย call Laravel `/api/v1/auth/me` ทุก connection | reuse token เดิม, ง่าย | latency เพิ่ม, dependency cycle |
| B | JWT ที่ Laravel ออกตอน login + notify verify ด้วย shared secret (HS256) | stateless, เร็ว | ต้องเพิ่ม JWT logic ใน Laravel |
| C | Signed token เฉพาะ socket: Laravel ออก `socket_token = HMAC(user_id + expires, secret)` | minimal change, no JWT lib | ต้อง endpoint ใหม่ใน Laravel |

**แนะนำ Option C** เพราะเปลี่ยนน้อยที่สุด และ scope แคบเฉพาะ socket auth

**Steps (Option C):**

1. **Laravel:** เพิ่ม endpoint `GET /api/v1/auth/socket-token` ที่:
   - require `auth:sanctum`
   - return `{ token: HMAC_SHA256(user_id + ":" + exp, NOTIFICATION_API_KEY), exp, user_id }`
2. **Notify service:** เพิ่ม middleware ใน socket plugin:
   - ตอน handshake รับ `auth.token` + `auth.user_id` + `auth.exp`
   - verify HMAC ด้วย `API_SECRET_KEY` เดียวกัน + check expiry
   - ถ้า valid → store `socket.data.userId = user_id`
   - `join_user` ignore arg ที่ client ส่งมา → ใช้ `socket.data.userId` แทน
3. **FE:** ก่อน `io(...)` ให้ fetch `/api/v1/auth/socket-token` แล้วส่ง `io(SOCKET_URL, { auth: { token, user_id, exp } })`
4. **Migration:** ปล่อย backward-compat 1 release (ถ้า `socket.data.userId` ไม่มี → log warning + ใช้ `userId` เดิม) → release ถัดไปบังคับ

**Output:** PR ข้าม 3 รีโป + migration plan

**Risk:** สูง — ถ้าทำพลาด user notification ทั้งระบบใช้ไม่ได้ ควรมี feature flag

---

### Phase 5 — Hardening (optional, ทำตอน scale)

- 9. Rate limiting (`@fastify/rate-limit`)
- (เพิ่ม) Helmet headers
- (เพิ่ม) Sentry/error tracking
- (เพิ่ม) Health check ตรวจ socket count + memory usage

---

## ลำดับ recommend

1. **Phase 1** ทันที (1 PR, low risk)
2. **Phase 2** สัปดาห์หน้า (1 PR, low risk)
3. **Phase 3** ตัดสินใจกับทีม (decide ก่อน implement)
4. **Phase 4** วางแผนเป็น sprint แยก (sensitive feature, ต้อง coordinate 3 รีโป)
5. **Phase 5** ตามว่าง

ห้ามขึ้น production จนกว่าจะแก้ Phase 1 + Phase 4 อย่างน้อย เพราะ:
- Phase 1.2 (auth bypass guard) — ลืมแล้ว = endpoint เปิดให้สาธารณะ spam
- Phase 4 (socket auth) — ลืมแล้ว = privacy leak

---

## ภาคผนวก: ข้อมูล cross-repo ที่ใช้รีวิว

**Laravel sends `user_id` as string** ([NotificationService.php:56](../../../TNP-FormHelpers/tnp-backend/app/Services/NotificationService.php#L56)):
```php
'user_id' => (string) $userId,
```
→ ตรงกับ `NotificationPayload.user_id: string` ใน [core/types/index.ts](../../src/core/types/index.ts) ✅

**Laravel header** ([NotificationService.php:50](../../../TNP-FormHelpers/tnp-backend/app/Services/NotificationService.php#L50)):
```php
$headers['X-API-Key'] = $this->apiKey;
```
→ Node http headers case-insensitive, ตรงกับ `request.headers["x-api-key"]` ใน notify route ✅

**FE socket connection** ([useSocketNotification.js:131-139](../../../TNP-FormHelpers/tnp-frontend/src/hooks/useSocketNotification.js#L131-L139)):
```js
socketRef.current = io(SOCKET_URL, { transports: ["websocket", "polling"] });
socketRef.current.on("connect", () => {
  socketRef.current.emit("join_user", user.user_id);
});
```
→ ไม่มี `auth` payload, `user.user_id` มาจาก localStorage (untrusted)
