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
  return (value || "HOMOLA").replace(/[^\w.-]+/g, "_").slice(0, 64);
}
