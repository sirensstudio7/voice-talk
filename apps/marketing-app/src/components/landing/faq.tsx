"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "What is Lore?",
    answer:
      "Lore is an AI voice cashier platform for food and beverage businesses. Customers talk to a 3D avatar to browse your menu, place orders, and pay — all in the browser.",
  },
  {
    question: "Do customers need to install an app?",
    answer:
      "No. Customers open your store link in any modern mobile or desktop browser. Push-to-talk works without a native app install.",
  },
  {
    question: "Which languages are supported?",
    answer:
      "English and Indonesian out of the box. Customers can switch language during a session and the AI reconnects with the new locale.",
  },
  {
    question: "How does payment work?",
    answer:
      "You upload your payment QR code (PayNow, DuitNow, etc.) in the admin dashboard. After confirming an order, customers scan the QR and tap \"I've paid.\"",
  },
  {
    question: "Can I customize the look?",
    answer:
      "Yes. Upload a full-screen background image and set the bottom gradient color so the voice page matches your brand.",
  },
  {
    question: "How do I get started?",
    answer:
      "Sign in to the admin dashboard, set up your menu and AI rules, then share your /b/your-store link. Try the Sunrise Coffee demo to see it in action.",
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-500">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Common questions
          </h2>
        </div>

        <div className="mt-12 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {FAQ_ITEMS.map(({ question, answer }, index) => {
            const isOpen = openIndex === index;

            return (
              <div key={question}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpenIndex(isOpen ? null : index);
                  }}
                >
                  <span className="font-medium text-slate-900">{question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div className="px-6 pb-5 text-sm leading-relaxed text-slate-600">{answer}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
