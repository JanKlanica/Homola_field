import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import type { ProjectStore } from "../storage";
import type { SurveyProject } from "../types";
import {
  downloadBlob,
  downloadBinary,
  projectCsv,
  projectDxf,
  projectGeoJson,
  projectJson,
  projectPhotosZip,
  projectShpZip,
  slug
} from "../exporters";
import { openPhotoProtocol } from "../protocol";

export interface ExportMenuProps {
  project: SurveyProject;
  store: ProjectStore;
  onNotice: (message: string) => void;
}

export function ExportMenu({ project, store, onNotice }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [protocolCode, setProtocolCode] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const usedCodes = Array.from(new Set(project.points.map((point) => point.code))).sort();
  const base = slug(project.name);

  async function run(label: string, action: () => Promise<void> | void) {
    setBusy(label);
    try {
      await action();
      onNotice(`${label} hotový`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : `${label} selhal`);
    } finally {
      setBusy("");
      setOpen(false);
    }
  }

  return (
    <div className="export-wrap" ref={wrapRef}>
      <button className="export-button" onClick={() => setOpen((value) => !value)}>
        <ArrowDownToLine size={17} /> Export
      </button>
      {open && (
        <div className="export-menu">
          <div className="export-menu-label">Data</div>
          <button disabled={!!busy} onClick={() => run("DXF", () => downloadBlob(`${base}.dxf`, projectDxf(project), "application/dxf"))}>
            DXF <small>S-JTSK</small>
          </button>
          <button
            disabled={!!busy}
            onClick={() => run("SHP ZIP", async () => downloadBinary(`${base}-shp.zip`, await projectShpZip(project)))}
          >
            SHP ZIP <small>PointZ + DBF</small>
          </button>
          <button disabled={!!busy} onClick={() => run("CSV", () => downloadBlob(`${base}.csv`, "\ufeff" + projectCsv(project), "text/csv"))}>
            CSV <small>středníky</small>
          </button>
          <button
            disabled={!!busy}
            onClick={() => run("GeoJSON", () => downloadBlob(`${base}.geojson`, projectGeoJson(project), "application/geo+json"))}
          >
            GeoJSON <small>WGS84</small>
          </button>
          <button
            disabled={!!busy}
            onClick={() => run("Projekt JSON", () => downloadBlob(`${base}.json`, projectJson(project), "application/json"))}
          >
            Projekt JSON <small>záloha</small>
          </button>

          <div className="export-menu-label">Fotodokumentace</div>
          <button
            disabled={!!busy}
            onClick={() =>
              run("Fotky ZIP", async () =>
                downloadBinary(`${base}-fotky.zip`, await projectPhotosZip(project, (ref) => store.resolvePhotoUrl(ref)))
              )
            }
          >
            Fotky ZIP <small>JPG + fotoindex</small>
          </button>
          <div className="protocol-row">
            <select value={protocolCode} onChange={(event) => setProtocolCode(event.currentTarget.value)}>
              <option value="">Všechny kódy</option>
              {usedCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <button
              className="protocol-button"
              disabled={!!busy}
              onClick={() => run("Fotoprotokol", () => openPhotoProtocol(project, protocolCode, (ref) => store.resolvePhotoUrl(ref)))}
            >
              Fotoprotokol PDF
            </button>
          </div>
          {busy && <div className="export-busy">Připravuji {busy}…</div>}
        </div>
      )}
    </div>
  );
}
