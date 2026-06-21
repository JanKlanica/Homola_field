import { FormEvent, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import {
  ArrowDownToLine,
  Cloud,
  Crosshair,
  FileUp,
  Folder,
  Layers,
  LineChart,
  LogOut,
  MapPinned,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";
import type { GeoPoint, LayerFeature, LayerRole, ProjectLayer, SurveyProject, UserSession } from "./types";
import { emptyProject } from "./types";
import { loadCloudConfig } from "./cloudConfig";
import { createProjectStore, type ProjectStore } from "./storage";
import { importFile } from "./importers";
import { downloadBlob, projectCsv, projectDxf, projectGeoJson, projectJson } from "./exporters";

const ROLE_LABELS: Record<LayerRole, string> = {
  podklad: "Podklad",
  vytyceni: "Vytyčení",
  mereni: "Měření",
  hranice: "Hranice",
  site: "Sítě"
};

const pointIcon = new L.DivIcon({
  className: "hf-marker",
  html: '<span class="hf-marker-dot"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const ASSET_BASE = import.meta.env.BASE_URL;

export function App() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [notice, setNotice] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedId) ?? projects[0] ?? null;

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      const config = await loadCloudConfig();
      const nextStore = createProjectStore(config);
      if (!active) return;
      setStore(nextStore);
      const current = await nextStore.currentSession();
      if (!active) return;
        setSession(current);
      if (current) await reloadProjects(nextStore, setProjects, setSelectedId);
    }
    bootstrap().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSignedIn(nextSession: UserSession) {
    if (!store) return;
    setSession(nextSession);
    await reloadProjects(store, setProjects, setSelectedId);
  }

  async function saveProject(project: SurveyProject, message = "Uloženo") {
    if (!store) return;
    const saved = await store.saveProject(project);
    setProjects((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt - a.updatedAt));
    setSelectedId(saved.id);
    setNotice(message);
  }

  async function deleteProject(projectId: string) {
    if (!store) return;
    await store.deleteProject(projectId);
    const next = projects.filter((project) => project.id !== projectId);
    setProjects(next);
    setSelectedId(next[0]?.id ?? "");
    setNotice("Projekt smazán");
  }

  if (loading || !store) {
    return <ShellSplash text="Startuji Homola Cloud..." />;
  }

  if (!session) {
    return <AuthScreen store={store} onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="app-shell">
      <aside className="project-sidebar">
        <div className="brand-row">
          <img src={`${ASSET_BASE}homola-mark.png`} alt="Homola" />
          <div>
            <strong>Homola Field</strong>
            <span>{session.cloud ? "Cloud" : "lokální režim"}</span>
          </div>
        </div>
        <ProjectCreator
          onCreate={(name, description) => saveProject(emptyProject(name, description), "Projekt založen")}
        />
        <div className="search-box">
          <Search size={17} />
          <input placeholder="Hledat projekt" onChange={(event) => filterProjects(event.currentTarget.value)} />
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-row ${project.id === selectedProject?.id ? "active" : ""}`}
              onClick={() => setSelectedId(project.id)}
            >
              <ProjectThumb project={project} />
              <span>
                <strong>{project.name}</strong>
                <small>
                  {project.points.length} bodů · {project.targets.length} cílů · {project.layers.length} vrstev
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <button
            className="ghost-button"
            onClick={async () => {
              await reloadProjects(store, setProjects, setSelectedId);
              setNotice("Synchronizováno");
            }}
          >
            <RefreshCcw size={17} /> Obnovit
          </button>
          <button
            className="ghost-button"
            onClick={async () => {
              await store.signOut();
              setSession(null);
            }}
          >
            <LogOut size={17} /> Odhlásit
          </button>
        </div>
      </aside>

      {selectedProject ? (
        <ProjectWorkspace
          project={selectedProject}
          notice={notice}
          saveProject={saveProject}
          deleteProject={deleteProject}
        />
      ) : (
        <main className="empty-workspace">
          <Folder size={42} />
          <h1>Založ první projekt</h1>
          <p>Pak do něj nahraješ DXF, CSV, GeoJSON nebo SHP ZIP a tablet si z něj vezme vrstvy i cíle vytyčení.</p>
        </main>
      )}
    </div>
  );

  function filterProjects(value: string) {
    const text = value.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLButtonElement>(".project-row");
    rows.forEach((row) => {
      row.hidden = text.length > 0 && !row.textContent?.toLowerCase().includes(text);
    });
  }
}

function AuthScreen({ store, onSignedIn }: { store: ProjectStore; onSignedIn: (session: UserSession) => void }) {
  const [email, setEmail] = useState("stavba@homola.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(mode: "in" | "up") {
    setError("");
    try {
      const session =
        mode === "in" ? await store.signIn(email, password || "local-demo") : await store.signUp(email, password || "local-demo");
      onSignedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přihlášení selhalo");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <img src={`${ASSET_BASE}homola-mark.png`} alt="Homola" />
          <span>Homola Field Cloud</span>
        </div>
        <h1>Projekty, vytyčení a naměřená data na jednom místě.</h1>
        <p>{store.setupMessage}</p>
        <label>
          E-mail
          <input value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
        </label>
        {store.isCloudConfigured && (
          <label>
            Heslo
            <input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
          </label>
        )}
        {error && <div className="error-box">{error}</div>}
        <div className="auth-actions">
          <button className="primary-button" onClick={() => submit("in")}>
            Přihlásit
          </button>
          <button className="secondary-button" onClick={() => submit("up")}>
            Založit účet
          </button>
        </div>
        <div className="trust-row">
          <ShieldCheck size={18} />
          <span>Každý uživatel vidí jen svoje projekty přes Row Level Security.</span>
        </div>
      </section>
    </main>
  );
}

function ProjectCreator({ onCreate }: { onCreate: (name: string, description: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim());
    setName("");
    setDescription("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="new-project-button" onClick={() => setOpen(true)}>
        <Plus size={18} /> Nový projekt
      </button>
    );
  }

  return (
    <form className="project-form" onSubmit={submit}>
      <input autoFocus placeholder="Název projektu" value={name} onChange={(event) => setName(event.currentTarget.value)} />
      <textarea placeholder="Poznámka / zakázka" value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
      <div>
        <button className="primary-button compact" type="submit">
          Založit
        </button>
        <button className="ghost-button compact" type="button" onClick={() => setOpen(false)}>
          Zrušit
        </button>
      </div>
    </form>
  );
}

function ProjectWorkspace({
  project,
  notice,
  saveProject,
  deleteProject
}: {
  project: SurveyProject;
  notice: string;
  saveProject: (project: SurveyProject, message?: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [importMode, setImportMode] = useState<"layer" | "targets" | "measured">("layer");
  const [role, setRole] = useState<LayerRole>("podklad");
  const [color, setColor] = useState("#e53935");
  const [uploadMessage, setUploadMessage] = useState("");

  async function handleImport(file: File | null) {
    if (!file) return;
    setWorking(true);
    setUploadMessage("");
    try {
      const result = await importFile(file, { mode: importMode, role, color });
      await saveProject(
        {
          ...project,
          layers: [...project.layers, result.layer],
          targets: [...project.targets, ...result.targets],
          points: [...project.points, ...result.points]
        },
        `Import hotový: ${result.summary}`
      );
      setUploadMessage(`Import hotový: ${result.summary}`);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Import selhal");
    } finally {
      setWorking(false);
    }
  }

  async function updateLayer(layer: ProjectLayer) {
    await saveProject({
      ...project,
      layers: project.layers.map((item) => (item.id === layer.id ? layer : item))
    });
  }

  async function removeLayer(layerId: string) {
    await saveProject({
      ...project,
      layers: project.layers.filter((layer) => layer.id !== layerId),
      targets: project.targets.filter((target) => target.sourceLayerId !== layerId)
    }, "Vrstva odstraněna");
  }

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Projekt</div>
          <h1>{project.name}</h1>
          <p>{project.description || "Bez popisu"} · EPSG:5514 ČÚZK Grid</p>
        </div>
        <div className="header-actions">
          {notice && <span className="notice-pill">{notice}</span>}
          <button
            className="danger-button"
            onClick={() => {
              if (window.confirm(`Smazat projekt ${project.name}?`)) deleteProject(project.id);
            }}
          >
            <Trash2 size={17} /> Smazat
          </button>
        </div>
      </header>

      <section className="stats-row">
        <StatCard icon={<MapPinned />} label="Naměřené body" value={project.points.length} />
        <StatCard icon={<Crosshair />} label="Cíle vytyčení" value={project.targets.length} />
        <StatCard icon={<Layers />} label="Vrstvy" value={project.layers.length} />
        <StatCard icon={<LineChart />} label="Prvky vrstev" value={project.layers.reduce((sum, layer) => sum + layer.features.length, 0)} />
      </section>

      <section className="workspace-grid">
        <div className="map-card">
          <ProjectMap project={project} />
        </div>

        <aside className="tool-panel">
          <section className="panel-card">
            <div className="panel-title">
              <FileUp size={20} />
              <div>
                <strong>Import do projektu</strong>
                <span>CSV, DXF, GeoJSON, SHP ZIP</span>
              </div>
            </div>
            <div className="segmented">
              <button className={importMode === "layer" ? "selected" : ""} onClick={() => setImportMode("layer")}>Vrstva</button>
              <button className={importMode === "targets" ? "selected" : ""} onClick={() => setImportMode("targets")}>Vytyčení</button>
              <button className={importMode === "measured" ? "selected" : ""} onClick={() => setImportMode("measured")}>Měření</button>
            </div>
            <label>
              Typ vrstvy
              <select value={role} onChange={(event) => setRole(event.currentTarget.value as LayerRole)}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Barva
              <input type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} />
            </label>
            <label className="file-drop">
              <Cloud size={22} />
              <span>{working ? "Importuji..." : "Vyber soubor"}</span>
              <input type="file" accept=".csv,.dxf,.geojson,.json,.zip,.shp" disabled={working} onChange={(event) => handleImport(event.currentTarget.files?.[0] ?? null)} />
            </label>
            {uploadMessage && <div className="info-box">{uploadMessage}</div>}
          </section>

          <section className="panel-card">
            <div className="panel-title">
              <Layers size={20} />
              <div>
                <strong>Vrstvy v projektu</strong>
                <span>Ovládání viditelnosti a rolí</span>
              </div>
            </div>
            <div className="layer-list">
              {project.layers.map((layer) => (
                <LayerRow key={layer.id} layer={layer} onChange={updateLayer} onRemove={removeLayer} />
              ))}
              {project.layers.length === 0 && <p className="muted">Zatím nejsou nahrané žádné vrstvy.</p>}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-title">
              <ArrowDownToLine size={20} />
              <div>
                <strong>Stažení dat</strong>
                <span>Projekt připravený pro kancelář</span>
              </div>
            </div>
            <div className="export-grid">
              <button onClick={() => downloadBlob(slug(project.name) + ".json", projectJson(project), "application/json")}>Projekt JSON</button>
              <button onClick={() => downloadBlob(slug(project.name) + ".geojson", projectGeoJson(project), "application/geo+json")}>GeoJSON</button>
              <button onClick={() => downloadBlob(slug(project.name) + ".csv", projectCsv(project), "text/csv")}>CSV</button>
              <button onClick={() => downloadBlob(slug(project.name) + ".dxf", projectDxf(project), "application/dxf")}>DXF</button>
            </div>
          </section>
        </aside>
      </section>

      <section className="data-grid">
        <DataTable
          title="Cíle vytyčení"
          rows={project.targets.map((target) => ({
            id: target.id,
            name: target.name,
            code: target.code,
            detail: target.note || "připraveno z webu",
            point: target.position
          }))}
        />
        <DataTable
          title="Naměřené body"
          rows={project.points.map((point) => ({
            id: point.id,
            name: point.name,
            code: point.code,
            detail: `${point.accuracyCm.toFixed(1)} cm · ${point.samples}x`,
            point: point.position
          }))}
        />
      </section>
    </main>
  );
}

function ProjectMap({ project }: { project: SurveyProject }) {
  const points = allProjectPoints(project);
  const center: [number, number] = points.length
    ? [points.reduce((sum, point) => sum + point.latitude, 0) / points.length, points.reduce((sum, point) => sum + point.longitude, 0) / points.length]
    : [49.195, 16.6068];

  return (
    <MapContainer center={center} zoom={points.length ? 18 : 7} className="project-map" scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapFit points={points} />
      {project.layers.filter((layer) => layer.visible).map((layer) =>
        layer.features.map((feature) => <FeatureShape key={feature.id} feature={feature} color={layer.color} layerName={layer.name} />)
      )}
      {project.targets.map((target) => (
        <Marker key={target.id} position={[target.position.latitude, target.position.longitude]} icon={pointIcon}>
          <Popup>
            <strong>{target.name}</strong>
            <br />
            {target.code} · cíl vytyčení
          </Popup>
        </Marker>
      ))}
      {project.points.map((point) => (
        <CircleMarker key={point.id} center={[point.position.latitude, point.position.longitude]} radius={7} color="#147efb" fillColor="#147efb" fillOpacity={0.9}>
          <Popup>
            <strong>{point.name}</strong>
            <br />
            {point.code} · {point.accuracyCm.toFixed(1)} cm
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function MapFit({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds.pad(0.25), { animate: false });
  }, [map, points]);
  return null;
}

function FeatureShape({ feature, color, layerName }: { feature: LayerFeature; color: string; layerName: string }) {
  const positions = feature.points.map((point) => [point.latitude, point.longitude] as [number, number]);
  if (feature.geometry === "Point") {
    return (
      <>
        {feature.points.map((point, index) => (
          <CircleMarker key={`${feature.id}-${index}`} center={[point.latitude, point.longitude]} radius={6} color={color} fillColor={color} fillOpacity={0.9}>
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

function LayerRow({
  layer,
  onChange,
  onRemove
}: {
  layer: ProjectLayer;
  onChange: (layer: ProjectLayer) => void;
  onRemove: (layerId: string) => void;
}) {
  return (
    <div className="layer-row">
      <input type="checkbox" checked={layer.visible} onChange={(event) => onChange({ ...layer, visible: event.currentTarget.checked })} />
      <input type="color" value={layer.color} onChange={(event) => onChange({ ...layer, color: event.currentTarget.value })} />
      <div className="layer-main">
        <strong>{layer.name}</strong>
        <span>{ROLE_LABELS[layer.role]} · {layer.features.length} prvků</span>
      </div>
      <select value={layer.role} onChange={(event) => onChange({ ...layer, role: event.currentTarget.value as LayerRole })}>
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <button className="icon-button" onClick={() => onRemove(layer.id)}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function DataTable({
  title,
  rows
}: {
  title: string;
  rows: Array<{ id: string; name: string; code: string; detail: string; point: GeoPoint }>;
}) {
  return (
    <section className="panel-card">
      <div className="panel-title">
        <Crosshair size={20} />
        <div>
          <strong>{title}</strong>
          <span>{rows.length} položek</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Název</th>
              <th>Kód</th>
              <th>Detail</th>
              <th>Lat/Lon</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.code}</td>
                <td>{row.detail}</td>
                <td>{row.point.latitude.toFixed(7)}, {row.point.longitude.toFixed(7)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">Zatím žádná data.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: JSX.Element; label: string; value: number }) {
  return (
    <div className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectThumb({ project }: { project: SurveyProject }) {
  return (
    <span className="project-thumb">
      <span style={{ transform: `rotate(${project.layers.length * 11}deg)` }} />
    </span>
  );
}

function ShellSplash({ text }: { text: string }) {
  return (
    <main className="splash">
      <img src={`${ASSET_BASE}homola-mark.png`} alt="Homola" />
      <p>{text}</p>
    </main>
  );
}

async function reloadProjects(
  store: ProjectStore,
  setProjects: (projects: SurveyProject[]) => void,
  setSelectedId: (id: string) => void
) {
  const projects = await store.listProjects();
  setProjects(projects);
  setSelectedId(projects[0]?.id ?? "");
}

function allProjectPoints(project: SurveyProject): GeoPoint[] {
  return [
    ...project.points.map((point) => point.position),
    ...project.targets.map((target) => target.position),
    ...project.layers.flatMap((layer) => (layer.visible ? layer.features.flatMap((feature) => feature.points) : []))
  ].filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "projekt";
}
