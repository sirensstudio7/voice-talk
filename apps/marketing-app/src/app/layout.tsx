import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lorescale · AI Voice Cashier",
  description:
    "Run your store with AI voice ordering. Real-time voice cashier, 3D avatar, menu and checkout — no app install for customers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full scroll-smooth`}>
      <body className="min-h-full bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
