/**
 * ÚŘEDNÍ TRANSFORMACE ETRS89 (ETRF2000) → S-JTSK
 *
 * Přeneseno z modulu aplikace PipeTrack Field pro iOS, který je ověřený
 * proti transformační službě ČÚZK na 77 bodech napříč republikou:
 * průměrná odchylka 4,35 mm, maximální 6,65 mm.
 *
 * PROČ VZNIKL: web dřív používal proj4 s parametry
 * `towgs84=485,169.5,483.8,...`, což je STARÁ PŘIBLIŽNÁ transformace.
 * Měřením proti úřední službě vycházela odchylka 0,2 až 3,2 m (průměr 1,5 m).
 * Opravná tabulka to nemohla dohnat, protože její korekce jsou jen
 * centimetrové až decimetrové.
 *
 * Postup má tři kroky a všechny tři jsou nutné:
 *   1. Helmertova transformace ETRF2000 → Bessel (úřední parametry)
 *   2. Křovákovo zobrazení
 *   3. Polynomiální korekce modifikovaného Křováka (EPSG metoda 1042)
 *
 * Krok 3 v původní verzi chyběl úplně — sám o sobě dělá až 43 cm.
 *
 * Souřadnice se tu drží v PROJ4 KONVENCI (záporné), stejně jako ve zbytku
 * webu i v datovém modelu.
 */

/** Verze modulu; zvyšovat jen při změně výpočtu, ne při úpravě webu. */
export const TRANSFORM_MODULE_VERSION = "1.3";

// ---------------------------------------------------------------------------
// Helmert ETRF2000 → Bessel — úřední parametry ČÚZK
// ---------------------------------------------------------------------------

const GRS80_A = 6378137.0;
const GRS80_E2 = 0.006694380022901;
const BESSEL_A = 6377397.155;
const BESSEL_E2 = 0.00667437223062;

const ROT_A = (0.00145786865 * Math.PI) / 180; // 5,2483"
const ROT_B = (0.0004247224638888889 * Math.PI) / 180; // 1,5290"
const ROT_C = (0.001381421463888889 * Math.PI) / 180; // 4,9731"
const SCALE = 0.9999964607; // −3,5393 ppm
const TX = 572.203;
const TY = 85.328;
const TZ = 461.934;

interface Geodetic {
  latitude: number; // radiány
  longitude: number; // radiány
  height: number;
}

function cartesianToGeodetic(x: number, y: number, z: number, a: number, es: number): Geodetic {
  const p = Math.hypot(x, y);
  let latitude = Math.atan2(z, p * (1 - es));
  let height = 0;
  for (let i = 0; i < 20; i += 1) {
    const sin = Math.sin(latitude);
    const n = a / Math.sqrt(1 - es * sin * sin);
    height = p / Math.cos(latitude) - n;
    const next = Math.atan2(z, p * (1 - (es * n) / (n + height)));
    if (Math.abs(next - latitude) < 1e-14) {
      latitude = next;
      break;
    }
    latitude = next;
  }
  return { latitude, longitude: Math.atan2(y, x), height };
}

/** ETRS89 (stupně) → Bessel (radiány). */
export function etrfToBessel(latitudeDeg: number, longitudeDeg: number, height: number): Geodetic {
  const lat = (latitudeDeg * Math.PI) / 180;
  const lon = (longitudeDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const rn = GRS80_A / Math.sqrt(1 - GRS80_E2 * sinLat * sinLat);
  const x = (rn + height) * cosLat * Math.cos(lon);
  const y = (rn + height) * cosLat * Math.sin(lon);
  const z = (rn * (1 - GRS80_E2) + height) * sinLat;

  // POZOR: translace se odečítá AŽ PO rotaci a měřítku
  const xb = (x + ROT_A * y - ROT_B * z) * SCALE - TX;
  const yb = (-ROT_A * x + y + ROT_C * z) * SCALE - TY;
  const zb = (ROT_B * x - ROT_C * y + z) * SCALE - TZ;
  return cartesianToGeodetic(xb, yb, zb, BESSEL_A, BESSEL_E2);
}

/**
 * Bessel → ETRS89. Transponovaná rotace je jen PŘIBLIŽNÁ inverze (matice
 * I + Ω není ortogonální), proto se výsledek dolaďuje iterací přes dopředný
 * chod — po třech krocích je zbytek pod mikrometrem.
 */
export function besselToEtrf(latitudeRad: number, longitudeRad: number, height: number): Geodetic {
  const sinLat = Math.sin(latitudeRad);
  const cosLat = Math.cos(latitudeRad);
  const rn = BESSEL_A / Math.sqrt(1 - BESSEL_E2 * sinLat * sinLat);
  const xb = (rn + height) * cosLat * Math.cos(longitudeRad);
  const yb = (rn + height) * cosLat * Math.sin(longitudeRad);
  const zb = (rn * (1 - BESSEL_E2) + height) * sinLat;

  let x = (xb + TX) / SCALE;
  let y = (yb + TY) / SCALE;
  let z = (zb + TZ) / SCALE;
  const x1 = x - ROT_A * y + ROT_B * z;
  const y1 = ROT_A * x + y - ROT_C * z;
  const z1 = -ROT_B * x + ROT_C * y + z;
  x = x1;
  y = y1;
  z = z1;

  for (let i = 0; i < 3; i += 1) {
    const fx = (x + ROT_A * y - ROT_B * z) * SCALE - TX;
    const fy = (-ROT_A * x + y + ROT_C * z) * SCALE - TY;
    const fz = (ROT_B * x - ROT_C * y + z) * SCALE - TZ;
    x += xb - fx;
    y += yb - fy;
    z += zb - fz;
  }
  return cartesianToGeodetic(x, y, z, GRS80_A, GRS80_E2);
}

// ---------------------------------------------------------------------------
// Polynomiální korekce modifikovaného Křováka (EPSG 1042)
// ---------------------------------------------------------------------------

const MOD_X0 = 1089000.0;
const MOD_Y0 = 654000.0;

/** Koeficienty C1..C10; index 0 se nepoužívá, ať čísla odpovídají značení. */
const MOD_C = [
  0,
  2.946529277e-2,
  2.515965696e-2,
  1.193845912e-7,
  -4.668270147e-7,
  9.233980362e-12,
  1.523735715e-12,
  1.696780024e-18,
  4.408314235e-18,
  -8.331083518e-24,
  -3.689471323e-24
];

/**
 * Korekce se od Křovákových souřadnic ODEČÍTÁ.
 *
 * POZOR NA KONSTANTNÍ ČLENY: dle EPSG patří C1 k severní složce (dx)
 * a C2 k západní (dy), NE naopak. Jejich prohození dělá trvalý posun
 * o jejich rozdíl, tedy 4,3 mm.
 */
export function modifiedKrovakCorrection(y: number, x: number): { dy: number; dx: number } {
  const xr = y - MOD_Y0;
  const yr = x - MOD_X0;
  const c = MOD_C;

  let dy = c[2];
  dy += c[3] * xr;
  dy += c[4] * yr;
  dy += 2 * c[5] * yr * xr;
  dy += c[6] * (yr ** 2 - xr ** 2);
  dy += c[8] * yr * (yr ** 2 - 3 * xr ** 2);
  dy += c[7] * xr * (3 * yr ** 2 - xr ** 2);
  dy -= 4 * c[10] * xr * yr * (yr ** 2 - xr ** 2);
  dy += c[9] * (yr ** 4 + xr ** 4 - 6 * yr ** 2 * xr ** 2);

  let dx = c[1];
  dx += c[3] * yr;
  dx -= c[4] * xr;
  dx += c[5] * (yr ** 2 - xr ** 2);
  dx -= 2 * c[6] * yr * xr;
  dx += c[7] * yr * (yr ** 2 - 3 * xr ** 2);
  dx -= c[8] * xr * (3 * yr ** 2 - xr ** 2);
  dx += 4 * c[9] * xr * yr * (yr ** 2 - xr ** 2);
  dx += c[10] * (yr ** 4 + xr ** 4 - 6 * yr ** 2 * xr ** 2);

  return { dy, dx };
}

// ---------------------------------------------------------------------------
// Křovákovo zobrazení
// ---------------------------------------------------------------------------

const S45 = Math.PI / 4;
const FI0 = 0.863937979737193;
const LONG0 = 0.7417649320975901 - 0.308341501185665;
const K0 = 0.9999;
const S0 = 1.37008346281555;
const UQ = 1.04216856380474;

const E = Math.sqrt(BESSEL_E2);
const ALFA = Math.sqrt(1 + (BESSEL_E2 * Math.cos(FI0) ** 4) / (1 - BESSEL_E2));
const U0 = Math.asin(Math.sin(FI0) / ALFA);
const G = ((1 + E * Math.sin(FI0)) / (1 - E * Math.sin(FI0))) ** ((ALFA * E) / 2);
const K = (Math.tan(U0 / 2 + S45) / Math.tan(FI0 / 2 + S45) ** ALFA) * G;
const N0 = (BESSEL_A * Math.sqrt(1 - BESSEL_E2)) / (1 - BESSEL_E2 * Math.sin(FI0) ** 2);
const N = Math.sin(S0);
const RO0 = (K0 * N0) / Math.tan(S0);
const AD = Math.PI / 2 - UQ;

/** Bessel (radiány) → S-JTSK/05 v KLADNÉ konvenci, včetně modifikovaného Křováka. */
export function besselToJtsk05(latitudeRad: number, longitudeRad: number): { y: number; x: number } {
  const gfi = ((1 + E * Math.sin(latitudeRad)) / (1 - E * Math.sin(latitudeRad))) ** ((ALFA * E) / 2);
  const u = 2 * (Math.atan((K * Math.tan(latitudeRad / 2 + S45) ** ALFA) / gfi) - S45);
  const deltaV = ALFA * (LONG0 - longitudeRad);
  const s = Math.asin(Math.cos(AD) * Math.sin(u) + Math.sin(AD) * Math.cos(u) * Math.cos(deltaV));
  const d = Math.asin((Math.cos(u) * Math.sin(deltaV)) / Math.cos(s));
  const eps = N * d;
  const ro = (RO0 * Math.tan(S0 / 2 + S45) ** N) / Math.tan(s / 2 + S45) ** N;

  const yKrovak = ro * Math.sin(eps);
  const xKrovak = ro * Math.cos(eps);
  const correction = modifiedKrovakCorrection(yKrovak, xKrovak);
  return { y: yKrovak - correction.dy, x: xKrovak - correction.dx };
}

/** S-JTSK/05 (kladná konvence) → Bessel; odčiní modifikovaný Křovák. */
export function jtsk05ToBessel(jtskY: number, jtskX: number): { latitude: number; longitude: number } {
  let y = jtskY;
  let x = jtskX;
  for (let i = 0; i < 4; i += 1) {
    const c = modifiedKrovakCorrection(y, x);
    y = jtskY + c.dy;
    x = jtskX + c.dx;
  }

  const ro = Math.hypot(x, y);
  const eps = Math.atan2(y, x);
  const d = eps / Math.sin(S0);
  const s = 2 * (Math.atan(((RO0 / ro) ** (1 / N) * Math.tan(S0 / 2 + S45)) as number) - S45);
  const u = Math.asin(Math.cos(AD) * Math.sin(s) - Math.sin(AD) * Math.cos(s) * Math.cos(d));
  const deltaV = Math.asin((Math.cos(s) * Math.sin(d)) / Math.cos(u));
  const longitude = LONG0 - deltaV / ALFA;

  let latitude = u;
  for (let i = 0; i < 20; i += 1) {
    const next =
      2 *
      (Math.atan(
        K ** (-1 / ALFA) *
          Math.tan(u / 2 + S45) ** (1 / ALFA) *
          ((1 + E * Math.sin(latitude)) / (1 - E * Math.sin(latitude))) ** (E / 2)
      ) -
        S45);
    if (Math.abs(next - latitude) < 1e-12) {
      latitude = next;
      break;
    }
    latitude = next;
  }
  return { latitude, longitude };
}

// ---------------------------------------------------------------------------
// Veřejné rozhraní v PROJ4 konvenci (záporné souřadnice)
// ---------------------------------------------------------------------------

/** ETRS89 → S-JTSK bez tabulkové korekce, v proj4 konvenci. */
export function wgsToJtsk05Proj4(latitudeDeg: number, longitudeDeg: number, height = 0): { x: number; y: number } {
  const bessel = etrfToBessel(latitudeDeg, longitudeDeg, height);
  const jtsk = besselToJtsk05(bessel.latitude, bessel.longitude);
  // proj4 konvence: x = −Y (západní), y = −X (jižní)
  return { x: -jtsk.y, y: -jtsk.x };
}

/** S-JTSK v proj4 konvenci → ETRS89 (stupně). */
export function jtsk05Proj4ToWgs(x: number, y: number, height = 0): { latitude: number; longitude: number } {
  const bessel = jtsk05ToBessel(-x, -y);
  const result = besselToEtrf(bessel.latitude, bessel.longitude, height);
  return {
    latitude: (result.latitude * 180) / Math.PI,
    longitude: (result.longitude * 180) / Math.PI
  };
}
