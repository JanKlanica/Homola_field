import { LogOut, Menu } from "lucide-react";
import type { SurveyProject, UserSession } from "../types";
import { timeAgo } from "./common";
import { ExportMenu, type ExportMenuProps } from "./ExportMenu";

export function TopBar({
  session,
  projects,
  project,
  onSelectProject,
  onSignOut,
  onToggleRail,
  exportProps
}: {
  session: UserSession;
  projects: SurveyProject[];
  project: SurveyProject | null;
  onSelectProject: (id: string) => void;
  onSignOut: () => void;
  onToggleRail: () => void;
  exportProps: ExportMenuProps | null;
}) {
  const initials = session.email.slice(0, 2).toUpperCase();

  return (
    <header className="topbar">
      <button className="rail-toggle" onClick={onToggleRail} aria-label="Projekty">
        <Menu size={20} />
      </button>
      <div className="brand-row">
        <span className="brand-mark" />
        <strong>Homola Field</strong>
      </div>

      {project && (
        <div className="project-switch">
          <select value={project.id} onChange={(event) => onSelectProject(event.currentTarget.value)}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <small>
            {project.points.length} bodů · EPSG:5514
          </small>
        </div>
      )}

      {project && (
        <span className={`sync-pill ${session.cloud ? "cloud" : "local"}`}>
          {session.cloud ? `Sync ${timeAgo(project.updatedAt)}` : "Lokální režim"}
        </span>
      )}

      <div className="topbar-spacer" />

      {exportProps && <ExportMenu {...exportProps} />}

      <div className="user-chip" title={session.email}>
        {initials}
      </div>
      <button className="icon-button" onClick={onSignOut} title="Odhlásit">
        <LogOut size={18} />
      </button>
    </header>
  );
}
