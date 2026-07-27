# Session & Chat Lifecycle

How the customer app starts, ends, and resets the voice session and the chat (transcript) panel.

**Main code paths:**

| Area | Files |
|------|--------|
| Voice WebSocket | `apps/customer-app/src/hooks/use-voice-session.ts` |
| Session store | `apps/customer-app/src/store/session-store.ts` |
| Vision kiosk | `apps/customer-app/src/hooks/use-kiosk-orchestrator.ts` |
| Chat UI | `apps/customer-app/src/components/transcript-panel.tsx` |
| Server | `apps/server/src/routes/websocket.ts` |

---

## Chat box refresh (clears transcript)

The chat box is `TranscriptPanel`. It reads `transcript` from the session store. The chat clears when `transcript` becomes `[]`.

### Primary path: `deferChatReset()` → `startNewConversation()`

Most clean session endings use this flow:

1. Wait until the assistant finishes speaking (up to **15 seconds**)
2. Wait an extra **400 ms** grace period
3. Call `startNewConversation()` — clears `transcript`, sets `status: "idle"`, `conversationPhase: "complete"`

Constants in `use-voice-session.ts`:

- `CHAT_RESET_TIMEOUT_MS = 15_000`
- `CHAT_FINISH_GRACE_MS = 400`

### What triggers `deferChatReset()`

| Trigger | How |
|---------|-----|
| Conversation ends normally | Server sends WebSocket message `conversation.complete` |
| Manual disconnect | Header hang-up → `disconnect()` |
| Start new order | “Start new order” after payment → `startNewOrder()` → `freshOrderRequest` increments → `disconnect()` |
| Payment complete | **I've paid** → `markPaid()` → `paymentCompleteRequest` increments → `disconnect()` |

### Other ways the transcript clears

| Trigger | What happens |
|---------|----------------|
| New voice connect (fresh session) | `connect()` calls `reset()` when there is no existing order → `transcript: []` |
| Server error | `clearTranscript()` immediately on WebSocket `error` message |
| Start new order | `startNewOrder()` also sets `transcript: []` directly |
| Unexpected socket close | `ws.onclose` calls `startNewConversation()` unless transcript is being preserved |

### What does **not** clear the chat

- Closing the checkout panel
- Opening the menu
- Vision `PERSON_ENTER` / prefetch (background connect, state kept)
- Opening the “Pay your order” modal
- Tapping **I've paid** (marks payment done only — voice session stays open)

---

## Order checkout flow (payment vs session restart)

After the customer confirms their order and pays, the UI moves through three checkout phases:

| Phase | UI | Session / chat |
|-------|-----|----------------|
| `shopping` | Your Basket | Voice session still active |
| `awaiting_payment` | Pay your order (QR) | Voice session still active |
| `paid` | Order complete | Voice session **still active** |

### Tapping **I've paid**

Calls `markPaid()`, which:

1. Sets `checkoutPhase: "paid"` (Order complete screen)
2. Increments `paymentCompleteRequest` → triggers `disconnect()`
3. Ends the voice WebSocket and clears the chat (via `deferChatReset()`)
4. In vision kiosk mode, releases the camera session for the next visitor

The order receipt stays visible until the customer taps **Start new order**.

### Tapping **Start new order**

Calls `startNewOrder()`, which:

1. Clears transcript and order
2. Resets checkout to `shopping`
3. Increments `freshOrderRequest` → triggers `disconnect()`
4. Ends the voice session and clears chat (via `deferChatReset()`)

In **vision kiosk** mode, once `conversationPhase` becomes `"complete"`, `notifySessionEnded()` also runs so the camera can detect the next visitor.

**Summary:** Tapping **I've paid** ends the voice session and re-arms the camera (vision mode). **Start new order** also clears the basket for the next customer.

### Pay your order modal timing

The payment modal (`checkoutPhase: "awaiting_payment"`) opens when the **AI asks for the customer's name**:

1. **Server detects name question** on `turn_complete` — shared phrase matching on assistant transcript → `checkout.prompt_payment`
2. **AI calls `prompt_payment` tool** in the same turn as the name question
3. **Client detects name question** in assistant text (`setAssistantDisplayText`, `turn_complete`, or audio interrupt)
4. **Fallback:** when `set_customer_name` succeeds (if the ask was missed)

If basket fly animations are still running, the modal opens as soon as animations finish.

---

## Session restart (voice WebSocket)

A “session” is the voice WebSocket at `/ws/session`.

### Starts a session

| Trigger | Entry point |
|---------|-------------|
| **Order Now** / **Start conversation** | `startTalking()` → `connect()` |
| **Camera trigger** | `vision.trigger` → `handleVisionTrigger()` → `connect({ requestGreeting: true, source: "vision" })` |
| **Visitor detected (prefetch)** | `PERSON_ENTER` → `connect({ prefetch: true })` — warms the connection, no greeting yet |

On `connect()`:

- **Fresh start** (empty basket): `reset()` — new order, cleared chat, `conversationPhase: "active"`
- **Has basket items**: preserves order + transcript via `session.restore` to the server

### Ends a session

| Trigger | What happens |
|---------|----------------|
| Hang-up button | `disconnect()` → sends `session.end` → server shuts down the Gemini session |
| AI ends conversation | Server `conversation.complete` → client `deferChatReset()` |
| Vision visitor lost | `vision.person_lost` timer → `sendGoodbye()` → server goodbye → `conversation.complete` |
| Start new order | `freshOrderRequest` change → `disconnect()` |
| Socket drops | `ws.onclose` → `status: "disconnected"`, may show “Tap Order Now to reconnect” |

**Not a session end:** tapping **I've paid** on the payment screen (see [Order checkout flow](#order-checkout-flow-payment-vs-session-restart)).

### Vision kiosk re-arm (camera can trigger again)

Applies to **every business** using the shared customer app — not tenant-specific.

**Browser camera mode:** during a voice session the browser camera is paused (mic handoff). After the conversation ends, the camera restarts; MediaPipe detectors stay warm on the same page for faster session 2+.

**Python sidecar:** keeps scanning at all times — detection is not paused during voice sessions. The server only suppresses duplicate greeting triggers while a session is active.

When a conversation finishes:

1. `conversationPhase` becomes `"complete"`
2. If a vision session was active → `notifySessionEnded()`
3. Client sends `kiosk.session.released` to the server (not `kiosk.session.ended`); retries on kiosk WS reconnect if the send was dropped
4. Server clears session state **without** post-conversation cooldown (also clears pending greeting triggers)
5. On `conversation.complete`, the voice server also releases the vision hub if it is still marked active (fallback)
6. Detection re-arms for the next visitor

`kiosk.session.ended` (with cooldown) is reserved for explicit end-of-shift flows if needed later. Failed greetings also use `kiosk.session.released`.

### Vision source (browser-camera kiosks)

For any business using the kiosk’s built-in camera, set **Admin → Vision Settings → Vision source = `browser`**. Prefer this over `auto` when a Python vision sidecar may also be connected — otherwise browser raise-hand/gesture events can be ignored while the sidecar still runs on a different trigger mode.

### Vision goodbye vs FAQ closing

- FAQ / AI rules: the model gives one short closing and calls `end_conversation`
- Vision **goodbye script** (Admin): used for silence timeout and person-lost (`session.goodbye`) only
- These must not stack: once `conversation.complete` is scheduled, the server skips further silence/goodbye prompt injection

---

## Server: `conversation.complete` reasons

The API sends `conversation.complete` with a `reason` field. Common values:

| Reason | When |
|--------|------|
| `end_conversation` | AI called `end_conversation` (FAQ mode) |
| `idle_timeout` | FAQ silence timeout (default 30s, configurable in AI rules) |
| `vision_silence_timeout` | Visitor went quiet after follow-up prompt (vision mode) |
| `vision_goodbye` | Client sent `session.goodbye` (vision person-lost timeout or goodbye flow) |
| `manual` | Client sent `session.end` (hang-up) |

After `conversation.complete`, the server schedules session shutdown after a short grace period.

---

## Flow diagram

```
Session ends
    │
    ├─ AI goodbye / timeout ──► server: conversation.complete
    ├─ User hang up ──────────► disconnect() + session.end
    ├─ Start new order ───────► startNewOrder() → disconnect()
    └─ Vision person lost ────► sendGoodbye() → conversation.complete
                │
                ▼
         deferChatReset()
                │
                ▼
    Wait for assistant audio to finish (≤ 15s)
                │
                ▼
         startNewConversation()
                │
                ├─► Chat box cleared (transcript: [])
                │
                └─► Vision mode? → notifySessionEnded()
                                    → camera can trigger again
```

---

## Store actions reference

### `startNewConversation()`

Clears chat and returns UI to idle. Does **not** reset order or checkout.

```ts
status: "idle"
transcript: []
conversationPhase: "complete"
```

### `startNewOrder()`

Full reset for a new customer order. Also disconnects the voice session.

```ts
transcript: []
order: empty
checkoutPhase: "shopping"
freshOrderRequest += 1  // remounts avatar hero; triggers disconnect()
```

### `reset()`

Called on fresh `connect()` when there is no existing order. Clears order, checkout, and transcript (unless `keepTranscript` is passed).

### `disconnect()`

Ends the live WebSocket session and schedules chat clear via `deferChatReset()`.

---

## Related dev commands

`npm run api:restart` restarts the API and, when `.vision.slug` exists, restarts the vision sidecar with **debug preview** (`VISION_DEBUG=1`).

```bash
npm run api:restart          # restarts API + restarts vision with debug preview (.vision.slug)
bash scripts/dev-vision.sh start sunrise-coffee   # first-time vision setup (no debug)
VISION_DEBUG=1 bash scripts/dev-vision.sh restart sunrise-coffee   # manual debug restart
```

See `scripts/dev-api.sh` and `scripts/dev-vision.sh`.
