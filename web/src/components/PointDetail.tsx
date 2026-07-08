import { useRef, useState } from "react";
import { Camera, Download, Trash2, X } from "lucide-react";
import type { ProjectStore } from "../storage";
import type { SurveyPoint, SurveyProject } from "../types";
import { pointPhotos } from "../types";
import { projectWgsToSjtskGrid } from "../geo/projection";
import { downloadBinary } from "../exporters";
import { PhotoThumb, QualityBadge } from "./common";

export function PointDetail({
  project,
  point,
  store,
  onClose,
  onSave,
  onDelete,
  onNotice
}: {
  project: SurveyProject;
  point: SurveyPoint;
  store: ProjectStore;
  onClose: () => void;
  onSave: (project: SurveyProject, message?: string) => Promise<void>;
  onDelete: (pointId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [name, setName] = useState(point.name);
  const [code, setCode] = useState(point.code);
  const [note, setNote] = useState(point.note);
  const [uploading, setUploading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const photos = pointPhotos(point);
  const projected = projectWgsToSjtskGrid(point.position);
  const dirty = name !== point.name || code !== point.code || note !== point.note;

  function patchPoint(patch: Partial<SurveyPoint>): SurveyProject {
    return {
      ...project,
      points: project.points.map((item) => (item.id === point.id ? { ...item, ...patch } : item))
    };
  }

  async function saveEdits() {
    await onSave(patchPoint({ name: name.trim() || point.name, code: code.trim() || point.code, note: note.trim() }), `Bod ${name} uložen`);
  }

  async function addPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const ref = await store.uploadPointPhoto(project, point.id, file);
      const nextPhotos = [...photos.filter((item) => item !== point.photoUrl), ref];
      // photoUrl přesuneme do photos[] — zpětně kompatibilní migrace při prvním zásahu
      const migrated = point.photoUrl ? [point.photoUrl, ...nextPhotos.filter((item) => item !== point.photoUrl)] : nextPhotos;
      await onSave(patchPoint({ photos: migrated, photoUrl: undefined }), "Fotka přidána");
      setPreviewIndex(migrated.length - 1);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Upload fotky selhal");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(ref: string) {
    if (!window.confirm("Odebrat fotku z bodu?")) return;
    const next = photos.filter((item) => item !== ref);
    await onSave(patchPoint({ photos: next, photoUrl: undefined }), "Fotka odebrána");
    setPreviewIndex(0);
  }

  async function downloadPhoto(ref: string, index: number) {
    const url = await store.resolvePhotoUrl(ref);
    if (!url) {
      onNotice("Fotku se nepodařilo načíst.");
      return;
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      downloadBinary(`${point.name.replace(/[^\w.-]+/g, "_")}_${index + 1}.jpg`, blob);
    } catch {
      window.open(url, "_blank");
    }
  }

  const activePhoto = photos[Math.min(previewIndex, Math.max(photos.length - 1, 0))] ?? null;

  return (
    <div className="point-detail">
      <button className="detail-close" onClick={onClose} aria-label="Zavřít">
        <X size={16} />
      </button>

      {activePhoto ? (
        <div className="detail-photo">
          <PhotoThumb refPath={activePhoto} resolve={(ref) => store.resolvePhotoUrl(ref)} size={244} />
          <div className="detail-photo-actions">
            <button onClick={() => downloadPhoto(activePhoto, previewIndex)} title="Stáhnout JPG">
              <Download size={15} />
            </button>
            <button onClick={() => removePhoto(activePhoto)} title="Odebrat fotku">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="detail-photo empty">Bod je zatím bez fotky</div>
      )}

      {photos.length > 1 && (
        <div className="detail-photo-strip">
          {photos.map((ref, index) => (
            <button key={ref} className={index === previewIndex ? "on" : ""} onClick={() => setPreviewIndex(index)}>
              <PhotoThumb refPath={ref} resolve={(refPath) => store.resolvePhotoUrl(refPath)} size={34} />
            </button>
          ))}
        </div>
      )}

      <div className="detail-body">
        <div className="detail-head">
          <input className="detail-name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <QualityBadge point={point} />
        </div>

        <p className="detail-coords">
          Y {Math.abs(projected.x).toFixed(2)} · X {Math.abs(projected.y).toFixed(2)}
          <br />Z {(projected.z ?? 0).toFixed(3)} Bpv · {new Date(point.recordedAt).toLocaleString("cs-CZ")} ·{" "}
          {point.samples}× průměr
        </p>

        <div className="detail-fields">
          <label>
            Kód
            <select value={code} onChange={(event) => setCode(event.currentTarget.value)}>
              {!project.codes.some((item) => item.code === code) && <option value={code}>{code}</option>}
              {project.codes.map((item) => (
                <option key={item.id} value={item.code}>
                  {item.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Poznámka
            <input value={note} onChange={(event) => setNote(event.currentTarget.value)} />
          </label>
        </div>

        <div className="detail-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => addPhoto(event.currentTarget.files?.[0] ?? null)}
          />
          <button className="ghost-button compact" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> {uploading ? "Nahrávám…" : "Přidat fotku"}
          </button>
          {dirty && (
            <button className="primary-button compact" onClick={saveEdits}>
              Uložit
            </button>
          )}
          <button
            className="danger-link"
            onClick={() => {
              if (window.confirm(`Smazat bod ${point.name}?`)) onDelete(point.id);
            }}
          >
            Smazat bod
          </button>
        </div>
      </div>
    </div>
  );
}
