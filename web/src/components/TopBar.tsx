import { LogOut, Menu } from "lucide-react";
import type { SurveyProject, UserSession } from "../types";
import { timeAgo } from "./common";
import { ExportMenu, type ExportMenuProps } from "./ExportMenu";

export function TopBar({
  session,
  project,
  onSignOut,
  onToggleRail,
  exportProps
}: {
  session: UserSession;
  project: SurveyProject | null;
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
        <strong>PipeTrack Field</strong>
      </div>

      {/* Přepínač projektu se přesunul do nabídky vlevo, pod značku —
          v hlavičce zbylo místo pro stav a export. */}

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
