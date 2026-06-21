import proj4 from "proj4";
import type { GeoPoint } from "../types";
import { correctionAt } from "./cuzkGrid";

export interface ProjectedPoint {
  x: number;
  y: number;
  z?: number;
}

const WGS84 = "EPSG:4326";
const SJTSK_APPROX = "HOMOLA:SJTSK_APPROX";

proj4.defs(
  SJTSK_APPROX,
  "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 " +
    "+x_0=0 +y_0=0 +ellps=bessel +towgs84=485,169.5,483.8,7.786,4.398,4.103,0 +units=m +no_defs"
);

export function looksProjected(x: number, y: number): boolean {
  return Math.abs(x) > 180 || Math.abs(y) > 90;
}

export function projectWgsToSjtskGrid(point: GeoPoint): ProjectedPoint {
  const [x, y] = proj4(WGS84, SJTSK_APPROX, [point.longitude, point.latitude]);
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
  const [longitude, latitude] = proj4(SJTSK_APPROX, WGS84, [approx.x, approx.y]);
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
  return { longitude: x, latitude: y, altitude: z };
}
