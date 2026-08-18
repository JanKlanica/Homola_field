import type { GeoPoint, LayerFeature, ProjectLayer, SurveyProject } from "./types";
import { projectWgsToSjtskGrid } from "./geo/projection";

export function downloadBlob(name: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function projectJson(project: SurveyProject): string {
  return JSON.stringify(project, null, 2);
}

export function projectGeoJson(project: SurveyProject): string {
  const features: any[] = [];

  project.points.forEach((point) => {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords(point.position) },
      properties: {
        source: "measured",
        name: point.name,
        code: point.code,
        note: point.note,
        accuracy_cm: point.accuracyCm,
        samples: point.samples
      }
    });
  });

  project.targets.forEach((target) => {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords(target.position) },
      properties: {
        source: "stakeout",
        name: target.name,
        code: target.code,
        note: target.note
      }
    });
  });

  project.layers.forEach((layer) => {
    layer.features.forEach((feature) => features.push(layerFeatureToGeoJson(layer, feature)));
  });

  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}

export function projectCsv(project: SurveyProject): string {
  const rows = [
    ["type", "name", "code", "lat", "lon", "z", "sjtsk_x", "sjtsk_y", "accuracy_cm", "note"].join(";")
  ];
  project.points.forEach((point) => {
    rows.push(csvRow("measured", point.name, point.code, point.position, point.accuracyCm, point.note));
  });
  project.targets.forEach((target) => {
    rows.push(csvRow("stakeout", target.name, target.code, target.position, 0, target.note));
  });
  project.layers.forEach((layer) => {
    layer.features.forEach((feature, index) => {
      if (feature.geometry === "Point") {
        feature.points.forEach((point) => {
          rows.push(csvRow(`layer:${layer.name}`, feature.properties.name || `${layer.name}-${index + 1}`, feature.properties.code || "", point, 0, feature.properties.note || ""));
        });
      }
    });
  });
  return rows.join("\n");
}

export function projectDxf(project: SurveyProject): string {
  const lines: string[] = ["0", "SECTION", "2", "ENTITIES"];
  const addPoint = (name: string, code: string, point: GeoPoint) => {
    const projected = projectWgsToSjtskGrid(point);
    lines.push("0", "POINT", "8", cleanLayer(code || "BOD"), "10", fixed(projected.x), "20", fixed(projected.y), "30", fixed(projected.z ?? 0), "999", name);
  };
  const addPolyline = (layerName: string, feature: LayerFeature) => {
    lines.push("0", "LWPOLYLINE", "8", cleanLayer(layerName), "90", String(feature.points.length), "70", feature.geometry === "Polygon" ? "1" : "0");
    feature.points.forEach((point) => {
      const projected = projectWgsToSjtskGrid(point);
      lines.push("10", fixed(projected.x), "20", fixed(projected.y));
    });
  };

  project.points.forEach((point) => addPoint(point.name, point.code, point.position));
  project.targets.forEach((target) => addPoint(target.name, `VYT_${target.code || "CIL"}`, target.position));
  project.layers.forEach((layer) => {
    layer.features.forEach((feature) => {
      if (feature.geometry === "Point") {
        feature.points.forEach((point) => addPoint(feature.properties.name || layer.name, feature.properties.layer || layer.name, point));
      } else {
        addPolyline(feature.properties.layer || layer.name, feature);
      }
    });
  });

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

function layerFeatureToGeoJson(layer: ProjectLayer, feature: LayerFeature): any {
  const properties = {
    source: "layer",
    layer: layer.name,
    role: layer.role,
    color: layer.color,
    ...feature.properties
  };
  if (feature.geometry === "Point") {
    return { type: "Feature", geometry: { type: "Point", coordinates: coords(feature.points[0]) }, properties };
  }
  if (feature.geometry === "Polygon") {
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [feature.points.map(coords)] },
      properties
    };
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: feature.points.map(coords) },
    properties
  };
}

function csvRow(type: string, name: string, code: string, point: GeoPoint, accuracyCm: number, note: string): string {
  const projected = projectWgsToSjtskGrid(point);
  return [
    type,
    name,
    code,
    point.latitude.toFixed(8),
    point.longitude.toFixed(8),
    (point.altitude ?? 0).toFixed(3),
    fixed(projected.x),
    fixed(projected.y),
    accuracyCm.toFixed(1),
    note
  ]
    .map((value) => `"${String(value).replace(/"/g, '""')}"`)
    .join(";");
}

function coords(point: GeoPoint): number[] {
  return [point.longitude, point.latitude, point.altitude ?? 0];
}

function fixed(value: number): string {
  return value.toFixed(3);
}

function cleanLayer(value: string): string {
  return (value || "PIPETRACK").replace(/[^\w.-]+/g, "_").slice(0, 64);
}

// ---------------------------------------------------------------------------
// SHP ZIP, Fotky ZIP — parita s Android exportem
// ---------------------------------------------------------------------------

import JSZip from "jszip";
import { pointPhotos } from "./types";
import type { SurveyPoint } from "./types";
import { writePointZShp, writeDbf, SJTSK_PRJ, type DbfField, type ShpRecord } from "./shp";

export function downloadBinary(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const SHP_FIELDS: DbfField[] = [
  { name: "NAME", type: "C", length: 40 },
  { name: "CODE", type: "C", length: 20 },
  { name: "SOURCE", type: "C", length: 10 },
  { name: "Z", type: "N", length: 12, decimals: 3 },
  { name: "ACC_CM", type: "N", length: 8, decimals: 1 },
  { name: "QUALITY", type: "C", length: 8 },
  { name: "DATE", type: "C", length: 20 },
  { name: "PHOTOS", type: "N", length: 3, decimals: 0 },
  { name: "NOTE", type: "C", length: 80 }
];

export async function projectShpZip(project: SurveyProject): Promise<Blob> {
  const records: ShpRecord[] = [];
  project.points.forEach((point) => {
    const projected = projectWgsToSjtskGrid(point.position);
    records.push({
      x: projected.x,
      y: projected.y,
      z: projected.z ?? 0,
      attrs: {
        NAME: point.name,
        CODE: point.code,
        SOURCE: "MEASURED",
        Z: projected.z ?? 0,
        ACC_CM: point.accuracyCm,
        QUALITY: point.rtkQuality.toUpperCase(),
        DATE: new Date(point.recordedAt).toISOString().slice(0, 16).replace("T", " "),
        PHOTOS: pointPhotos(point).length,
        NOTE: point.note
      }
    });
  });
  project.targets.forEach((target) => {
    const projected = projectWgsToSjtskGrid(target.position);
    records.push({
      x: projected.x,
      y: projected.y,
      z: projected.z ?? 0,
      attrs: {
        NAME: target.name,
        CODE: target.code,
        SOURCE: "STAKEOUT",
        Z: projected.z ?? 0,
        ACC_CM: 0,
        QUALITY: "",
        DATE: "",
        PHOTOS: 0,
        NOTE: target.note
      }
    });
  });
  if (records.length === 0) throw new Error("Projekt nemá žádné body k exportu.");

  const base = slug(project.name);
  const { shp, shx } = writePointZShp(records);
  const zip = new JSZip();
  zip.file(`${base}.shp`, shp);
  zip.file(`${base}.shx`, shx);
  zip.file(`${base}.dbf`, writeDbf(SHP_FIELDS, records));
  zip.file(`${base}.prj`, SJTSK_PRJ);
  zip.file(`${base}.cpg`, "UTF-8");
  return zip.generateAsync({ type: "blob" });
}

export async function projectPhotosZip(
  project: SurveyProject,
  resolvePhotoUrl: (ref: string) => Promise<string | null>
): Promise<Blob> {
  const zip = new JSZip();
  const indexRows = ["bod;kod;soubor;sjtsk_y;sjtsk_x;z;datum"];
  let count = 0;

  for (const point of project.points) {
    const photos = pointPhotos(point);
    for (let index = 0; index < photos.length; index += 1) {
      const url = await resolvePhotoUrl(photos[index]);
      if (!url) continue;
      const blob = await fetchPhotoBlob(url);
      if (!blob) continue;
      const fileName = `${safeName(point.name)}_${index + 1}.jpg`;
      zip.file(fileName, blob);
      const projected = projectWgsToSjtskGrid(point.position);
      indexRows.push(
        [
          point.name,
          point.code,
          fileName,
          Math.abs(projected.x).toFixed(2),
          Math.abs(projected.y).toFixed(2),
          (projected.z ?? 0).toFixed(3),
          new Date(point.recordedAt).toLocaleString("cs-CZ")
        ].join(";")
      );
      count += 1;
    }
  }

  if (count === 0) throw new Error("Projekt zatím nemá žádné fotky.");
  zip.file("fotoindex.csv", "\ufeff" + indexRows.join("\n"));
  return zip.generateAsync({ type: "blob" });
}

async function fetchPhotoBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith("data:")) {
      const response = await fetch(url);
      return await response.blob();
    }
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

export function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "projekt"
  );
}

function safeName(value: string): string {
  return value.replace(/[^\w.-]+/g, "_") || "bod";
}

export function accuracyLabel(point: SurveyPoint): string {
  const mm = Math.round(point.accuracyCm * 10);
  const quality = point.rtkQuality === "Fix" ? "FIX" : point.rtkQuality === "Float" ? "FLT" : point.rtkQuality === "Single" ? "SGL" : "?";
  return `${quality} ±${mm} mm`;
}
