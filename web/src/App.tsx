import { FormEvent, useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
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
  Ruler,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";
import type { GeoPoint, LayerFeature, LayerRole, MapProvider, ProjectLayer, StakeoutTarget, SurveyProject, UserSession } from "./types";
import { emptyProject } from "./types";
import { loadCloudConfig } from "./cloudConfig";
import { createProjectStore, type ProjectStore } from "./storage";
import { importFile } from "./importers";
import { downloadBlob, projectCsv, projectDxf, projectGeoJson, projectJson } from "./exporters";
import { projectWgsToSjtskGrid, unprojectSjtskGrid } from "./geo/projection";

const ROLE_LABELS: Record<LayerRole, string> = {
  podklad: "Podklad",
  vytyceni: "Vytyčení",
  mereni: "Měření",
  hranice: "Hranice",
  site: "Sítě"
};

const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  Light: "OSM",
  Ortho: "Ortofoto",
  Cadastre: "Katastr"
};

const MAP_PROVIDERS: MapProvider[] = ["Light", "Ortho", "Cadastre"];

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
    const saved = await store.saveProject(normalizeProjectJtsk(project));
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

interface TargetDraft {
  name: string;
  code: string;
  sjtskX: string;
  sjtskY: string;
  altitude: string;
  note: string;
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
  const [pickTargetFromMap, setPickTargetFromMap] = useState(false);
  const [targetDraft, setTargetDraft] = useState<TargetDraft>(() => initialTargetDraft(project));

  useEffect(() => {
    setTargetDraft(initialTargetDraft(project));
    setPickTargetFromMap(false);
  }, [project.id]);

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

  async function removeTarget(targetId: string) {
    const target = project.targets.find((item) => item.id === targetId);
    await saveProject(
      {
        ...project,
        targets: project.targets.filter((item) => item.id !== targetId)
      },
      target ? `Cil ${target.name} odstranen` : "Cil odstranen"
    );
  }

  async function removeMeasuredPoint(pointId: string) {
    const point = project.points.find((item) => item.id === pointId);
    await saveProject(
      {
        ...project,
        points: project.points.filter((item) => item.id !== pointId),
        layers: project.layers.map((layer) => ({
          ...layer,
          features: layer.features.filter((feature) => feature.properties.record_id !== pointId && feature.properties.RECORD_ID !== pointId)
        }))
      },
      point ? `Bod ${point.name} odstranen` : "Bod odstranen"
    );
  }

  async function removeLayerFeature(layerId: string, featureId: string) {
    const layer = project.layers.find((item) => item.id === layerId);
    await saveProject(
      {
        ...project,
        layers: project.layers.map((item) =>
          item.id === layerId
            ? { ...item, features: item.features.filter((feature) => feature.id !== featureId) }
            : item
        )
      },
      layer ? `Prvek ve vrstve ${layer.name} odstranen` : "Prvek vrstvy odstranen"
    );
  }

  async function setMapProvider(provider: MapProvider) {
    await saveProject({ ...project, mapProvider: provider }, `Mapa: ${MAP_PROVIDER_LABELS[provider]}`);
  }

  function handleMapPick(point: GeoPoint) {
    const projected = projectWgsToSjtskGrid(point);
    setTargetDraft((current) => ({
      ...current,
      sjtskX: fixed(projected.x),
      sjtskY: fixed(projected.y),
      altitude: fixed(projected.z ?? 0),
      note: current.note || "klik z mapy"
    }));
  }

  async function addStakeoutTarget(event?: FormEvent) {
    event?.preventDefault();
    const sjtskX = Number(targetDraft.sjtskX.replace(",", "."));
    const sjtskY = Number(targetDraft.sjtskY.replace(",", "."));
    const altitude = Number(targetDraft.altitude.replace(",", "."));
    if (!Number.isFinite(sjtskX) || !Number.isFinite(sjtskY)) {
      setUploadMessage("Doplň platnou šířku a délku bodu.");
      return;
    }
    const position = unprojectSjtskGrid({
      x: sjtskX,
      y: sjtskY,
      z: Number.isFinite(altitude) ? altitude : 0
    });
    const target: StakeoutTarget = {
      id: crypto.randomUUID(),
      name: targetDraft.name.trim() || nextTargetName(project),
      code: targetDraft.code.trim() || "BOD",
      note: targetDraft.note.trim(),
      position
    };
    const nextProject = {
      ...project,
      targets: [...project.targets, target]
    };
    await saveProject(nextProject, `Cíl ${target.name} přidán`);
    setTargetDraft(initialTargetDraft(nextProject));
    setPickTargetFromMap(false);
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
          <div className="map-toolbar">
            <div>
              <strong>Mapa projektu</strong>
              <span>{project.layers.filter((layer) => layer.visible).length} aktivních vrstev · {allProjectPoints(project).length} bodů v náhledu</span>
            </div>
            <div className="map-toolbar-actions">
              <div className="map-provider-switch">
                {MAP_PROVIDERS.map((provider) => (
                  <button
                    key={provider}
                    className={(project.mapProvider ?? "Light") === provider ? "selected" : ""}
                    onClick={() => setMapProvider(provider)}
                  >
                    {MAP_PROVIDER_LABELS[provider]}
                  </button>
                ))}
              </div>
              <button className={pickTargetFromMap ? "map-action active" : "map-action"} onClick={() => setPickTargetFromMap((value) => !value)}>
                <Crosshair size={16} /> {pickTargetFromMap ? "Klikni do mapy" : "Bod z mapy"}
              </button>
            </div>
          </div>
          <ProjectMap project={project} pickTargetFromMap={pickTargetFromMap} draftPoint={draftPoint(targetDraft)} onPickPoint={handleMapPick} />
        </div>

        <aside className="tool-panel">
          <section className="panel-card measure-card">
            <div className="panel-title">
              <Ruler size={20} />
              <div>
                <strong>Přidat cíl vytyčení</strong>
                <span>Ručně nebo klikem do mapy</span>
              </div>
            </div>
            <form className="target-form" onSubmit={addStakeoutTarget}>
              <div className="form-pair">
                <label>
                  Název
                  <input value={targetDraft.name} onChange={(event) => setTargetDraft({ ...targetDraft, name: event.currentTarget.value })} />
                </label>
                <label>
                  Kód
                  <select value={targetDraft.code} onChange={(event) => setTargetDraft({ ...targetDraft, code: event.currentTarget.value })}>
                    {project.codes.map((code) => (
                      <option key={code.id} value={code.code}>{code.code}</option>
                    ))}
                    {project.codes.length === 0 && <option value="BOD">BOD</option>}
                  </select>
                </label>
              </div>
              <div className="form-pair">
                <label>
                  JTSK X
                  <input inputMode="decimal" value={targetDraft.sjtskX} onChange={(event) => setTargetDraft({ ...targetDraft, sjtskX: event.currentTarget.value })} />
                </label>
                <label>
                  JTSK Y
                  <input inputMode="decimal" value={targetDraft.sjtskY} onChange={(event) => setTargetDraft({ ...targetDraft, sjtskY: event.currentTarget.value })} />
                </label>
              </div>
              <div className="form-pair narrow">
                <label>
                  Z
                  <input inputMode="decimal" value={targetDraft.altitude} onChange={(event) => setTargetDraft({ ...targetDraft, altitude: event.currentTarget.value })} />
                </label>
                <label>
                  Poznámka
                  <input value={targetDraft.note} onChange={(event) => setTargetDraft({ ...targetDraft, note: event.currentTarget.value })} />
                </label>
              </div>
              <button className="primary-button compact" type="submit">
                <Plus size={16} /> Přidat do vytyčení
              </button>
            </form>
          </section>

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
          onDelete={removeTarget}
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
          onDelete={removeMeasuredPoint}
        />
        <LayerDataTable project={project} onRemoveFeature={removeLayerFeature} />
      </section>
    </main>
  );
}

function ProjectMap({
  project,
  pickTargetFromMap,
  draftPoint,
  onPickPoint
}: {
  project: SurveyProject;
  pickTargetFromMap: boolean;
  draftPoint: GeoPoint | null;
  onPickPoint: (point: GeoPoint) => void;
}) {
  const points = allProjectPoints(project);
  const center: [number, number] = points.length
    ? [points.reduce((sum, point) => sum + point.latitude, 0) / points.length, points.reduce((sum, point) => sum + point.longitude, 0) / points.length]
    : [49.195, 16.6068];

  return (
    <MapContainer center={center} zoom={points.length ? 18 : 7} className={pickTargetFromMap ? "project-map picking" : "project-map"} scrollWheelZoom>
      <BaseMap provider={project.mapProvider ?? "Light"} />
      <MapFit points={points} />
      <MapClickCapture enabled={pickTargetFromMap} onPick={onPickPoint} />
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
      {draftPoint && (
        <CircleMarker center={[draftPoint.latitude, draftPoint.longitude]} radius={10} color="#20b45b" fillColor="#20b45b" fillOpacity={0.25} weight={4}>
          <Popup>Nový cíl vytyčení</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

function MapClickCapture({ enabled, onPick }: { enabled: boolean; onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onPick({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        altitude: 0
      });
    }
  });
  return null;
}

function BaseMap({ provider }: { provider: MapProvider }) {
  if (provider === "Ortho") {
    return (
      <>
        <TileLayer attribution="&copy; CUZK" url="https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}" />
        <TileLayer className="cadastre-overlay" attribution="&copy; CUZK" url="https://services.cuzk.cz/wmts/local-km-wmts-google/rest/WMTS/Yellow/KN/{z}/{y}/{x}" opacity={0.72} />
      </>
    );
  }
  return (
    <>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {provider === "Cadastre" && (
        <TileLayer className="cadastre-overlay" attribution="&copy; CUZK" url="https://services.cuzk.cz/wmts/local-km-wmts-google/rest/WMTS/default/KN/{z}/{y}/{x}" opacity={0.92} />
      )}
    </>
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
  rows,
  onDelete
}: {
  title: string;
  rows: Array<{ id: string; name: string; code: string; detail: string; point: GeoPoint }>;
  onDelete?: (id: string) => void;
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
              <th>JTSK X/Y/Z</th>
              {onDelete && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.code}</td>
                <td>{row.detail}</td>
                <td>{formatJtsk(row.point)}</td>
                {onDelete && (
                  <td className="action-cell">
                    <button className="icon-button" onClick={() => onDelete(row.id)} title="Smazat">
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
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

function LayerDataTable({
  project,
  onRemoveFeature
}: {
  project: SurveyProject;
  onRemoveFeature: (layerId: string, featureId: string) => void;
}) {
  const rows = project.layers.flatMap((layer) =>
    layer.features.map((feature, index) => ({
      layer,
      feature,
      index,
      point: feature.points[0]
    }))
  );
  return (
    <section className="panel-card layer-table-card">
      <div className="panel-title">
        <Layers size={20} />
        <div>
          <strong>Vrstvy projektu</strong>
          <span>{project.layers.length} vrstev · {project.layers.reduce((sum, layer) => sum + layer.features.length, 0)} prvků</span>
        </div>
      </div>
      <div className="layer-summary-list">
        {project.layers.map((layer) => (
          <div key={layer.id} className="layer-summary-row">
            <span className="layer-dot" style={{ backgroundColor: layer.color }} />
            <div>
              <strong>{layer.name}</strong>
              <span>{ROLE_LABELS[layer.role]} · {layer.sourceType} · {layer.features.length} prvků · {countLayerPoints(layer)} bodů</span>
            </div>
            <em>{layer.visible ? "viditelná" : "skrytá"}</em>
          </div>
        ))}
        {project.layers.length === 0 && <p className="muted">Zatím žádné vrstvy v projektu.</p>}
      </div>
      {rows.length > 0 && (
        <div className="layer-feature-list">
          {rows.map(({ layer, feature, index, point }) => (
            <div key={`${layer.id}-${feature.id}`} className="layer-feature-row">
              <span className="layer-dot" style={{ backgroundColor: layer.color }} />
              <div>
                <strong>{feature.properties.name || `${layer.name}-${index + 1}`}</strong>
                <span>{layer.name} - {feature.geometry} - {feature.points.length} bodu - {point ? formatJtsk(point) : "bez souradnic"}</span>
              </div>
              <button className="icon-button" onClick={() => onRemoveFeature(layer.id, feature.id)} title="Smazat prvek">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
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

function normalizeProjectJtsk(project: SurveyProject): SurveyProject {
  return {
    ...project,
    coordinateSystem: "EPSG:5514",
    points: project.points.map((point) => ({ ...point, position: withJtsk(point.position) })),
    targets: project.targets.map((target) => ({ ...target, position: withJtsk(target.position) })),
    layers: project.layers.map((layer) => ({
      ...layer,
      features: layer.features.map((feature) => ({
        ...feature,
        points: feature.points.map(withJtsk)
      }))
    }))
  };
}

function withJtsk(point: GeoPoint): GeoPoint {
  if (Number.isFinite(point.sjtskX) && Number.isFinite(point.sjtskY)) return point;
  const projected = projectWgsToSjtskGrid(point);
  return { ...point, sjtskX: projected.x, sjtskY: projected.y };
}

function initialTargetDraft(project: SurveyProject): TargetDraft {
  return {
    name: nextTargetName(project),
    code: project.codes[0]?.code || "BOD",
    sjtskX: "",
    sjtskY: "",
    altitude: "0.000",
    note: "připraveno na webu"
  };
}

function nextTargetName(project: SurveyProject): string {
  return `V${String(project.targets.length + 1).padStart(3, "0")}`;
}

function draftPoint(draft: TargetDraft): GeoPoint | null {
  const sjtskX = Number(draft.sjtskX.replace(",", "."));
  const sjtskY = Number(draft.sjtskY.replace(",", "."));
  const altitude = Number(draft.altitude.replace(",", "."));
  if (!Number.isFinite(sjtskX) || !Number.isFinite(sjtskY)) return null;
  return unprojectSjtskGrid({
    x: sjtskX,
    y: sjtskY,
    z: Number.isFinite(altitude) ? altitude : 0
  });
}

function countLayerPoints(layer: ProjectLayer): number {
  return layer.features.reduce((sum, feature) => sum + feature.points.length, 0);
}

function fixed(value: number): string {
  return value.toFixed(3);
}

function formatJtsk(point: GeoPoint): string {
  const projected = projectWgsToSjtskGrid(point);
  return `${fixed(projected.x)} / ${fixed(projected.y)} / ${fixed(projected.z ?? 0)}`;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "projekt";
}
