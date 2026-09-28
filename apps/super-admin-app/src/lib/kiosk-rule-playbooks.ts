import type { RuleEdge, RuleNode } from "@/components/kiosk-rule-graph";

export type BuiltinPlaybookId = "ordering" | "booking" | "faq" | "vision";
export type PlaybookId = string;

export const PLAYBOOK_IDS: BuiltinPlaybookId[] = ["ordering", "booking", "faq", "vision"];

export function isBuiltinPlaybookId(value: string): value is BuiltinPlaybookId {
  return PLAYBOOK_IDS.includes(value as BuiltinPlaybookId);
}

export function isPlaybookId(value: string): boolean {
  return isBuiltinPlaybookId(value) || /^custom-[a-z0-9]+$/i.test(value);
}

export type Playbook = {
  id: PlaybookId;
  label: string;
  title: string;
  summary: string;
  nodes: RuleNode[];
  edges: RuleEdge[];
};

function node(partial: RuleNode): RuleNode {
  return { builtIn: true, ...partial };
}

const Y = 168;
const UP = 36;

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  {
    id: "ordering",
    label: "Orders",
    title: "Coffee order",
    summary: "Speak an item → basket → confirm → name → Pay your order.",
    nodes: [
      node({ id: "greet", label: "Greet", hint: "Welcome and ask what they would like.", kind: "start", x: 32, y: Y }),
      node({
        id: "add",
        label: "Add to cart",
        hint: "Spoken item is added to the kiosk basket immediately.",
        kind: "tool",
        tool: "add_to_order",
        x: 248,
        y: Y,
      }),
      node({
        id: "edit",
        label: "Change item",
        hint: "Add more drinks or take something out.",
        kind: "tool",
        tool: "remove_from_order",
        x: 248,
        y: UP,
      }),
      node({
        id: "confirm",
        label: "Confirm",
        hint: "When they say the basket is right, lock the order.",
        kind: "tool",
        tool: "confirm_order",
        x: 464,
        y: Y,
      }),
      node({
        id: "loyalty",
        label: "Checkout Qs",
        hint: "Loyalty or other knowledge questions, one at a time.",
        kind: "action",
        x: 680,
        y: Y,
      }),
      node({
        id: "photo",
        label: "Photo?",
        hint: "Only if Smart Photo Moment is on. Yes/no before name.",
        kind: "addon",
        tool: "set_photo_souvenir_consent",
        x: 680,
        y: UP,
      }),
      node({
        id: "name",
        label: "Ask name",
        hint: "Standalone name question. Call prompt_payment in the same turn. Do not mix with other questions.",
        kind: "action",
        x: 896,
        y: Y,
      }),
      node({
        id: "pay",
        label: "Prepare pay",
        hint: "Same turn as Ask name. Prepares checkout. The Pay your order modal does not open yet.",
        kind: "tool",
        tool: "prompt_payment",
        x: 896,
        y: UP,
      }),
      node({
        id: "saveName",
        label: "Save name",
        hint: "After they say their name. This is what opens the Pay your order screen.",
        kind: "tool",
        tool: "set_customer_name",
        x: 1112,
        y: Y,
      }),
      node({
        id: "payModal",
        label: "Pay your order",
        hint: "Kiosk basket modal: Pay your order + QR. Opens after set_customer_name succeeds.",
        kind: "action",
        x: 1328,
        y: Y,
      }),
      node({
        id: "spin",
        label: "Lucky spin",
        hint: "If the add-on is on, they can spin after payment.",
        kind: "addon",
        x: 1328,
        y: UP,
      }),
      node({
        id: "end",
        label: "Goodbye",
        hint: "Session ends after wrap-up or silence timeout.",
        kind: "end",
        x: 1544,
        y: Y,
      }),
    ],
    edges: [
      { from: "greet", to: "add" },
      { from: "add", to: "edit", label: "change" },
      { from: "edit", to: "add" },
      { from: "add", to: "confirm" },
      { from: "confirm", to: "loyalty" },
      { from: "loyalty", to: "photo", label: "add-on" },
      { from: "loyalty", to: "name" },
      { from: "photo", to: "name" },
      { from: "name", to: "pay", label: "same turn" },
      { from: "name", to: "saveName" },
      { from: "pay", to: "saveName" },
      { from: "saveName", to: "payModal" },
      { from: "payModal", to: "spin", label: "add-on" },
      { from: "payModal", to: "end" },
      { from: "spin", to: "end" },
    ],
  },
  {
    id: "booking",
    label: "Booking",
    title: "Appointment",
    summary: "Doctor → service → slot → book. Only confirm after the tool succeeds.",
    nodes: [
      node({ id: "greet", label: "Greet", hint: "Ask how you can help with a booking.", kind: "start", x: 32, y: Y }),
      node({
        id: "staff",
        label: "Doctors",
        hint: "Who is working and their specialty.",
        kind: "tool",
        tool: "list_staff",
        x: 248,
        y: UP,
      }),
      node({
        id: "treat",
        label: "Services",
        hint: "Treatments with duration and price.",
        kind: "tool",
        tool: "list_treatments",
        x: 248,
        y: 300,
      }),
      node({
        id: "slots",
        label: "Free times",
        hint: "Open slots for that doctor + service + date (Jakarta time).",
        kind: "tool",
        tool: "check_availability",
        x: 464,
        y: Y,
      }),
      node({
        id: "book",
        label: "Save booking",
        hint: "Only after name, phone, and a real slot.",
        kind: "tool",
        tool: "book_appointment",
        x: 680,
        y: Y,
      }),
      node({
        id: "cancel",
        label: "Cancel",
        hint: "If they already have an appointment and ask to cancel.",
        kind: "tool",
        tool: "cancel_appointment",
        x: 680,
        y: UP,
      }),
      node({
        id: "end",
        label: "Done",
        hint: "Confirm details out loud, then wait or close on silence.",
        kind: "end",
        x: 896,
        y: Y,
      }),
    ],
    edges: [
      { from: "greet", to: "staff" },
      { from: "greet", to: "treat" },
      { from: "staff", to: "slots" },
      { from: "treat", to: "slots" },
      { from: "slots", to: "book" },
      { from: "book", to: "end" },
      { from: "book", to: "cancel", label: "cancel" },
      { from: "cancel", to: "end" },
    ],
  },
  {
    id: "faq",
    label: "FAQ",
    title: "Questions",
    summary: "No cart. Answer from knowledge, then close when they are done.",
    nodes: [
      node({ id: "greet", label: "Greet", hint: "Offer to answer questions.", kind: "start", x: 32, y: Y }),
      node({
        id: "answer",
        label: "Answer",
        hint: "Hours, policies, parking, payment — facts from AI Knowledge.",
        kind: "action",
        x: 248,
        y: Y,
      }),
      node({
        id: "more",
        label: "Anything else?",
        hint: "Stay in the loop until they are finished.",
        kind: "action",
        x: 464,
        y: Y,
      }),
      node({
        id: "end",
        label: "End",
        hint: "Goodbye, question done, or idle timeout.",
        kind: "end",
        tool: "end_conversation",
        x: 680,
        y: Y,
      }),
    ],
    edges: [
      { from: "greet", to: "answer" },
      { from: "answer", to: "more" },
      { from: "more", to: "answer", label: "more" },
      { from: "more", to: "end" },
    ],
  },
  {
    id: "vision",
    label: "Session",
    title: "Start & end",
    summary: "How a visit opens and how silence or leaving closes it.",
    nodes: [
      node({
        id: "idle",
        label: "Idle",
        hint: "Waiting for a visitor. Camera trigger or Order Now / hotkey.",
        kind: "start",
        x: 32,
        y: Y,
      }),
      node({
        id: "greet",
        label: "Greeting",
        hint: "Vision Settings greeting script, or the default welcome.",
        kind: "action",
        x: 248,
        y: Y,
      }),
      node({
        id: "talk",
        label: "Talk",
        hint: "Ordering, booking, or FAQ playbook runs here.",
        kind: "action",
        x: 464,
        y: Y,
      }),
      node({
        id: "silence",
        label: "Follow-up",
        hint: "After Silence timeout: “Need anything else?”",
        kind: "action",
        x: 680,
        y: UP,
      }),
      node({
        id: "lost",
        label: "Left",
        hint: "Lost timeout if the camera no longer sees them.",
        kind: "action",
        x: 680,
        y: 300,
      }),
      node({
        id: "goodbye",
        label: "Goodbye",
        hint: "After Auto goodbye timeout, speak the goodbye script and end.",
        kind: "end",
        x: 896,
        y: Y,
      }),
    ],
    edges: [
      { from: "idle", to: "greet" },
      { from: "greet", to: "talk" },
      { from: "talk", to: "silence", label: "quiet" },
      { from: "talk", to: "lost", label: "left" },
      { from: "silence", to: "talk", label: "still here" },
      { from: "silence", to: "goodbye" },
      { from: "lost", to: "goodbye" },
    ],
  },
];

export const PLAYBOOK_STORAGE_KEY = "lorescale_kiosk_rules_v4";
export const PLAYBOOK_STORAGE_LEGACY_KEYS = ["lorescale_kiosk_rules_v3", "lorescale_kiosk_rules_v2"];

export function clonePlaybook(playbook: Playbook): Playbook {
  return {
    ...playbook,
    nodes: playbook.nodes.map((item) => ({ ...item })),
    edges: playbook.edges.map((item) => ({ ...item })),
  };
}

export function createBlankPlaybook(): Playbook {
  const id = `custom-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  return {
    id,
    label: "New rules",
    title: "Custom playbook",
    summary: "Map a new kiosk flow. Does not change the live kiosk.",
    nodes: [
      node({ id: "start", label: "Start", hint: "How this flow begins.", kind: "start", x: 32, y: Y }),
      node({ id: "end", label: "Done", hint: "How this flow ends.", kind: "end", x: 248, y: Y }),
    ],
    edges: [{ from: "start", to: "end" }],
  };
}
