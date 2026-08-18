import { FormEvent, useEffect, useState } from "react";
import { Crosshair, FileUp, Trash2 } from "lucide-react";
import type { ProjectStore } from "../storage";
import type { GeoPoint, LayerRole, ProjectLayer, StakeoutTarget, SurveyProject } from "../types";
import { nextNameForCode, pointPhotos } from "../types";
import { importFile } from "../importers";
import { projectWgsToSjtskGrid, unprojectSjtskGrid } from "../geo/projection";
import { PhotoThumb, QualityBadge, formatDateTime } from "./common";

const ROLE_LABELS: Record<LayerRole, string> = {
  podklad: "Podklad",
  vytyceni: "Vytyčení",
  mereni: "Měření",
  hranice: "Hranice",
  site: "Sítě"
};

type Tab = "body" | "cile" | "vrstvy";

export function DataPanel({
  project,
  store,
  saveProject,
  selectedPointId,
  selectedTargetId,
  onSelectPoint,
  onSelectTarget,
  pickActive,
  onTogglePick,
  pickedPoint,
  onNotice
}: {
  project: SurveyProject;
  store: ProjectStore;
  saveProject: (project: SurveyProject, message?: string) => Promise<void>;
  selectedPointId: string | null;
  selectedTargetId: string | null;
  onSelectPoint: (id: string | null) => void;
  onSelectTarget: (id: string | null) => void;
  pickActive: boolean;
  onTogglePick: () => void;
  pickedPoint: GeoPoint | null;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("body");

  return (
    <section className="data-panel">
      <div className="panel-tabs">
        <button className={tab === "body" ? "on" : ""} onClick={() => setTab("body")}>
          Body <span>{project.points.length + project.targets.length}</span>
        </button>
        <button className={tab === "cile" ? "on" : ""} onClick={() => setTab("cile")}>
          Plánování <span>{project.targets.length}</span>
        </button>
        <button className={tab === "vrstvy" ? "on" : ""} onClick={() => setTab("vrstvy")}>
          Vrstvy <span>{project.layers.length}</span>
        </button>
      </div>

      {tab === "body" && (
        <PointsTab
          project={project}
          store={store}
          selectedPointId={selectedPointId}
          selectedTargetId={selectedTargetId}
          onSelectPoint={onSelectPoint}
          onSelectTarget={onSelectTarget}
        />
      )}
      {tab === "cile" && (
        <TargetsTab
          project={project}
          saveProject={saveProject}
          selectedTargetId={selectedTargetId}
          onSelectTarget={onSelectTarget}
          pickActive={pickActive}
          onTogglePick={onTogglePick}
          pickedPoint={pickedPoint}
        />
      )}
      {tab === "vrstvy" && <LayersTab project={project} saveProject={saveProject} onNotice={onNotice} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

function PointsTab({
  project,
  store,
  selectedPointId,
  selectedTargetId,
  onSelectPoint,
  onSelectTarget
}: {
  project: SurveyProject;
  store: ProjectStore;
  selectedPointId: string | null;
  selectedTargetId: string | null;
  onSelectPoint: (id: string | null) => void;
  onSelectTarget: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const usedCodes = Array.from(new Set(project.points.map((point) => point.code))).sort();

  const rows = project.points
    .filter((point) => !codeFilter || point.code === codeFilter)
    .filter((point) => {
      const text = query.trim().toLowerCase();
      if (!text) return true;
      return `${point.name} ${point.code} ${point.note}`.toLowerCase().includes(text);
    })
    .sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <>
      <div className="panel-filter">
        <input placeholder="Hledat bod…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <select value={codeFilter} onChange={(event) => setCodeFilter(event.currentTarget.value)}>
          <option value="">Všechny kódy</option>
          {usedCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-rows">
        {rows.length > 0 && <div className="panel-section-title">Zaměřené body</div>}
        {rows.map((point) => (
          <button
            key={point.id}
            className={`point-row ${point.id === selectedPointId ? "on" : ""}`}
            onClick={() => onSelectPoint(point.id === selectedPointId ? null : point.id)}
          >
            <PhotoThumb refPath={pointPhotos(point)[0] ?? null} resolve={(ref) => store.resolvePhotoUrl(ref)} size={32} />
            <b>{point.name}</b>
            <small>
              {point.code} · {formatDateTime(point.recordedAt)}
            </small>
            <QualityBadge point={point} />
          </button>
        ))}
        {project.targets.length > 0 && (
          <>
            <div className="panel-section-title">Cíle vytyčení</div>
            {project.targets.map((target) => (
              <TargetRow
                key={target.id}
                target={target}
                selected={target.id === selectedTargetId}
                onSelect={() => onSelectTarget(target.id === selectedTargetId ? null : target.id)}
              />
            ))}
          </>
        )}
        {rows.length === 0 && project.targets.length === 0 && (
          <p className="muted">Žádné body — buď je pošle terén přes sync, nebo je naimportuj ve Vrstvách.</p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

interface TargetDraft {
  name: string;
  code: string;
  sjtskX: string;
  sjtskY: string;
  altitude: string;
  note: string;
}

function TargetsTab({
  project,
  saveProject,
  selectedTargetId,
  onSelectTarget,
  pickActive,
  onTogglePick,
  pickedPoint
}: {
  project: SurveyProject;
  saveProject: (project: SurveyProject, message?: string) => Promise<void>;
  selectedTargetId: string | null;
  onSelectTarget: (id: string | null) => void;
  pickActive: boolean;
  onTogglePick: () => void;
  pickedPoint: GeoPoint | null;
}) {
  const firstCode = project.codes[0]?.code ?? "BOD";
  const [draft, setDraft] = useState<TargetDraft>({
    name: "",
    code: firstCode,
    sjtskX: "",
    sjtskY: "",
    altitude: "",
    note: ""
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!pickedPoint) return;
    const projected = projectWgsToSjtskGrid(pickedPoint);
    setDraft((current) => ({
      ...current,
      sjtskX: projected.x.toFixed(3),
      sjtskY: projected.y.toFixed(3),
      altitude: (projected.z ?? 0).toFixed(3),
      note: current.note || "klik z mapy"
    }));
  }, [pickedPoint]);

  async function addTarget(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const sjtskX = Number(draft.sjtskX.replace(",", "."));
    const sjtskY = Number(draft.sjtskY.replace(",", "."));
    const altitude = Number(draft.altitude.replace(",", "."));
    if (!Number.isFinite(sjtskX) || !Number.isFinite(sjtskY)) {
      setMessage("Doplň platné souřadnice JTSK X a Y.");
      return;
    }
    const target: StakeoutTarget = {
      id: crypto.randomUUID(),
      name: draft.name.trim() || nextNameForCode(project, draft.code),
      code: draft.code,
      note: draft.note.trim(),
      position: unprojectSjtskGrid({ x: sjtskX, y: sjtskY, z: Number.isFinite(altitude) ? altitude : 0 })
    };
    await saveProject({ ...project, targets: [...project.targets, target] }, `Cíl ${target.name} přidán`);
    setDraft({ name: "", code: draft.code, sjtskX: "", sjtskY: "", altitude: "", note: "" });
  }

  async function removeTarget(target: StakeoutTarget) {
    await saveProject(
      { ...project, targets: project.targets.filter((item) => item.id !== target.id) },
      `Cíl ${target.name} odstraněn`
    );
  }

  return (
    <>
      <form className="target-form" onSubmit={addTarget}>
        <div className="form-pair">
          <label>
            Název
            <input
              placeholder={nextNameForCode(project, draft.code)}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
          </label>
          <label>
            Kód
            <select value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.currentTarget.value })}>
              {project.codes.map((code) => (
                <option key={code.id} value={code.code}>
                  {code.code}
                </option>
              ))}
              {project.codes.length === 0 && <option value="BOD">BOD</option>}
            </select>
          </label>
        </div>
        <div className="form-pair">
          <label>
            JTSK X
            <input inputMode="decimal" value={draft.sjtskX} onChange={(event) => setDraft({ ...draft, sjtskX: event.currentTarget.value })} />
          </label>
          <label>
            JTSK Y
            <input inputMode="decimal" value={draft.sjtskY} onChange={(event) => setDraft({ ...draft, sjtskY: event.currentTarget.value })} />
          </label>
        </div>
        <div className="form-pair">
          <label>
            Z
            <input inputMode="decimal" value={draft.altitude} onChange={(event) => setDraft({ ...draft, altitude: event.currentTarget.value })} />
          </label>
          <label>
            Poznámka
            <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.currentTarget.value })} />
          </label>
        </div>
        {message && <div className="error-box">{message}</div>}
        <div className="form-actions">
          <button className="primary-button compact" type="submit">
            Přidat cíl
          </button>
          <button type="button" className={pickActive ? "ghost-button compact active" : "ghost-button compact"} onClick={onTogglePick}>
            <Crosshair size={14} /> {pickActive ? "Klikni do mapy" : "Bod z mapy"}
          </button>
        </div>
      </form>

      <div className="panel-rows">
        {project.targets.map((target) => (
          <TargetRow
            key={target.id}
            target={target}
            selected={target.id === selectedTargetId}
            onSelect={() => onSelectTarget(target.id === selectedTargetId ? null : target.id)}
            onRemove={() => removeTarget(target)}
          />
        ))}
        {project.targets.length === 0 && <p className="muted">Zatím žádné cíle vytyčení.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function TargetRow({
  target,
  selected,
  onSelect,
  onRemove
}: {
  target: StakeoutTarget;
  selected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`target-row ${selected ? "on" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
    >
      <span className="target-dot" />
      <div className="target-main">
        <b>{target.name}</b>
        <small>
          {target.code}
          {target.note ? ` · ${target.note}` : ""}
        </small>
        <small className="target-coords">{formatTargetCoords(target)}</small>
      </div>
      {onRemove && (
        <button
          className="icon-button"
          title="Odstranit cíl"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function formatTargetCoords(target: StakeoutTarget): string {
  const projected = projectWgsToSjtskGrid(target.position);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return "bez souřadnic";
  return `Y ${Math.abs(projected.x).toFixed(2)} · X ${Math.abs(projected.y).toFixed(2)} · Z ${(projected.z ?? 0).toFixed(3)}`;
}

// ---------------------------------------------------------------------------

function LayersTab({
  project,
  saveProject,
  onNotice
}: {
  project: SurveyProject;
  saveProject: (project: SurveyProject, message?: string) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [importMode, setImportMode] = useState<"layer" | "targets" | "measured">("layer");
  const [role, setRole] = useState<LayerRole>("podklad");
  const [color, setColor] = useState("#e53935");
  const [working, setWorking] = useState(false);

  async function handleImport(file: File | null) {
    if (!file) return;
    setWorking(true);
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
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Import selhal");
    } finally {
      setWorking(false);
    }
  }

  async function updateLayer(layer: ProjectLayer) {
    await saveProject({ ...project, layers: project.layers.map((item) => (item.id === layer.id ? layer : item)) });
  }

  async function removeLayer(layer: ProjectLayer) {
    if (!window.confirm(`Odstranit vrstvu ${layer.name} včetně cílů z ní vytvořených?`)) return;
    await saveProject(
      {
        ...project,
        layers: project.layers.filter((item) => item.id !== layer.id),
        targets: project.targets.filter((target) => target.sourceLayerId !== layer.id)
      },
      "Vrstva odstraněna"
    );
  }

  return (
    <>
      <div className="import-box">
        <div className="import-title">
          <FileUp size={16} /> Import — CSV, DXF, GeoJSON, SHP ZIP
        </div>
        <div className="segmented">
          <button className={importMode === "layer" ? "selected" : ""} onClick={() => setImportMode("layer")}>
            Vrstva
          </button>
          <button className={importMode === "targets" ? "selected" : ""} onClick={() => setImportMode("targets")}>
            Vytyčení
          </button>
          <button className={importMode === "measured" ? "selected" : ""} onClick={() => setImportMode("measured")}>
            Měření
          </button>
        </div>
        <div className="import-options">
          <select value={role} onChange={(event) => setRole(event.currentTarget.value as LayerRole)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input type="color" value={color} onChange={(event) => setColor(event.currentTarget.value)} />
          <label className="file-button">
            {working ? "Importuji…" : "Vybrat soubor"}
            <input
              type="file"
              accept=".csv,.dxf,.geojson,.json,.zip,.shp"
              disabled={working}
              hidden
              onChange={(event) => handleImport(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <div className="panel-rows">
        {project.layers.map((layer) => (
          <div key={layer.id} className="layer-row">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(event) => updateLayer({ ...layer, visible: event.currentTarget.checked })}
            />
            <input type="color" value={layer.color} onChange={(event) => updateLayer({ ...layer, color: event.currentTarget.value })} />
            <div className="layer-main">
              <strong>{layer.name}</strong>
              <small>
                {ROLE_LABELS[layer.role]} · {layer.features.length} prvků
              </small>
            </div>
            <select value={layer.role} onChange={(event) => updateLayer({ ...layer, role: event.currentTarget.value as LayerRole })}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className="icon-button" title="Odstranit vrstvu" onClick={() => removeLayer(layer)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {project.layers.length === 0 && <p className="muted">Zatím nejsou nahrané žádné vrstvy.</p>}
      </div>
    </>
  );
}
