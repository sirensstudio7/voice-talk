import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lorescale · AI Cashier",
  description: "Talk to your AI cashier in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <head>
        <link
          rel="preload"
          href="/models/angelica3d.web.glb"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
