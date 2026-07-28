import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";

import { AuthProvider } from "@/lib/auth";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Lorescale Super Admin",
  description: "Platform operations dashboard for LORESCALE staff.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistSans.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
