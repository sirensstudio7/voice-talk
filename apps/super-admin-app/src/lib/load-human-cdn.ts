const HUMAN_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js";

export type HumanResult = {
  face?: unknown[];
  hand?: unknown[];
  gesture?: Array<{ gesture?: string }>;
};

export type HumanInstance = {
  load: () => Promise<unknown>;
  warmup: () => Promise<unknown>;
  detect: (input: HTMLVideoElement, config?: object) => Promise<unknown>;
  next: (result?: unknown) => HumanResult;
  result: unknown;
  draw: {
    all: (canvas: HTMLCanvasElement, result: unknown) => Promise<unknown>;
    options?: Record<string, unknown>;
  };
};

export type HumanCtor = new (config?: object) => HumanInstance;

type HumanGlobal = HumanCtor | {
  Human?: HumanCtor;
  default?: HumanCtor;
};

declare global {
  interface Window {
    Human?: HumanGlobal;
  }
}

let loading: Promise<HumanCtor> | null = null;

function resolveHumanCtor(value: HumanGlobal | undefined): HumanCtor | null {
  if (!value) return null;
  if (typeof value === "function") return value;
  if (typeof value.Human === "function") return value.Human;
  if (typeof value.default === "function") return value.default;
  return null;
}

/** Load Human from CDN so Next/Turbopack never bundles the Node TF entry. */
export function loadHumanFromCdn(): Promise<HumanCtor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Human preview is browser-only"));
  }

  const existingCtor = resolveHumanCtor(window.Human);
  if (existingCtor) return Promise.resolve(existingCtor);
  if (loading) return loading;

  loading = new Promise<HumanCtor>((resolve, reject) => {
    const finish = () => {
      const ctor = resolveHumanCtor(window.Human);
      if (!ctor) {
        loading = null;
        reject(
          new Error(
            "Human script loaded but constructor missing (expected Human.Human / Human.default)",
          ),
        );
        return;
      }
      resolve(ctor);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-human-cdn="1"]`,
    );
    if (existing) {
      // Script tag already present — may still be loading.
      if (resolveHumanCtor(window.Human)) {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener(
        "error",
        () => {
          loading = null;
          reject(new Error("Failed to load Human from CDN"));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = HUMAN_SCRIPT;
    script.async = true;
    script.dataset.humanCdn = "1";
    script.onload = finish;
    script.onerror = () => {
      loading = null;
      reject(new Error("Failed to load Human from CDN"));
    };
    document.head.appendChild(script);
  });

  return loading;
}
