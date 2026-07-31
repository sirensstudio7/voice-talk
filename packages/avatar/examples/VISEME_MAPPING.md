# Viseme → morph-target mapping

Used by `VisemeController` for Ready Player Me / Wolf3D GLBs that ship Oculus
`viseme_*` channels (plus ARKit helpers).

| Viseme | Primary morph target(s) | Description |
|--------|-------------------------|-------------|
| **MBP** | `viseme_PP` | Lips pressed — m / b / p (**speech only**, not idle) |

Idle / default uses `restIdle()` — all morph influences at **0** (natural GLB rest face).
| **FV** | `viseme_FF` (+ lower/upper lip ARKit) | Lower lip to teeth — f / v |
| **A** | `viseme_aa` (+ `jawOpen`, `mouthOpen`) | Open “ah” |
| **AI** | `viseme_aa` + `viseme_I` | Diphthong “eye” |
| **AO** | `viseme_aa` + `viseme_O` (+ `mouthFunnel`) | Open rounded “aw” |
| **OE** | `viseme_O` + `viseme_E` (+ `mouthFunnel`) | Rounded mid vowel |
| **EA** | `viseme_E` (+ smile/stretch) | Wide “eh / ay” |
| **I** | `viseme_I` (+ smile) | Narrow “ee” |
| **O** | `viseme_O` (+ funnel/pucker) | Rounded “oh” |
| **U** | `viseme_U` (+ `mouthPucker`) | Tight “oo” |

## Files

| File | Role |
|------|------|
| [`src/viseme-controller.ts`](../src/viseme-controller.ts) | `VisemeController` + mapping table |
| [`src/Avatar.tsx`](../src/Avatar.tsx) | R3F avatar with `speakViseme` ref API |
| [`examples/App.tsx`](./App.tsx) | Demo UI + sequence buttons |

## Live AI speech

When no phoneme stream is available, `updateFromSpeechLevel(level, dt)` picks
among these visemes from playback amplitude (silence → MBP). The customer app
feeds analyser RMS into `mouthOpen` on `AvatarHero` / `Avatar3D`.
