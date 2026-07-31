/**
 * Example usage of the lip-sync Avatar + VisemeController.
 *
 * Drop this into a Next.js / Vite app that already depends on
 * `@react-three/fiber`, `@react-three/drei`, and `three`.
 *
 * Place your GLB at `public/avatar.glb`, or point modelPath at an RPM asset
 * such as `/models/thanh.glb`.
 */

"use client";

import { useEffect, useRef } from "react";

import { Avatar, type AvatarHandle } from "../src/Avatar";

export default function App() {
  const avatarRef = useRef<AvatarHandle>(null);

  useEffect(() => {
    // Auto-run the documented demo sequence once the component mounts.
    const timer = window.setTimeout(() => {
      void avatarRef.current?.playDemoSequence(300);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 16,
        padding: 24,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 22 }}>Viseme lip-sync demo</h1>
        <p style={{ margin: "8px 0 0", opacity: 0.75, fontSize: 14 }}>
          Sequence: MBP → AI → AO → OE → EA → MBP
        </p>
      </header>

      <section style={{ minHeight: 480, borderRadius: 16, overflow: "hidden", background: "#1e293b" }}>
        {/*
          Production kiosk uses /models/thanh.glb (etc.).
          For the brief’s path, use /avatar.glb from public/.
        */}
        <Avatar ref={avatarRef} modelPath="/avatar.glb" idle />
      </section>

      <footer style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            "MBP",
            "AI",
            "AO",
            "OE",
            "EA",
            "A",
            "I",
            "O",
            "U",
            "FV",
          ] as const
        ).map((viseme) => (
          <button
            key={viseme}
            type="button"
            onClick={() => avatarRef.current?.speakViseme(viseme, 1, 350)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f8fafc",
              cursor: "pointer",
            }}
          >
            {viseme}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void avatarRef.current?.playDemoSequence(280)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #f97316",
            background: "#ea580c",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Play demo
        </button>
        <button
          type="button"
          onClick={() => avatarRef.current?.reset()}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#f8fafc",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </footer>
    </main>
  );
}
