import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceTalk",
  description: "AI Voice Kiosk Experience",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-[100dvh] w-screen overflow-hidden bg-black text-white selection:bg-brand-500/30">
        <main className="w-full h-[100dvh] relative">
          {children}
        </main>
      </body>
    </html>
  );
}
