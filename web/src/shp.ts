/**
 * Minimalistický zápis ESRI Shapefile — PointZ + DBF + SHX.
 * Stejná struktura, jakou balí Android export (SHP ZIP), aby se výstupy z webu
 * a z telefonu chovaly v QGIS stejně. Texty v DBF jsou UTF-8 + soubor .cpg.
 */

export interface ShpRecord {
  x: number;
  y: number;
  z: number;
  attrs: Record<string, string | number>;
}

export interface DbfField {
  name: string; // max 10 znaků
  type: "C" | "N";
  length: number;
  decimals?: number;
}

const SHAPE_POINT_Z = 11;

export function writePointZShp(records: ShpRecord[]): { shp: ArrayBuffer; shx: ArrayBuffer } {
  const recordContentWords = (4 + 8 * 4) / 2; // shape type + x,y,z,m
  const recordWords = recordContentWords + 4; // + record header
  const shpWords = 50 + records.length * recordWords;
  const shp = new ArrayBuffer(shpWords * 2);
  const shx = new ArrayBuffer(100 + records.length * 8);
  const sv = new DataView(shp);
  const xv = new DataView(shx);

  const bbox = boundingBox(records);
  writeMainHeader(sv, shpWords, bbox);
  writeMainHeader(xv, (100 + records.length * 8) / 2, bbox);

  let offset = 100;
  records.forEach((record, index) => {
    xv.setInt32(100 + index * 8, offset / 2, false);
    xv.setInt32(100 + index * 8 + 4, recordContentWords, false);

    sv.setInt32(offset, index + 1, false);
    sv.setInt32(offset + 4, recordContentWords, false);
    sv.setInt32(offset + 8, SHAPE_POINT_Z, true);
    sv.setFloat64(offset + 12, record.x, true);
    sv.setFloat64(offset + 20, record.y, true);
    sv.setFloat64(offset + 28, record.z, true);
    sv.setFloat64(offset + 36, 0, true); // M
    offset += recordWords * 2;
  });

  return { shp, shx };
}

export function writeDbf(fields: DbfField[], records: ShpRecord[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const headerLength = 32 + fields.length * 32 + 1;
  const buffer = new ArrayBuffer(headerLength + records.length * recordLength + 1);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const now = new Date();
  view.setUint8(0, 0x03);
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, records.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  fields.forEach((field, index) => {
    const base = 32 + index * 32;
    const name = encoder.encode(field.name.slice(0, 10));
    bytes.set(name, base);
    bytes[base + 11] = field.type.charCodeAt(0);
    bytes[base + 16] = field.length;
    bytes[base + 17] = field.decimals ?? 0;
  });
  bytes[32 + fields.length * 32] = 0x0d;

  records.forEach((record, recordIndex) => {
    let cursor = headerLength + recordIndex * recordLength;
    bytes[cursor] = 0x20;
    cursor += 1;
    fields.forEach((field) => {
      const raw = record.attrs[field.name];
      let cell: Uint8Array;
      if (field.type === "N") {
        const num = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
        const text = num.toFixed(field.decimals ?? 0).slice(0, field.length).padStart(field.length, " ");
        cell = encoder.encode(text);
      } else {
        const encoded = encoder.encode(String(raw ?? ""));
        cell = new Uint8Array(field.length).fill(0x20);
        // UTF-8: nikdy neuseknout vícebajtový znak uprostřed
        let take = Math.min(encoded.length, field.length);
        while (take > 0 && (encoded[take] ?? 0) >= 0x80 && (encoded[take] ?? 0) < 0xc0) take -= 1;
        cell.set(encoded.subarray(0, take));
      }
      bytes.set(cell.subarray(0, field.length), cursor);
      cursor += field.length;
    });
  });
  bytes[buffer.byteLength - 1] = 0x1a;
  return buffer;
}

/** ESRI WKT pro S-JTSK / Krovak East North (EPSG:5514). */
export const SJTSK_PRJ =
  'PROJCS["S-JTSK_Krovak_East_North",GEOGCS["GCS_S_JTSK",DATUM["D_S_JTSK",' +
  'SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Krovak"],' +
  'PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Pseudo_Standard_Parallel_1",78.5],PARAMETER["Scale_Factor",0.9999],' +
  'PARAMETER["Azimuth",30.28813975277778],PARAMETER["Longitude_Of_Center",24.83333333333333],' +
  'PARAMETER["Latitude_Of_Center",49.5],PARAMETER["X_Scale",-1.0],PARAMETER["Y_Scale",1.0],' +
  'PARAMETER["XY_Plane_Rotation",90.0],UNIT["Meter",1.0]]';

function writeMainHeader(view: DataView, fileLengthWords: number, bbox: number[]): void {
  view.setInt32(0, 9994, false);
  view.setInt32(24, fileLengthWords, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, SHAPE_POINT_Z, true);
  view.setFloat64(36, bbox[0], true);
  view.setFloat64(44, bbox[1], true);
  view.setFloat64(52, bbox[2], true);
  view.setFloat64(60, bbox[3], true);
  view.setFloat64(68, bbox[4], true);
  view.setFloat64(76, bbox[5], true);
}

function boundingBox(records: ShpRecord[]): number[] {
  if (records.length === 0) return [0, 0, 0, 0, 0, 0];
  let [minX, minY, maxX, maxY, minZ, maxZ] = [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity];
  for (const record of records) {
    minX = Math.min(minX, record.x);
    minY = Math.min(minY, record.y);
    maxX = Math.max(maxX, record.x);
    maxY = Math.max(maxY, record.y);
    minZ = Math.min(minZ, record.z);
    maxZ = Math.max(maxZ, record.z);
  }
  return [minX, minY, maxX, maxY, minZ, maxZ];
}
