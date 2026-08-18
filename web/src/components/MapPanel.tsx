import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GeoPoint, LayerFeature, MapProvider, SurveyProject } from "../types";
import { projectWgsToSjtskGrid } from "../geo/projection";

const MAP_PROVIDERS: MapProvider[] = ["Light", "Ortho", "Cadastre"];
const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  Light: "OSM",
  Ortho: "Ortofoto",
  Cadastre: "Katastr"
};

const MAX_MAP_ZOOM = 22;
const MAX_NATIVE_OSM_ZOOM = 19;
const MAX_NATIVE_CUZK_ZOOM = 20;

interface PickPreview {
  point: GeoPoint;
  x: number;
  y: number;
}

export function MapPanel({
  project,
  selectedPointId,
  selectedTargetId,
  pickActive,
  onSelectPoint,
  onSelectTarget,
  onPick,
  onProviderChange
}: {
  project: SurveyProject;
  selectedPointId: string | null;
  selectedTargetId: string | null;
  pickActive: boolean;
  onSelectPoint: (id: string | null) => void;
  onSelectTarget: (id: string | null) => void;
  onPick: (point: GeoPoint) => void;
  onProviderChange: (provider: MapProvider) => void;
}) {
  const [pickPreview, setPickPreview] = useState<PickPreview | null>(null);
  const allPoints = collectPoints(project);
  const center: [number, number] = allPoints.length
    ? [
        allPoints.reduce((sum, point) => sum + point.latitude, 0) / allPoints.length,
        allPoints.reduce((sum, point) => sum + point.longitude, 0) / allPoints.length
      ]
    : [49.8175, 15.473];
  const selectedPoint = project.points.find((point) => point.id === selectedPointId) ?? null;

  return (
    <div className="map-panel">
      <MapContainer
        center={center}
        zoom={allPoints.length ? 18 : 8}
        maxZoom={MAX_MAP_ZOOM}
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={90}
        className={pickActive ? "project-map picking leaflet-crosshair" : "project-map"}
        scrollWheelZoom
      >
        <BaseMap provider={project.mapProvider ?? "Light"} />
        <MapFit points={allPoints} projectId={project.id} />
        <FlyToSelected point={selectedPoint?.position ?? project.targets.find((target) => target.id === selectedTargetId)?.position ?? null} />
        <MapPickCapture enabled={pickActive} onPick={onPick} onPreview={setPickPreview} />

        {project.layers
          .filter((layer) => layer.visible)
          .map((layer) =>
            layer.features.map((feature) => (
              <FeatureShape key={feature.id} feature={feature} color={layer.color} layerName={layer.name} />
            ))
          )}

        {project.targets.map((target) => {
          const selected = target.id === selectedTargetId;
          const projected = projectWgsToSjtskGrid(target.position);
          return (
            <CircleMarker
              key={target.id}
              center={[target.position.latitude, target.position.longitude]}
              radius={selected ? 10 : 7}
              pathOptions={{
                color: selected ? "#111827" : "#147efb",
                fillColor: "#147efb",
                fillOpacity: 0.95,
                weight: selected ? 3 : 2
              }}
              eventHandlers={{ click: () => onSelectTarget(target.id) }}
            >
              <Popup>
                <strong>{target.name}</strong>
                <br />
                {target.code} · cíl vytyčení
                <br />
                Y {Math.abs(projected.x).toFixed(2)} · X {Math.abs(projected.y).toFixed(2)}
                <br />Z {(projected.z ?? 0).toFixed(3)}
              </Popup>
            </CircleMarker>
          );
        })}

        {project.points.map((point) => {
          const selected = point.id === selectedPointId;
          return (
            <CircleMarker
              key={point.id}
              center={[point.position.latitude, point.position.longitude]}
              radius={selected ? 10 : 7}
              pathOptions={{
                color: selected ? "#e8332a" : "#15803d",
                fillColor: selected ? "#e8332a" : "#15803d",
                fillOpacity: 0.92,
                weight: selected ? 3 : 1.5
              }}
              eventHandlers={{ click: () => onSelectPoint(point.id) }}
            >
              <Popup>
                <strong>{point.name}</strong>
                <br />
                {point.code} · ±{Math.round(point.accuracyCm * 10)} mm
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="map-provider-switch">
        {MAP_PROVIDERS.map((provider) => (
          <button
            key={provider}
            className={(project.mapProvider ?? "Light") === provider ? "selected" : ""}
            onClick={() => onProviderChange(provider)}
          >
            {MAP_PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>

      {pickActive && (
        <>
          <div
            className="pick-crosshair"
            style={pickPreview ? { left: pickPreview.x, top: pickPreview.y } : undefined}
          />
          <div className="pick-hint">
            Klikni co nejpřesněji do mapy
            {pickPreview && <span>{formatPickPreview(pickPreview.point)}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function collectPoints(project: SurveyProject): GeoPoint[] {
  const points: GeoPoint[] = [];
  project.points.forEach((point) => points.push(point.position));
  project.targets.forEach((target) => points.push(target.position));
  project.layers
    .filter((layer) => layer.visible)
    .forEach((layer) => layer.features.forEach((feature) => feature.points.forEach((point) => points.push(point))));
  return points;
}

function MapPickCapture({
  enabled,
  onPick,
  onPreview
}: {
  enabled: boolean;
  onPick: (point: GeoPoint) => void;
  onPreview: (preview: PickPreview | null) => void;
}) {
  useMapEvents({
    mousemove(event) {
      if (!enabled) return;
      onPreview({
        point: { latitude: event.latlng.lat, longitude: event.latlng.lng, altitude: 0 },
        x: event.containerPoint.x,
        y: event.containerPoint.y
      });
    },
    mouseout() {
      onPreview(null);
    },
    click(event) {
      if (!enabled) return;
      onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng, altitude: 0 });
      onPreview(null);
    }
  });
  return null;
}

function BaseMap({ provider }: { provider: MapProvider }) {
  if (provider === "Ortho") {
    return (
      <>
        <TileLayer
          attribution="&copy; CUZK"
          url="https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}"
          maxZoom={MAX_MAP_ZOOM}
          maxNativeZoom={MAX_NATIVE_CUZK_ZOOM}
        />
        <TileLayer
          className="cadastre-overlay"
          attribution="&copy; CUZK"
          url="https://services.cuzk.cz/wmts/local-km-wmts-google/rest/WMTS/Yellow/KN/{z}/{y}/{x}"
          opacity={0.72}
          maxZoom={MAX_MAP_ZOOM}
          maxNativeZoom={MAX_NATIVE_CUZK_ZOOM}
        />
      </>
    );
  }
  return (
    <>
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={MAX_MAP_ZOOM}
        maxNativeZoom={MAX_NATIVE_OSM_ZOOM}
      />
      {provider === "Cadastre" && (
        <TileLayer
          className="cadastre-overlay"
          attribution="&copy; CUZK"
          url="https://services.cuzk.cz/wmts/local-km-wmts-google/rest/WMTS/default/KN/{z}/{y}/{x}"
          opacity={0.92}
          maxZoom={MAX_MAP_ZOOM}
          maxNativeZoom={MAX_NATIVE_CUZK_ZOOM}
        />
      )}
    </>
  );
}

function MapFit({ points, projectId }: { points: GeoPoint[]; projectId: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number]));
    map.fitBounds(bounds.pad(0.25), { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, projectId]);
  return null;
}

function FlyToSelected({ point }: { point: GeoPoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 18), { animate: true });
  }, [map, point]);
  return null;
}

function formatPickPreview(point: GeoPoint): string {
  const projected = projectWgsToSjtskGrid(point);
  return `Y ${Math.abs(projected.x).toFixed(2)} · X ${Math.abs(projected.y).toFixed(2)}`;
}

function FeatureShape({ feature, color, layerName }: { feature: LayerFeature; color: string; layerName: string }) {
  const positions = feature.points.map((point) => [point.latitude, point.longitude] as [number, number]);
  if (feature.geometry === "Point") {
    return (
      <>
        {feature.points.map((point, index) => (
          <CircleMarker
            key={`${feature.id}-${index}`}
            center={[point.latitude, point.longitude]}
            radius={6}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.9 }}
          >
            <Popup>
              <strong>{feature.properties.name || layerName}</strong>
              <br />
              {feature.properties.code || feature.properties.layer || "vrstva"}
            </Popup>
          </CircleMarker>
        ))}
      </>
    );
  }
  if (feature.geometry === "Polygon") {
    return <Polygon positions={positions} pathOptions={{ color, fillColor: color, fillOpacity: 0.12, weight: 3 }} />;
  }
  return <Polyline positions={positions} pathOptions={{ color, weight: 4 }} />;
}
