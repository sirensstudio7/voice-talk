"use client";

import { FormEvent, useState } from "react";

export function FooterNewsletter() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div>
      <h3 className="text-lg font-medium text-[#F5FFFD]">Subscribe to the newsletter</h3>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Email</span>
          <input
            type="email"
            required
            name="email"
            placeholder="you@yourstore.com"
            className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-[#F5FFFD] placeholder:text-white/50 outline-none transition focus:border-[#C2FA69]/40"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-[#C2FA69] px-6 py-3 text-sm font-medium text-[#1D322D] transition hover:bg-[#d4ff85]"
        >
          {submitted ? "Subscribed" : "Submit"}
        </button>
      </form>
    </div>
  );
}
