# Lorescale Voice — User Guide

Lorescale is an AI voice assistant for your business. Customers open a link (no app install), talk to your AI, and can order, ask questions, or book appointments — depending on how you set up the store.

There are two sides:

| App | Who uses it | Purpose |
|---|---|---|
| **Admin** | You / staff | Set up the store, menu, AI, orders |
| **Customer app** | Your customers | Talk to the AI at `/b/{your-store-slug}` |

> Bahasa Indonesia: [USER-GUIDE.id.md](./USER-GUIDE.id.md)

---

## 1. Create your account

1. Open the **Admin** app and go to **Sign up**.
2. Enter email + password and create the account.
3. You’ll be guided through onboarding.

### Step A — Workspace

- Enter your **business name**.
- A URL slug is generated automatically (e.g. `Sunrise Coffee` → `sunrise-coffee`).
- Your customer link will be:  
  `https://your-customer-app/b/sunrise-coffee`

### Step B — Business setup

Choose:

1. **Business type** — Food & beverage, Retail, Salon & barber, Healthcare, or Other
2. **Primary use case**
   - **Take orders** — menu, cart, checkout
   - **Answer FAQs** — Q&A only (no menu/checkout)
   - **Both** — orders + support
   - **Salon:** Book appointments / FAQs / Both
3. **Default language** — Indonesian or English

After this, you land on the **Overview** dashboard.

---

## 2. Admin dashboard (quick map)

Sidebar items depend on your use case:

| Page | When it appears | What it does |
|---|---|---|
| **Overview** | Always | Today’s stats, welcome tips, link to customer app |
| **Menu** / **Treatments** | Ordering or booking | Products or salon treatments |
| **Appointments** | Booking enabled | View bookings |
| **Schedule** | Booking enabled | Open hours for availability |
| **AI Knowledge** | Always | Facts the AI can answer (hours, policies, etc.) |
| **AI Rules** | Always | Personality, tone, language, behavior |
| **Orders** | Ordering enabled | Live / past orders |
| **Conversations** | Always | Voice session history |
| **Payment QR** | Ordering enabled | QR customers scan at checkout |
| **Appearance** | Always | Background + brand look of the customer page |
| **Analytics** | Always | Trends and top products |

Top bar:

- **AI Online / Offline** status
- **Customer app** — opens your public link in a new tab

---

## 3. Set up your store (recommended order)

### A. Menu / Treatments

1. Open **Menu** (or **Treatments** for salons).
2. Add items: name, price, category, description, optional image.
3. For salons, set **duration** (used for booking slots).
4. Optional: discounts.

Categories (examples): Coffee, Pastry, Food, Drinks — or Haircuts, Color, Styling for salons.

### B. AI Knowledge

Add short facts the AI should know, e.g.:

- Opening hours
- Parking / Wi‑Fi
- Payment methods
- Policies (refunds, allergens)

Categories: General, Hours, Menu, Policies, Payment.

### C. AI Rules

Tune how the assistant behaves:

- **Language** — Indonesian or English (default)
- **Tone** — Friendly, Professional, or Casual
- **Personality** — who the AI is
- **Behavioral rules** — what it should / shouldn’t do
- **Tool instructions** — how it should use menu/order/booking tools
- Optional: assistant name + avatar

### D. Payment QR (ordering businesses)

Upload the QR code customers scan to pay (e.g. QRIS). Shown at checkout after they confirm the order.

### E. Appearance

Set the customer page background and bottom gradient so it matches your brand.

### F. Schedule (appointment businesses)

Set open/close times per day. Closed days won’t offer slots.

---

## 4. Share with customers

Your public link:

```
{customer-app-url}/b/{your-slug}
```

Local demo example: `http://localhost:6670/b/sunrise-coffee`

Share via:

- Link in WhatsApp / Instagram / bio
- Printed QR that opens the same URL
- **Customer app** button in Admin

Works in **Chrome or Safari**. Customers must **allow microphone** access.

---

## 5. Customer experience (how to use the voice page)

### Start talking

1. Open the store link.
2. Allow microphone when prompted.
3. **Hold the mic button** (push-to-talk) and speak.
4. Release when finished — the AI replies by voice.
5. Watch the **transcript** update live.

Status in the header: Ready → Connecting… → **Live**.

### Language

Use **ID / EN** to switch. If a session is live, it reconnects with the new language.

### Ordering flow (if enabled)

1. Say what you want, e.g. *“I’d like a latte and a croissant”*, **or** open the **menu** and tap items.
2. Open the **basket** (top right) to review.
3. Confirm the order.
4. On **Pay your order**, scan the store’s **Payment QR**.
5. Mark payment done → **Order complete**.

You can also say things like “add a croissant” or “remove the latte” while talking.

### Booking flow (salon / appointments)

1. Ask to book, or pick a **treatment** from the menu.
2. Choose date + available time slot.
3. Enter name + phone.
4. Confirm — booking appears under **Appointments** in Admin.

### FAQ-only mode

No menu/basket. Customers ask questions; the AI answers from **AI Knowledge** + **AI Rules**.

### End session

Open **⋯** (more) → **End session**.

---

## 6. Day-to-day for staff

| Task | Where |
|---|---|
| See today’s activity | **Overview** / **Analytics** |
| Fulfill food/drink orders | **Orders** |
| Check bookings | **Appointments** |
| Review what customers said | **Conversations** |
| Update prices / items | **Menu** |
| Fix wrong AI answers | **AI Knowledge** + **AI Rules** |

---

## 7. Tips for better results

- Keep knowledge entries **short and factual**.
- Put prices and item names accurately in the **Menu** — the AI uses that for orders.
- Match **AI Rules language** to how most customers speak.
- Test with the **Customer app** link after every big change.
- For demos, use Chrome/Safari and a quiet room; hold the mic until you finish speaking.

---

## 8. Troubleshooting

| Problem | What to try |
|---|---|
| Mic doesn’t work | Allow mic in browser settings; use HTTPS or localhost |
| AI Offline in admin | API may be waking up — wait and refresh |
| AI doesn’t know something | Add it under **AI Knowledge** |
| Wrong items / prices | Fix **Menu**, then start a new customer session |
| No payment screen | Upload QR under **Payment QR** |
| No booking slots | Check **Schedule** hours and treatment **duration** |
| Can’t find Menu/Orders | Your use case may be FAQ-only — change setup or use case |

---

## 9. Demo seed (local)

If you seeded the DB:

- Admin: `admin@sunrise.coffee` / `admin123`
- Customer: `/b/sunrise-coffee`
- Try: *“I’d like a latte and a croissant”*
