import shp from "shpjs";
import type {
  GeoPoint,
  ImportResult,
  LayerFeature,
  LayerGeometry,
  LayerRole,
  ProjectLayer,
  StakeoutTarget,
  SurveyPoint
} from "./types";
import { importCoordinate } from "./geo/projection";

type ImportMode = "layer" | "targets" | "measured";

interface ImportOptions {
  mode: ImportMode;
  role: LayerRole;
  color: string;
}

export async function importFile(file: File, options: ImportOptions): Promise<ImportResult> {
  const name = file.name;
  const lower = name.toLowerCase();
  let layer: ProjectLayer;
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) {
    layer = parseGeoJson(name, await file.text(), options);
  } else if (lower.endsWith(".csv")) {
    layer = parseCsv(name, await file.text(), options);
  } else if (lower.endsWith(".dxf")) {
    layer = parseDxf(name, await file.text(), options);
  } else if (lower.endsWith(".zip") || lower.endsWith(".shp")) {
    layer = await parseShp(name, await file.arrayBuffer(), options);
  } else {
    throw new Error("Podporujeme CSV, DXF, GeoJSON a ZIP se SHP.");
  }

  const targets =
    options.mode === "targets"
      ? layer.features.flatMap((feature, index) => featureToTargets(feature, index, layer.id))
      : [];
  const points =
    options.mode === "measured"
      ? layer.features.flatMap((feature, index) => featureToMeasuredPoints(feature, index))
      : [];

  return {
    layer,
    targets,
    points,
    summary: `${layer.features.length} prvků, ${countPoints(layer.features)} bodů`
  };
}

function baseLayer(name: string, sourceType: string, options: ImportOptions): ProjectLayer {
  return {
    id: crypto.randomUUID(),
    name: stripExtension(name),
    sourceType,
    visible: true,
    role: options.role,
    color: options.color,
    features: []
  };
}

function parseGeoJson(name: string, raw: string, options: ImportOptions): ProjectLayer {
  const root = JSON.parse(raw);
  const layer = baseLayer(name, "GeoJSON", options);
  const features = root.type === "FeatureCollection" ? root.features ?? [] : [root];
  layer.features = features
    .map((feature: any, index: number) => {
      const geometry = feature.type === "Feature" ? feature.geometry : feature;
      const properties = stringifyProperties(feature.properties ?? {});
      return parseGeoJsonGeometry(geometry, properties, index);
    })
    .filter((feature: LayerFeature | null): feature is LayerFeature => !!feature && feature.points.length > 0);
  return layer;
}

function parseGeoJsonGeometry(geometry: any, properties: Record<string, string>, index: number): LayerFeature | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    return feature("Point", [geoJsonPoint(geometry.coordinates)], properties, index);
  }
  if (geometry.type === "LineString") {
    return feature("Polyline", geometry.coordinates.map(geoJsonPoint), properties, index);
  }
  if (geometry.type === "Polygon") {
    return feature("Polygon", (geometry.coordinates[0] ?? []).map(geoJsonPoint), properties, index);
  }
  return null;
}

function parseCsv(name: string, raw: string, options: ImportOptions): ProjectLayer {
  const rows = raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const layer = baseLayer(name, "CSV", options);
  if (rows.length === 0) return layer;

  const delimiter = detectDelimiter(rows[0]);
  const header = splitCsvLine(rows[0], delimiter).map((value) => normalizeKey(value));
  const xIndex = findHeader(header, ["x", "east", "easting", "lon", "lng", "longitude"]);
  const yIndex = findHeader(header, ["y", "north", "northing", "lat", "latitude"]);
  const zIndex = findHeader(header, ["z", "alt", "altitude", "height", "vyska", "výška"], false);
  const nameIndex = findHeader(header, ["name", "nazev", "název", "point", "bod", "cislo", "číslo"], false);
  const codeIndex = findHeader(header, ["code", "kod", "kód", "layer", "vrstva"], false);
  const noteIndex = findHeader(header, ["note", "poznamka", "poznámka", "popis"], false);

  layer.features = rows.slice(1).flatMap((row, rowIndex) => {
    const cols = splitCsvLine(row, delimiter);
    const x = numeric(cols[xIndex]);
    const y = numeric(cols[yIndex]);
    if (x == null || y == null) return [];
    const point = importCoordinate(x, y, numeric(cols[zIndex]) ?? 0);
    const properties: Record<string, string> = {
      name: cols[nameIndex] || `CSV-${rowIndex + 1}`,
      code: cols[codeIndex] || "",
      note: cols[noteIndex] || ""
    };
    return [feature("Point", [point], properties, rowIndex)];
  });
  return layer;
}

function parseDxf(name: string, raw: string, options: ImportOptions): ProjectLayer {
  const tokens = raw.split(/\r?\n/g).map((line) => line.trim());
  const layer = baseLayer(name, "DXF", options);
  const features: LayerFeature[] = [];
  let index = 0;

  while (index < tokens.length - 1) {
    const code = tokens[index];
    const value = tokens[index + 1];
    if (code === "0" && value.toUpperCase() === "POINT") {
      const entity = readEntity(tokens, index + 2);
      const x = numeric(entity.first("10"));
      const y = numeric(entity.first("20"));
      const z = numeric(entity.first("30")) ?? 0;
      if (x != null && y != null) {
        features.push(
          feature("Point", [importCoordinate(x, y, z)], { layer: entity.first("8") || "DXF" }, features.length)
        );
      }
      index = entity.nextIndex;
      continue;
    }
    if (code === "0" && value.toUpperCase() === "LINE") {
      const entity = readEntity(tokens, index + 2);
      const x1 = numeric(entity.first("10"));
      const y1 = numeric(entity.first("20"));
      const z1 = numeric(entity.first("30")) ?? 0;
      const x2 = numeric(entity.first("11"));
      const y2 = numeric(entity.first("21"));
      const z2 = numeric(entity.first("31")) ?? 0;
      if (x1 != null && y1 != null && x2 != null && y2 != null) {
        features.push(
          feature(
            "Polyline",
            [importCoordinate(x1, y1, z1), importCoordinate(x2, y2, z2)],
            { layer: entity.first("8") || "DXF" },
            features.length
          )
        );
      }
      index = entity.nextIndex;
      continue;
    }
    if (code === "0" && value.toUpperCase() === "LWPOLYLINE") {
      const entity = readEntity(tokens, index + 2);
      const xs = entity.all("10").map(numeric);
      const ys = entity.all("20").map(numeric);
      const points = xs.flatMap((x, pointIndex) => {
        const y = ys[pointIndex];
        return x != null && y != null ? [importCoordinate(x, y, 0)] : [];
      });
      const flags = Number.parseInt(entity.first("70") || "0", 10);
      if (points.length > 0) {
        features.push(
          feature((flags & 1) === 1 ? "Polygon" : "Polyline", points, { layer: entity.first("8") || "DXF" }, features.length)
        );
      }
      index = entity.nextIndex;
      continue;
    }
    index += 2;
  }

  layer.features = features;
  return layer;
}

async function parseShp(name: string, buffer: ArrayBuffer, options: ImportOptions): Promise<ProjectLayer> {
  const geoJson = await shp(buffer);
  const collection = Array.isArray(geoJson)
    ? {
        type: "FeatureCollection",
        features: geoJson.flatMap((item: any) => item.features ?? [])
      }
    : geoJson;
  return parseGeoJson(name, JSON.stringify(collection), { ...options, role: options.role });
}

function readEntity(tokens: string[], start: number) {
  const pairs: Array<[string, string]> = [];
  let index = start;
  while (index < tokens.length - 1 && tokens[index] !== "0") {
    pairs.push([tokens[index], tokens[index + 1]]);
    index += 2;
  }
  return {
    nextIndex: index,
    first: (code: string) => pairs.find((pair) => pair[0] === code)?.[1] ?? "",
    all: (code: string) => pairs.filter((pair) => pair[0] === code).map((pair) => pair[1])
  };
}

function geoJsonPoint(position: number[]): GeoPoint {
  return importCoordinate(Number(position[0]), Number(position[1]), Number(position[2] ?? 0));
}

function feature(
  geometry: LayerGeometry,
  points: GeoPoint[],
  properties: Record<string, string>,
  index: number
): LayerFeature {
  return {
    id: crypto.randomUUID(),
    geometry,
    points,
    properties: {
      name: properties.name || properties.NAME || `${geometry}-${index + 1}`,
      code: properties.code || properties.CODE || "",
      ...properties
    }
  };
}

function featureToTargets(feature: LayerFeature, index: number, sourceLayerId: string): StakeoutTarget[] {
  if (feature.geometry !== "Point") return [];
  return feature.points.map((point, pointIndex) => ({
    id: crypto.randomUUID(),
    name: feature.properties.name || `V${index + pointIndex + 1}`,
    code: feature.properties.code || feature.properties.layer || "VYT",
    position: point,
    note: feature.properties.note || "",
    sourceLayerId
  }));
}

function featureToMeasuredPoints(feature: LayerFeature, index: number): SurveyPoint[] {
  if (feature.geometry !== "Point") return [];
  return feature.points.map((point, pointIndex) => ({
    id: crypto.randomUUID(),
    name: feature.properties.name || `B${String(index + pointIndex + 1).padStart(4, "0")}`,
    code: feature.properties.code || "BOD",
    note: feature.properties.note || "",
    position: point,
    accuracyCm: Number.parseFloat(feature.properties.accuracy_cm || feature.properties.ACC_CM || "0") || 0,
    rtkQuality: "Unknown",
    samples: 0,
    recordedAt: Date.now()
  }));
}

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function findHeader(header: string[], names: string[], required = true): number {
  const index = header.findIndex((item) => names.includes(item));
  if (index >= 0) return index;
  if (required) return names.includes("y") || names.includes("lat") ? 1 : 0;
  return -1;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function numeric(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyProperties(properties: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, value == null ? "" : String(value)]));
}

function countPoints(features: LayerFeature[]): number {
  return features.reduce((sum, item) => sum + item.points.length, 0);
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
