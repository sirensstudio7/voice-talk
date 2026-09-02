import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";

import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@voicetalk/ui";
import { ApiClientProvider } from "@voicetalk/api-client";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Lorescale Admin",
  description: "Manage AI cashier businesses, menu, knowledge, and orders.",
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistSans.variable} font-sans antialiased`}>
        <ApiClientProvider baseUrl={apiUrl}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </ApiClientProvider>
      </body>
    </html>
  );
}
