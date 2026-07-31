export const DEFAULT_MODEL_PATH = "/models/angelica3d.web.glb";

export type ModelCalibration = {
  center: { x: number; y: number; z: number };
  scale: number;
  bottomOffset: number;
};

const CALIBRATIONS: Record<string, ModelCalibration> = {
  [DEFAULT_MODEL_PATH]: {
    center: { x: 0, y: 378.74, z: 104.52 },
    scale: 0.0105,
    bottomOffset: 96.273 * 0.0105,
  },
  "/models/thanh.glb": {
    center: { x: 0, y: 0.929, z: 0.035 },
    scale: 1,
    bottomOffset: 0.929,
  },
  "/models/tham-color.glb": {
    center: { x: 0, y: 0.881, z: 0.041 },
    scale: 1,
    bottomOffset: 0.881,
  },
  "/models/tran-thi-ngoc-tham.glb": {
    center: { x: 0, y: 0.881, z: 0.041 },
    scale: 1,
    bottomOffset: 0.881,
  },
};

export function getModelCalibration(modelPath: string): ModelCalibration {
  return CALIBRATIONS[modelPath] ?? CALIBRATIONS[DEFAULT_MODEL_PATH];
}
