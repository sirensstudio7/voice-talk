export {
  Avatar3D,
  type Avatar3DProps,
  type AvatarFraming,
  type AvatarIdleLabClock,
  type AvatarMode,
} from "./avatar-3d";
export {
  Avatar,
  type AvatarHandle,
  type AvatarProps,
} from "./Avatar";
export {
  AvatarHero,
  COMPACT_HERO_FRAME_CLASS,
  HERO_FRAME_CLASS,
  LANDSCAPE_HERO_FRAME_CLASS,
  PORTRAIT_HERO_FRAME_CLASS,
  type AvatarHeroProps,
} from "./avatar-hero";
export {
  DEFAULT_MODEL_PATH,
  getModelCalibration,
  type ModelCalibration,
} from "./model-calibration";
export {
  VisemeController,
  VISEME_NAMES,
  VISEME_TO_MORPHS,
  type SpeakVisemeOptions,
  type VisemeMorphWeights,
  type VisemeName,
} from "./viseme-controller";
export {
  AvatarIdleController,
  bindAvatarIdleTargets,
  AVATAR_POSE_BONE_KEYS,
  DEFAULT_IDLE_POSE_OFFSETS,
  GREETING_POSE_OFFSETS,
  type AvatarIdleOptions,
  type AvatarIdlePoseOffsets,
  type AvatarPoseBoneKey,
  type BoneOffsetDeg,
} from "./avatar-idle-controller";
export {
  GREETING_WAVE_CLIP,
  sampleGreetingWave,
  type GreetingWaveClip,
  type GreetingWaveKeyframe,
} from "./greeting-wave-clip";
export {
  THUMBS_UP_CLIP,
  sampleThumbsUp,
  type GesturePoseClip,
  type GesturePoseKeyframe,
} from "./thumbs-up-clip";
export {
  TALKING_HAND_GESTURE_CLIP,
  TALKING_HAND_GESTURE_CHANCE,
  sampleTalkingHandGesture,
} from "./talking-hand-gesture-clip";
export {
  IDLE_LOOK_CLIP,
  IDLE_LOOK_CHANCE,
  sampleIdleLook,
} from "./idle-look-clip";
export {
  AVATAR_EXPRESSION_MORPH_KEYS,
  DEFAULT_EXPRESSION_WEIGHTS,
  ExpressionMorphApplier,
  cloneExpression,
  expressionHasValues,
  lerpExpression,
  maxBlendExpressions,
  mirrorExpressionLeftToRight,
  type AvatarExpressionMorphKey,
  type AvatarExpressionWeights,
} from "./expression-weights";
export {
  useAvatarIdle,
  createAvatarIdleFromRoot,
  type UseAvatarIdleArgs,
} from "./use-avatar-idle";
