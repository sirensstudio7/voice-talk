"use client";

import { useState } from "react";

import { adminLoginUrl } from "@/lib/site-links";

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

function AccordionIcon({ open }: { open: boolean }) {
  return (
    <span
      className={`relative flex h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-45" : ""}`}
      aria-hidden
    >
      <span className="absolute left-1/2 top-1/2 h-0.5 w-3 -translate-x-1/2 -translate-y-1/2 bg-[#181818]" />
      <span className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[#181818]" />
    </span>
  );
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(1);

  return (
    <section id="faq" className="border-b border-dashed border-black/[0.06] bg-white">
      <div className="landing-container border-x border-dashed border-black/[0.06]">
        <div className="px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <div className="mb-6 text-sm uppercase tracking-wide text-[#737373]">FAQs</div>
              <h2 className="text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-[1.15] tracking-tight text-[#181818]">
                <span className="block">Have questions?</span>
                <span className="block">Find answers.</span>
              </h2>

              <div className="mt-8">
                <p className="text-base font-medium text-[#181818]">Have more questions?</p>
                <p className="mt-1 text-sm leading-relaxed text-[#4d4d4d]">
                  Reach out to our friendly support team
                </p>
              </div>

              <a
                href={adminLoginUrl}
                className="mt-6 inline-flex items-center rounded-md border border-[#f0f0f0] bg-white px-5 py-3 text-sm font-medium text-[#181818] transition hover:border-black/20"
              >
                Get started
              </a>
            </div>

            <div className="border-t border-black/10">
              {FAQ_ITEMS.map(({ question, answer }, index) => {
                const isOpen = openIndex === index;
                const isFirst = index === 0;

                return (
                  <div
                    key={question}
                    className={`border-black/10 ${isFirst ? "" : "border-t"}`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-6 py-6 text-left"
                      aria-expanded={isOpen}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                    >
                      <span className="text-base font-medium text-[#181818]">{question}</span>
                      <AccordionIcon open={isOpen} />
                    </button>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="pb-6 text-sm leading-relaxed text-[#4d4d4d]">{answer}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
