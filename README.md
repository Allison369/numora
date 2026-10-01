# TeleRent — Commercial Phone Number Rental Platform

A turnkey, multi-tenant phone number rental SaaS that lets you acquire real phone numbers via programmable telecom APIs (Twilio, Telnyx, or wholesale carrier connections) and rent them to your customers. 

**Your customers never deal with or see the underlying telecom carrier.**

---

## 🏗️ Architecture Overview

```mermaid
graph LR
    subgraph Telecom Carriers
        T[Twilio / Telnyx / SIP]
    end

    subgraph TeleRent Backend (Node.js + PostgreSQL)
        A[Carrier Abstraction Adapter]
        DB[(PostgreSQL Database)]
        R[Rental State Machine]
        W[Background Expiration Worker]
        H[Inbound Webhook & OTP Parser]
        SSE[Real-time SSE Hub]
    end

    subgraph Customer Experience
        UI[Customer Web Portal]
        DEV[Customer Developer Webhook]
    end

    T -- "Wholesale Provisioning" --> A
    T -- "Inbound SMS Webhook" --> H
    H --> DB
    H -- "Instant Push" --> SSE --> UI
    H -- "Asynchronous Mirror" --> DEV
    UI -- "Browse & Rent" --> R --> DB
    W -- "Auto-Renew / Expire" --> R
```

---

## 🚀 Key Features

1. **Carrier Abstraction Layer**:
   - Pluggable provider architecture (`services/telephony/`).
   - Supports **Twilio**, **Telnyx**, and a **Built-in High-Fidelity Sandbox Engine** that runs out of the box with zero external API fees.
   - Masks wholesale costs ($1.00–$1.15/mo) and sells at retail subscription prices ($4.99/mo or $1.99/wk).

2. **Customer Portal & Lifecycle Management**:
   - Registration and authentication with JWT & bcrypt password hashing.
   - Filter numbers by Country (US, GB, CA, AU, DE, FR), Number Type (Local, Toll-Free, Mobile), and Capabilities (SMS, MMS, Voice).
   - One-click Renting with automatic balance check, deduction, and instant provisioning.
   - Active rentals list with expiration countdown, cancellation, and auto-renew toggle.

3. **Inbound SMS Webhook & Smart OTP Extractor**:
   - Ingests inbound carrier webhooks at `/api/webhooks/telephony/inbound-sms`.
   - Zero-join database lookup matching `To` phone number to active tenant.
   - Heuristic regex engine that parses OTP, 2FA, and PIN verification codes automatically.
   - Server-Sent Events (SSE) push delivering messages to customer inboxes in < 50ms.
   - Custom customer developer webhook forwarding option.

4. **Wallet, Billing & Financial Ledger**:
   - Customer wallet balance with double-entry transaction history (`transactions` table).
   - Instant top-up system + Stripe Checkout Session integration.
   - Automated lease renewal cron job (`services/expirationWorker.js`) running every 30s.

5. **Integrated Inbound SMS Simulator**:
   - Test receiving SMS and 2FA tokens directly inside the portal without needing a second physical phone.

---

## 💻 Running the Platform

### 1. Database
The system uses PostgreSQL running on port 5432:
```bash
# Started via Docker:
docker run -d --name telerent-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=telerent -p 5432:5432 postgres:16-alpine
```

### 2. Database Schema Initialization & Seeding
```bash
npm run db:init
```
*(Pre-seeds demo account: `demo@telerent.io` / `password123` with $25.00 trial balance and international inventory)*

### 3. Start the Server
```bash
npm start
```
- Web Application: **[http://localhost:3000](http://localhost:3000)**
- Customer Console: **[http://localhost:3000/app.html](http://localhost:3000/app.html)**

---

## ⚙️ Connecting Live Telecom Providers

To connect live carrier accounts, edit your `.env` file:

### Twilio
```env
TELEPHONY_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token
```

### Telnyx
```env
TELEPHONY_PROVIDER=telnyx
TELNYX_API_KEY=KEY01XXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TELNYX_CONNECTION_ID=your_connection_id
```

### Stripe Payments
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
