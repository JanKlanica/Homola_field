import { FormEvent, useState } from "react";
import { Plus, RefreshCcw, Search, ChevronDown } from "lucide-react";
import type { SurveyProject } from "../types";
import { timeAgo } from "./common";

/** Sekce, které nabídka přepíná v pravém panelu. */
export type Section = "mereni" | "planovani" | "podklady";

export function ProjectRail({
  projects,
  selectedId,
  open,
  section,
  onSection,
  onSelect,
  onCreate,
  onRefresh
}: {
  projects: SurveyProject[];
  selectedId: string;
  open: boolean;
  section: Section;
  onSection: (value: Section) => void;
  onSelect: (id: string) => void;
  onCreate: (name: string, description: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // seznam projektů je schovaný pod přepínačem, ať nabídka nezabírá místo
  const [switching, setSwitching] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const filtered = projects.filter((project) => {
    const text = query.trim().toLowerCase();
    if (!text) return true;
    return `${project.name} ${project.description}`.toLowerCase().includes(text);
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim());
    setName("");
    setDescription("");
    setCreating(false);
  }

  const current = projects.find((item) => item.id === selectedId);
  const sekce: { id: Section; label: string; count?: number }[] = [
    { id: "mereni", label: "Měření", count: current?.points.length },
    { id: "planovani", label: "Plánování", count: current?.targets.length },
    { id: "podklady", label: "Podklady", count: current?.layers.length }
  ];

  return (
    <aside className={`project-rail ${open ? "open" : ""}`}>
      {/* Přepínač projektu — dřív býval v hlavičce vedle značky. */}
      <button className="project-switch-button" onClick={() => setSwitching((value) => !value)}>
        <span>
          <strong>{current ? current.name : "Vyber projekt"}</strong>
          <small>
            {current ? `${current.points.length} bodů · EPSG:5514` : `${projects.length} projektů`}
          </small>
        </span>
        <ChevronDown size={16} className={switching ? "flip" : ""} />
      </button>

      {/* Nabídka sekcí — přepíná obsah pravého panelu. */}
      {!switching && current && (
        <nav className="rail-nav">
          <div className="rail-label">Projekt</div>
          {sekce.map((item) => (
            <button
              key={item.id}
              className={`rail-nav-item ${section === item.id ? "on" : ""}`}
              onClick={() => onSection(item.id)}
            >
              <span>{item.label}</span>
              {item.count !== undefined && <em>{item.count}</em>}
            </button>
          ))}
        </nav>
      )}

      {switching && (
      <>
      <div className="rail-label">Projekty</div>
      <div className="search-box">
        <Search size={15} />
        <input placeholder="Hledat projekt" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      </div>

      <div className="project-list">
        {filtered.map((project) => (
          <button
            key={project.id}
            className={`project-row ${project.id === selectedId ? "active" : ""}`}
            onClick={() => {
              onSelect(project.id);
              setSwitching(false);
            }}
          >
            <strong>{project.name}</strong>
            <small>
              {project.points.length} bodů · {timeAgo(project.updatedAt)}
            </small>
          </button>
        ))}
        {filtered.length === 0 && <p className="muted">Žádný projekt neodpovídá hledání.</p>}
      </div>
      </>
      )}

      {creating ? (
        <form className="project-form" onSubmit={submit}>
          <input autoFocus placeholder="Název projektu" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <input
            placeholder="Poznámka / zakázka"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <div className="form-actions">
            <button className="primary-button compact" type="submit">
              Založit
            </button>
            <button className="ghost-button compact" type="button" onClick={() => setCreating(false)}>
              Zrušit
            </button>
          </div>
        </form>
      ) : (
        <button className="new-project-button" onClick={() => setCreating(true)}>
          <Plus size={16} /> Nový projekt
        </button>
      )}

      <button className="ghost-button rail-refresh" onClick={onRefresh}>
        <RefreshCcw size={15} /> Obnovit
      </button>
    </aside>
  );
}
