import type { GeoPoint } from "../types";
import { correctionAt } from "./cuzkGrid";
import { wgsToJtsk05Proj4, jtsk05Proj4ToWgs } from "./cuzkTransform";

export interface ProjectedPoint {
  x: number;
  y: number;
  z?: number;
}

/* Dřív se tu používal proj4 s parametry towgs84=485,169.5,483.8, což je
   STARÁ PŘIBLIŽNÁ transformace. Měřením proti transformační službě ČÚZK
   vycházela odchylka 0,2 až 3,2 m (průměr 1,5 m) a opravná tabulka to
   nemohla dohnat — její korekce jsou jen centimetrové až decimetrové.

   Nahrazeno modulem z aplikace pro iOS, ověřeným proti téže službě:
   průměr 3,9 mm, maximum 5,1 mm. Viz cuzkTransform.ts. */

export function looksProjected(x: number, y: number): boolean {
  return Math.abs(x) > 180 || Math.abs(y) > 90;
}

export function projectWgsToSjtskGrid(point: GeoPoint): ProjectedPoint {
  if (Number.isFinite(point.sjtskX) && Number.isFinite(point.sjtskY)) {
    return {
      x: point.sjtskX as number,
      y: point.sjtskY as number,
      z: point.altitude ?? 0
    };
  }
  const { x, y } = wgsToJtsk05Proj4(point.latitude, point.longitude, point.altitude ?? 0);
  const correction = correctionAt(x, y);
  return {
    x: correction ? x + correction.x : x,
    y: correction ? y + correction.y : y,
    z: point.altitude ?? 0
  };
}

export function unprojectSjtskGrid(point: ProjectedPoint): GeoPoint {
  let approx = { ...point };
  for (let i = 0; i < 3; i += 1) {
    const correction = correctionAt(approx.x, approx.y);
    if (!correction) break;
    approx = {
      x: point.x - correction.x,
      y: point.y - correction.y,
      z: point.z
    };
  }
  const { latitude, longitude } = jtsk05Proj4ToWgs(approx.x, approx.y, approx.z ?? 0);
  return {
    latitude,
    longitude,
    altitude: point.z ?? 0,
    sjtskX: point.x,
    sjtskY: point.y
  };
}

export function importCoordinate(x: number, y: number, z = 0): GeoPoint {
  if (looksProjected(x, y)) {
    return unprojectSjtskGrid({ x, y, z });
  }
  const point = { longitude: x, latitude: y, altitude: z };
  const projected = projectWgsToSjtskGrid(point);
  return { ...point, sjtskX: projected.x, sjtskY: projected.y };
}
