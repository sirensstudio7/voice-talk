/**
 * Viseme → morph-target mapping for Ready Player Me / Wolf3D GLBs.
 *
 * | Viseme | Primary morph(s)              | Role                          |
 * |--------|-------------------------------|-------------------------------|
 * | MBP    | viseme_PP, viseme_sil         | Lips closed (m/b/p)           |
 * | FV     | viseme_FF                     | Lower lip / teeth (f/v)       |
 * | A      | viseme_aa                     | Open “ah”                     |
 * | AI     | viseme_aa + viseme_I          | Diphthong “eye”               |
 * | AO     | viseme_aa + viseme_O          | Open rounded “aw”             |
 * | OE     | viseme_O + viseme_E           | Rounded mid “ö/oe”            |
 * | EA     | viseme_E                      | Wide “eh/ay”                  |
 * | I      | viseme_I                      | Narrow “ee”                   |
 * | O      | viseme_O                      | Rounded “oh”                  |
 * | U      | viseme_U                      | Tight “oo”                    |
 *
 * ARKit fallbacks (jawOpen / mouthOpen / mouthFunnel / …) are used when
 * Oculus viseme morphs are missing (e.g. some web-optimized assets).
 */

import type { Mesh, Object3D } from "three";

export type VisemeName =
  | "AI"
  | "OE"
  | "AO"
  | "EA"
  | "A"
  | "I"
  | "O"
  | "U"
  | "MBP"
  | "FV";

export const VISEME_NAMES: VisemeName[] = [
  "AI",
  "OE",
  "AO",
  "EA",
  "A",
  "I",
  "O",
  "U",
  "MBP",
  "FV",
];

/** Weight map: morph target name → influence 0–1 (before strength). */
export type VisemeMorphWeights = Record<string, number>;

/**
 * Canonical mapping from logical visemes to RPM morph targets.
 * Prefer Oculus viseme_* channels; include ARKit helpers for blend richness.
 */
export const VISEME_TO_MORPHS: Record<VisemeName, VisemeMorphWeights> = {
  // Speech consonant only — not used for resting face (see restIdle).
  MBP: {
    viseme_PP: 0.45,
    jawOpen: 0,
    mouthOpen: 0,
  },
  FV: {
    viseme_FF: 0.55,
    jawOpen: 0.04,
    mouthLowerDownLeft: 0.18,
    mouthLowerDownRight: 0.18,
    mouthUpperUpLeft: 0.08,
    mouthUpperUpRight: 0.08,
  },
  A: {
    viseme_aa: 0.55,
    jawOpen: 0.22,
    mouthOpen: 0.28,
  },
  AI: {
    viseme_aa: 0.35,
    viseme_I: 0.3,
    jawOpen: 0.16,
    mouthOpen: 0.2,
    mouthSmileLeft: 0.08,
    mouthSmileRight: 0.08,
  },
  AO: {
    viseme_aa: 0.28,
    viseme_O: 0.35,
    jawOpen: 0.15,
    mouthOpen: 0.18,
    mouthFunnel: 0.15,
  },
  OE: {
    viseme_O: 0.32,
    viseme_E: 0.28,
    jawOpen: 0.1,
    mouthFunnel: 0.18,
    mouthPucker: 0.08,
  },
  EA: {
    viseme_E: 0.5,
    jawOpen: 0.08,
    mouthOpen: 0.12,
    mouthSmileLeft: 0.12,
    mouthSmileRight: 0.12,
    mouthStretchLeft: 0.08,
    mouthStretchRight: 0.08,
  },
  I: {
    viseme_I: 0.5,
    jawOpen: 0.05,
    mouthOpen: 0.08,
    mouthSmileLeft: 0.15,
    mouthSmileRight: 0.15,
  },
  O: {
    viseme_O: 0.5,
    jawOpen: 0.12,
    mouthFunnel: 0.22,
    mouthPucker: 0.12,
  },
  U: {
    viseme_U: 0.5,
    jawOpen: 0.06,
    mouthPucker: 0.28,
    mouthFunnel: 0.15,
  },
};

type MorphChannel = {
  influences: number[];
  index: number;
};

type BoundMesh = {
  /** morph name → channel on this mesh */
  channels: Map<string, MorphChannel>;
};

export type SpeakVisemeOptions = {
  strength?: number;
  durationMs?: number;
};

const DEFAULT_LERP_SPEED = 14;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Controls facial morph targets for lip sync.
 * Bind once to a loaded GLB scene, then call speakViseme / update each frame.
 */
export class VisemeController {
  private meshes: BoundMesh[] = [];
  private allMorphNames = new Set<string>();
  /** Current blended weights (lerped). */
  private current = new Map<string, number>();
  /** Target weights from the active viseme. */
  private target = new Map<string, number>();
  private activeViseme: VisemeName | "REST" = "REST";
  private holdUntilMs = 0;
  private lerpSpeed = DEFAULT_LERP_SPEED;
  private demoTimer: ReturnType<typeof setTimeout> | null = null;
  private demoCancelled = false;
  private speechPhase = 0;

  /** Scan an Object3D tree for meshes that expose morph targets. */
  bind(root: Object3D): void {
    this.meshes = [];
    this.allMorphNames.clear();
    this.current.clear();
    this.target.clear();

    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
        return;
      }

      const channels = new Map<string, MorphChannel>();
      for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
        if (typeof index !== "number") continue;
        channels.set(name, { influences: mesh.morphTargetInfluences, index });
        this.allMorphNames.add(name);
        if (!this.current.has(name)) {
          this.current.set(name, mesh.morphTargetInfluences[index] ?? 0);
        }
      }

      if (channels.size > 0) {
        this.meshes.push({ channels });
      }
    });

    // Neutral rest face (same as pre-lip-sync default — all morphs at 0).
    this.restIdle(true);
  }

  hasMorphSupport(): boolean {
    return this.meshes.length > 0;
  }

  getActiveViseme(): VisemeName | "REST" {
    return this.activeViseme;
  }

  /**
   * Return to the model's natural resting mouth (all influences → 0).
   * Prefer this over MBP for idle — MBP presses lips shut and looks wrong at rest.
   */
  restIdle(instant = false): void {
    this.activeViseme = "REST";
    this.holdUntilMs = 0;
    this.lerpSpeed = DEFAULT_LERP_SPEED;
    for (const name of this.allMorphNames) {
      this.target.set(name, 0);
    }
    if (instant) {
      this.applyWeights(1);
    }
  }

  /**
   * Set the next viseme pose.
   * @param visemeName Logical viseme key
   * @param strength Overall intensity 0–1 (default 1)
   * @param durationMs Hold this target before auto-rest (0 = hold until next call)
   */
  speakViseme(visemeName: string, strength = 1, durationMs = 0): void {
    const key = visemeName.toUpperCase() as VisemeName;
    if (!VISEME_TO_MORPHS[key]) {
      console.warn(`[VisemeController] Unknown viseme: ${visemeName}`);
      return;
    }

    this.activeViseme = key;
    const s = clamp01(strength);
    const weights = VISEME_TO_MORPHS[key];

    // Zero every known channel first, then apply this viseme's weights.
    for (const name of this.allMorphNames) {
      this.target.set(name, 0);
    }
    for (const [morph, weight] of Object.entries(weights)) {
      if (!this.allMorphNames.has(morph)) continue;
      this.target.set(morph, clamp01(weight * s));
    }

    this.holdUntilMs = durationMs > 0 ? performance.now() + durationMs : 0;
  }

  /**
   * Amplitude-driven lip sync when phoneme/viseme stream is unavailable.
   * Picks among vowel visemes from level and a phase oscillator; silence → rest.
   */
  updateFromSpeechLevel(level: number, deltaSec: number): void {
    const open = clamp01(level);
    this.speechPhase += deltaSec * (9 + open * 14);
    this.lerpSpeed = open > 0.05 ? 18 : DEFAULT_LERP_SPEED;

    if (open < 0.035) {
      this.restIdle();
      return;
    }

    // Cycle nearby mouth shapes so sustained speech doesn't freeze on one pose.
    const cycle = [
      "A",
      "AI",
      "AO",
      "O",
      "OE",
      "EA",
      "I",
      "U",
    ] as const;
    const idx = Math.floor(this.speechPhase) % cycle.length;

    let viseme: VisemeName = cycle[idx];
    if (open > 0.65) {
      viseme = open > 0.82 ? "A" : "AI";
    } else if (open > 0.4) {
      viseme = idx % 2 === 0 ? "AO" : "O";
    } else if (open > 0.16) {
      viseme = idx % 2 === 0 ? "EA" : "OE";
    } else {
      viseme = idx % 2 === 0 ? "I" : "U";
    }

    // Occasional consonant flicker at mid amplitude
    if (open > 0.18 && open < 0.55 && Math.sin(this.speechPhase * 3.7) > 0.88) {
      viseme = Math.sin(this.speechPhase * 2.1) > 0 ? "MBP" : "FV";
    }

    this.speakViseme(viseme, Math.min(0.55, 0.22 + open * 0.4), 0);
  }

  /**
   * Advance lerp toward targets and write morphTargetInfluences.
   * Call once per frame from useFrame.
   */
  update(deltaSec: number, _options?: { idleJaw?: boolean; timeSec?: number }): void {
    if (this.holdUntilMs > 0 && performance.now() >= this.holdUntilMs) {
      this.holdUntilMs = 0;
      this.restIdle();
    }

    const t = 1 - Math.exp(-this.lerpSpeed * Math.max(0, deltaSec));
    this.applyWeights(t);
  }

  setLerpSpeed(speed: number): void {
    this.lerpSpeed = Math.max(1, speed);
  }

  /** Demo: MBP → AI → AO → OE → EA → rest */
  async playDemoSequence(stepMs = 280): Promise<void> {
    this.cancelDemo();
    this.demoCancelled = false;
    const steps: VisemeName[] = ["MBP", "AI", "AO", "OE", "EA"];

    for (const viseme of steps) {
      if (this.demoCancelled) return;
      this.speakViseme(viseme, 1, stepMs);
      await new Promise<void>((resolve) => {
        this.demoTimer = setTimeout(resolve, stepMs);
      });
    }
    if (!this.demoCancelled) {
      this.restIdle();
    }
  }

  cancelDemo(): void {
    this.demoCancelled = true;
    if (this.demoTimer != null) {
      clearTimeout(this.demoTimer);
      this.demoTimer = null;
    }
  }

  reset(): void {
    this.cancelDemo();
    this.restIdle(true);
  }

  private applyWeights(blend: number): void {
    for (const name of this.allMorphNames) {
      const from = this.current.get(name) ?? 0;
      const to = this.target.get(name) ?? 0;
      const next = lerp(from, to, blend);
      this.current.set(name, next);
      this.writeMorph(name, next);
    }
  }

  private writeMorph(name: string, value: number): void {
    for (const mesh of this.meshes) {
      const channel = mesh.channels.get(name);
      if (!channel) continue;
      channel.influences[channel.index] = value;
    }
  }
}
