import { ungzip } from "pako";
import payload from "../assets/cuzk_corr_payload.b64?raw";

export interface GridCorrection {
  x: number;
  y: number;
}

const WIDTH = 241;
const HEIGHT = 152;
const ORIGIN_X = -908000.0;
const ORIGIN_Y = -930000.0;
const STEP = 2000.0;
const VALUES_PER_NODE = 2;

let values: Float32Array | null = null;

function decodePayload(): Float32Array {
  const clean = payload.replace(/\s+/g, "");
  const compressed = Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
  const raw = ungzip(compressed);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const result = new Float32Array((raw.byteLength / 4) | 0);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = view.getFloat32(index * 4, true);
  }
  return result;
}

function gridValues(): Float32Array {
  if (!values) values = decodePayload();
  return values;
}

function node(row: number, col: number): GridCorrection | null {
  const data = gridValues();
  const index = (row * WIDTH + col) * VALUES_PER_NODE;
  const dx = data[index];
  const dy = data[index + 1];
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return { x: dx, y: dy };
}

export function correctionAt(x: number, y: number): GridCorrection | null {
  const gridX = (x - ORIGIN_X) / STEP;
  const gridY = (ORIGIN_Y - y) / STEP;
  const col = Math.floor(gridX);
  const row = Math.floor(gridY);
  if (col < 0 || row < 0 || col >= WIDTH - 1 || row >= HEIGHT - 1) return null;
  const tx = gridX - col;
  const ty = gridY - row;
  const c00 = node(row, col);
  const c10 = node(row, col + 1);
  const c01 = node(row + 1, col);
  const c11 = node(row + 1, col + 1);
  if (!c00 || !c10 || !c01 || !c11) return null;

  const dxTop = c00.x * (1 - tx) + c10.x * tx;
  const dxBottom = c01.x * (1 - tx) + c11.x * tx;
  const dyTop = c00.y * (1 - tx) + c10.y * tx;
  const dyBottom = c01.y * (1 - tx) + c11.y * tx;
  return {
    x: dxTop * (1 - ty) + dxBottom * ty,
    y: dyTop * (1 - ty) + dyBottom * ty
  };
}
