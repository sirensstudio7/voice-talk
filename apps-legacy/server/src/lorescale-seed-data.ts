export const LORESCALE_BUSINESS_NAME = "Lorescale";
export const LORESCALE_TAGLINE = "Conversation that never sleeps";

export const LORESCALE_ASSISTANT_NAME = "Alex";
export const LORESCALE_AVATAR_MODEL_PATH = "/models/thanh.glb";
/** Default assistant voice preset for Alex / Lorescale seed. */
export const LORESCALE_VOICE_PRESET = "natural";
/** Alex is male — use Charon via gender + natural style. */
export const LORESCALE_VOICE_GENDER = "male";

export const LORESCALE_PERSONALITY = `You are Alex, the AI assistant on the Lorescale website.
You help visitors understand what the Lorescale platform is, how it works, pricing, features, and how to get started.
Be polite, concise, and helpful. Speak like a knowledgeable product specialist — not a pushy salesperson.
Use the knowledge base to answer questions accurately. If asked about something outside Lorescale, politely redirect.`;

export const LORESCALE_BEHAVIORAL_RULES = `Greet visitors with "Welcome" or "Good day".
Answer product questions clearly using your knowledge base.
Lorescale is a general voice-AI platform — mention ordering, FAQs, and booking only as examples of what businesses can enable.
If they want a live example, mention the Sunrise Coffee demo or signing up for their own workspace.
Keep responses short — one or two sentences unless they ask for detail.`;

export const LORESCALE_TOOL_INSTRUCTIONS = `This is FAQ mode — do not take orders or process payments.
When the visitor has no more questions or says goodbye, give a brief closing and call end_conversation.`;

export const LORESCALE_KNOWLEDGE = [
  {
    title: "What is Lorescale?",
    content:
      "Lorescale is an AI voice conversation platform that turns your business knowledge into natural, always-on customer interactions. Visitors talk to a 3D AI assistant in the browser — for questions, guidance, ordering, booking, and more — powered by the knowledge and rules you configure.",
  },
  {
    title: "No app download",
    content:
      "End users open your Lorescale link in any modern mobile or desktop browser. Push-to-talk works without a native app install.",
  },
  {
    title: "Languages",
    content:
      "English and Indonesian out of the box. Users can switch language during a session and the AI reconnects with the new locale.",
  },
  {
    title: "Payment",
    content:
      'Businesses that accept orders can upload a payment QR code (PayNow, DuitNow, etc.) in the admin dashboard. After an order is confirmed, customers scan the QR and tap "I\'ve paid." Payment is optional and depends on your use case.',
  },
  {
    title: "Customization",
    content:
      "Upload a full-screen background image, set the bottom gradient color, and tune your assistant's appearance so every conversation page matches your brand.",
  },
  {
    title: "Getting started",
    content:
      "Sign in to the Lorescale admin dashboard, add your AI knowledge and rules, choose your use case, then share your /b/your-store link. Try the Sunrise Coffee demo for a voice-ordering example.",
  },
  {
    title: "Voice conversations",
    content:
      "Users hold the mic and speak naturally. Lorescale runs on Gemini Live with low-latency WebSocket sessions for real-time, back-and-forth dialogue.",
  },
  {
    title: "3D AI avatar",
    content:
      "A lifelike 3D assistant greets every visitor with talking animations — a premium, human feel for product questions, support, ordering, and more.",
  },
  {
    title: "Admin dashboard",
    content:
      "Manage AI knowledge, rules, conversations, orders, appearance, payment settings, and analytics from one merchant dashboard.",
  },
  {
    title: "Industries",
    content:
      "Lorescale works across industries — coffee shops, restaurants, retail, events, healthcare clinics, salons, and multi-location brands. Each business trains the AI on its own knowledge.",
  },
  {
    title: "How it works",
    content:
      "1) Set up your workspace in the admin dashboard with AI knowledge and rules. 2) Share your /b/your-store link. 3) Visitors talk to your AI assistant by voice — for FAQs, orders, bookings, or other flows you enable.",
  },
];
