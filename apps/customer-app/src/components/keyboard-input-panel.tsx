"use client";

import {
  ArrowUturnLeftIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useSlideOver } from "@/components/slide-over";

import { deferEffectRun } from "@/lib/defer-effect-run";
type KeyboardInputPanelProps = {
  open: boolean;
  onClose: () => void;
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
};

type KeyDef =
  | { type: "char"; label: string; flex?: number }
  | {
      type: "action";
      action: "shift" | "backspace" | "space" | "mode" | "send";
      label: string;
      flex?: number;
    };

const LETTER_ROWS: KeyDef[][] = [
  "qwertyuiop".split("").map((c) => ({ type: "char" as const, label: c })),
  "asdfghjkl".split("").map((c) => ({ type: "char" as const, label: c })),
  [
    { type: "action", action: "shift", label: "⇧", flex: 1.25 },
    ..."zxcvbnm".split("").map((c) => ({ type: "char" as const, label: c })),
    { type: "action", action: "backspace", label: "⌫", flex: 1.25 },
  ],
];

const NUMBER_ROWS: KeyDef[][] = [
  "1234567890".split("").map((c) => ({ type: "char" as const, label: c })),
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'].map((c) => ({
    type: "char" as const,
    label: c,
  })),
  [
    { type: "action", action: "mode", label: "#+=", flex: 1.4 },
    ...[".", ",", "?", "!", "'"].map((c) => ({ type: "char" as const, label: c })),
    { type: "action", action: "backspace", label: "⌫", flex: 1.4 },
  ],
];

const SYMBOL_ROWS: KeyDef[][] = [
  ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="].map((c) => ({
    type: "char" as const,
    label: c,
  })),
  ["_", "\\", "|", "~", "<", ">", "€", "£", "¥", "•"].map((c) => ({
    type: "char" as const,
    label: c,
  })),
  [
    { type: "action", action: "mode", label: "123", flex: 1.4 },
    ...[".", ",", "?", "!", "'"].map((c) => ({ type: "char" as const, label: c })),
    { type: "action", action: "backspace", label: "⌫", flex: 1.4 },
  ],
];

function keyButtonClass(active = false) {
  return `flex h-11 min-w-0 items-center justify-center rounded-xl border text-[15px] font-semibold touch-manipulation select-none transition active:scale-[0.96] sm:h-12 disabled:opacity-50 ${
    active
      ? "border-slate-400 bg-slate-300 text-slate-900"
      : "border-slate-200 bg-white text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.06)] active:bg-slate-100"
  }`;
}

export function KeyboardInputPanel({
  open,
  onClose,
  onSend,
  disabled = false,
}: KeyboardInputPanelProps) {
  const { mounted, isRendered, isVisible } = useSlideOver(open);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [shifted, setShifted] = useState(true);
  const [mode, setMode] = useState<"letters" | "numbers" | "symbols">("letters");

  useEffect(() => {
    if (!open) {
      deferEffectRun(() => {
        setValue("");
        setSending(false);
        setShifted(true);
        setMode("letters");
      });
    }
  }, [open]);

  const appendChar = useCallback(
    (raw: string) => {
      const char = mode === "letters" && shifted ? raw.toUpperCase() : raw;
      setValue((prev) => `${prev}${char}`);
      if (mode === "letters" && shifted) {
        setShifted(false);
      }
    },
    [mode, shifted],
  );

  const handleKey = useCallback(
    (key: KeyDef) => {
      if (disabled || sending) return;

      if (key.type === "char") {
        appendChar(key.label);
        return;
      }

      switch (key.action) {
        case "backspace":
          setValue((prev) => prev.slice(0, -1));
          break;
        case "space":
          setValue((prev) => `${prev} `);
          break;
        case "shift":
          setShifted((prev) => !prev);
          break;
        case "mode":
          if (key.label === "123") {
            setMode("numbers");
          } else if (key.label === "#+=") {
            setMode("symbols");
          } else if (key.label === "ABC") {
            setMode("letters");
            setShifted(true);
          }
          break;
        case "send":
          break;
      }
    },
    [appendChar, disabled, sending],
  );

  if (!mounted || !isRendered) return null;

  const canSend = value.trim().length > 0 && !disabled && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    const text = value.trim();
    setSending(true);
    try {
      await onSend(text);
      setValue("");
      onClose();
    } finally {
      setSending(false);
    }
  };

  const rows =
    mode === "letters" ? LETTER_ROWS : mode === "numbers" ? NUMBER_ROWS : SYMBOL_ROWS;

  const bottomRow: KeyDef[] = [
    {
      type: "action",
      action: "mode",
      label: mode === "letters" ? "123" : "ABC",
      flex: 1.4,
    },
    { type: "action", action: "space", label: "space", flex: 5 },
    { type: "char", label: ".", flex: 1 },
    { type: "action", action: "send", label: "send", flex: 1.6 },
  ];

  return createPortal(
    <>
      <button
        type="button"
        className={`fixed inset-0 z-[220] bg-slate-900/35 backdrop-blur-[2px] transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-label="Close keyboard"
      />

      <div
        className={`fixed inset-x-0 bottom-0 z-[230] w-full transition-transform duration-300 ease-out ${
          isVisible ? "translate-y-0" : "translate-y-full"
        }`}
        role="dialog"
        aria-label="On-screen keyboard"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-t border-slate-200 bg-slate-100/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_32px_rgba(15,23,42,0.12)] backdrop-blur-md sm:px-3 sm:pt-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <div
                className="min-h-[3rem] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-[16px] leading-snug text-slate-900 shadow-sm sm:min-h-[3.25rem]"
                aria-live="polite"
              >
                {value ? (
                  <span className="whitespace-pre-wrap break-words">
                    {value}
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-slate-700 align-middle" />
                  </span>
                ) : (
                  <span className="text-slate-400">Type a message…</span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition active:bg-slate-50"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5 sm:gap-2">
              {rows.map((row, rowIndex) => (
                <div key={`${mode}-${rowIndex}`} className="flex gap-1 sm:gap-1.5">
                  {rowIndex === 1 && mode === "letters" ? <div className="w-[3%]" aria-hidden /> : null}
                  {row.map((key, keyIndex) => {
                    const flex = key.flex ?? 1;
                    const isShift = key.type === "action" && key.action === "shift";
                    const label =
                      key.type === "char" && mode === "letters" && shifted
                        ? key.label.toUpperCase()
                        : key.label;

                    return (
                      <button
                        key={`${key.type}-${key.label}-${keyIndex}`}
                        type="button"
                        disabled={disabled || sending}
                        style={{ flex }}
                        className={keyButtonClass(isShift && shifted)}
                        aria-label={
                          key.type === "action"
                            ? key.action === "backspace"
                              ? "Backspace"
                              : key.action === "shift"
                                ? "Shift"
                                : key.label
                            : label
                        }
                        onPointerDown={(event) => {
                          event.preventDefault();
                          handleKey(key);
                        }}
                      >
                        {key.type === "action" && key.action === "backspace" ? (
                          <ArrowUturnLeftIcon className="h-5 w-5" />
                        ) : (
                          label
                        )}
                      </button>
                    );
                  })}
                  {rowIndex === 1 && mode === "letters" ? <div className="w-[3%]" aria-hidden /> : null}
                </div>
              ))}

              <div className="flex gap-1 sm:gap-1.5">
                {bottomRow.map((key, keyIndex) => {
                  const flex = key.flex ?? 1;
                  if (key.type === "action" && key.action === "send") {
                    return (
                      <button
                        key="send"
                        type="button"
                        disabled={!canSend}
                        style={{ flex }}
                        className={`flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold touch-manipulation select-none transition active:scale-[0.96] sm:h-12 ${
                          canSend
                            ? "bg-slate-900 text-white active:bg-slate-800"
                            : "cursor-not-allowed bg-slate-300 text-slate-500"
                        }`}
                        aria-label="Send message"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          void handleSend();
                        }}
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                        Send
                      </button>
                    );
                  }

                  return (
                    <button
                      key={`${key.type}-${key.label}-${keyIndex}`}
                      type="button"
                      disabled={disabled || sending}
                      style={{ flex }}
                      className={keyButtonClass()}
                      aria-label={key.type === "action" ? key.action : key.label}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        handleKey(key);
                      }}
                    >
                      {key.type === "action" && key.action === "space" ? (
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          space
                        </span>
                      ) : (
                        key.label
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
