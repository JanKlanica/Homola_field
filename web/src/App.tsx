import { useEffect, useState } from "react";
import { Folder, Trash2 } from "lucide-react";
import type { GeoPoint, MapProvider, SurveyProject, UserSession } from "./types";
import { emptyProject } from "./types";
import { loadCloudConfig } from "./cloudConfig";
import { createProjectStore, type ProjectStore } from "./storage";
import { AuthScreen } from "./components/AuthScreen";
import { TopBar } from "./components/TopBar";
import { ProjectRail } from "./components/ProjectRail";
import { MapPanel } from "./components/MapPanel";
import { PointDetail } from "./components/PointDetail";
import { DataPanel } from "./components/DataPanel";

export function App() {
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [pickActive, setPickActive] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<GeoPoint | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const project = projects.find((item) => item.id === selectedId) ?? projects[0] ?? null;
  const selectedPoint = project?.points.find((point) => point.id === selectedPointId) ?? null;

  function selectPoint(id: string | null) {
    setSelectedPointId(id);
    if (id) setSelectedTargetId(null);
  }

  function selectTarget(id: string | null) {
    setSelectedTargetId(id);
    if (id) setSelectedPointId(null);
  }

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
      if (current) await reload(nextStore);
    }
    bootstrap().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function reload(target: ProjectStore = store!) {
    const list = await target.listProjects();
    setProjects(list);
    setSelectedId((current) => (list.some((item) => item.id === current) ? current : list[0]?.id ?? ""));
  }

  async function handleSignedIn(next: UserSession) {
    setSession(next);
    if (store) await reload(store);
  }

  async function saveProject(next: SurveyProject, message = "Uloženo") {
    if (!store) return;
    const saved = await store.saveProject(next);
    setProjects((current) =>
      [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt - a.updatedAt)
    );
    setSelectedId(saved.id);
    setNotice(message);
  }

  async function deleteProject(projectId: string) {
    if (!store) return;
    await store.deleteProject(projectId);
    const next = projects.filter((item) => item.id !== projectId);
    setProjects(next);
    setSelectedId(next[0]?.id ?? "");
    setSelectedPointId(null);
    setSelectedTargetId(null);
    setNotice("Projekt smazán");
  }

  async function deletePoint(pointId: string) {
    if (!project) return;
    const point = project.points.find((item) => item.id === pointId);
    await saveProject(
      {
        ...project,
        points: project.points.filter((item) => item.id !== pointId),
        deletedPoints: point
          ? [point, ...(project.deletedPoints ?? []).filter((item) => item.id !== pointId)]
          : project.deletedPoints,
        layers: project.layers.map((layer) => ({
          ...layer,
          features: layer.features.filter(
            (feature) => feature.properties.record_id !== pointId && feature.properties.RECORD_ID !== pointId
          )
        }))
      },
      point ? `Bod ${point.name} smazán` : "Bod smazán"
    );
    setSelectedPointId(null);
    setSelectedTargetId(null);
  }

  if (loading || !store) {
    return (
      <main className="splash">
        <span className="brand-mark large" />
        <p>Startuji Homola Field Cloud…</p>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen store={store} onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="app-shell">
      <TopBar
        session={session}
        projects={projects}
        project={project}
        onSelectProject={(id) => {
          setSelectedId(id);
          setSelectedPointId(null);
          setSelectedTargetId(null);
          setRailOpen(false);
        }}
        onSignOut={async () => {
          await store.signOut();
          setSession(null);
          setProjects([]);
        }}
        onToggleRail={() => setRailOpen((value) => !value)}
        exportProps={project ? { project, store, onNotice: setNotice } : null}
      />

      <div className="app-body">
        <ProjectRail
          projects={projects}
          selectedId={project?.id ?? ""}
          open={railOpen}
          onSelect={(id) => {
            setSelectedId(id);
            setSelectedPointId(null);
            setSelectedTargetId(null);
            setRailOpen(false);
          }}
          onCreate={(name, description) => saveProject(emptyProject(name, description), "Projekt založen")}
          onRefresh={async () => {
            await reload();
            setNotice("Synchronizováno");
          }}
        />

        {project ? (
          <main className="workspace">
            <div className="map-column">
              <MapPanel
                project={project}
                selectedPointId={selectedPointId}
                selectedTargetId={selectedTargetId}
                pickActive={pickActive}
                onSelectPoint={selectPoint}
                onSelectTarget={selectTarget}
                onPick={(point) => {
                  setPickedPoint(point);
                  setPickActive(false);
                }}
                onProviderChange={(provider: MapProvider) => saveProject({ ...project, mapProvider: provider }, `Mapa: ${provider}`)}
              />
              {selectedPoint && (
                <PointDetail
                  key={selectedPoint.id}
                  project={project}
                  point={selectedPoint}
                  store={store}
                  onClose={() => setSelectedPointId(null)}
                  onSave={saveProject}
                  onDelete={deletePoint}
                  onNotice={setNotice}
                />
              )}
            </div>

            <DataPanel
              project={project}
              store={store}
              saveProject={saveProject}
              selectedPointId={selectedPointId}
              selectedTargetId={selectedTargetId}
              onSelectPoint={selectPoint}
              onSelectTarget={selectTarget}
              pickActive={pickActive}
              onTogglePick={() => setPickActive((value) => !value)}
              pickedPoint={pickedPoint}
              onNotice={setNotice}
            />
          </main>
        ) : (
          <main className="empty-workspace">
            <Folder size={40} />
            <h1>Založ první projekt</h1>
            <p>Pak do něj nahraješ DXF, CSV, GeoJSON nebo SHP ZIP a telefon si z něj vezme vrstvy i cíle vytyčení.</p>
          </main>
        )}
      </div>

      {project && (
        <button
          className="danger-link project-delete"
          onClick={() => {
            if (window.confirm(`Smazat projekt ${project.name}?`)) deleteProject(project.id);
          }}
        >
          <Trash2 size={14} /> Smazat projekt
        </button>
      )}

      {notice && <div className="toast">{notice}</div>}
      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} />}
    </div>
  );
}
