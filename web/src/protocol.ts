import type { SurveyProject, SurveyPoint } from "./types";
import { pointPhotos } from "./types";
import { projectWgsToSjtskGrid } from "./geo/projection";

/**
 * Fotoprotokol: otevře tiskové okno s hlavičkou HOMOLA, tabulkou bodů a snímky.
 * Tisk do PDF řeší prohlížeč — bez problémů s českou diakritikou ve fontech.
 */
export async function openPhotoProtocol(
  project: SurveyProject,
  codeFilter: string,
  resolvePhotoUrl: (ref: string) => Promise<string | null>
): Promise<void> {
  const points = project.points
    .filter((point) => !codeFilter || point.code === codeFilter)
    .sort((a, b) => a.name.localeCompare(b.name, "cs", { numeric: true }));
  if (points.length === 0) throw new Error("Pro zvolený filtr nejsou žádné body.");

  const blocks: string[] = [];
  for (const point of points) {
    blocks.push(await pointBlock(point, resolvePhotoUrl));
  }

  const win = window.open("", "_blank");
  if (!win) throw new Error("Prohlížeč zablokoval nové okno — povol vyskakovací okna.");
  win.document.write(protocolHtml(project, codeFilter, points.length, blocks.join("")));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

async function pointBlock(point: SurveyPoint, resolve: (ref: string) => Promise<string | null>): Promise<string> {
  const projected = projectWgsToSjtskGrid(point.position);
  const photos = pointPhotos(point);
  const urls: string[] = [];
  for (const ref of photos) {
    const url = await resolve(ref);
    if (url) urls.push(url);
  }
  const imgs = urls.map((url) => `<img src="${url}" alt="${escapeHtml(point.name)}" />`).join("");
  return `
  <section class="point">
    <table class="meta">
      <tr>
        <td class="name">${escapeHtml(point.name)}</td>
        <td>Kód<br /><b>${escapeHtml(point.code)}</b></td>
        <td>Y (S-JTSK)<br /><b>${Math.abs(projected.x).toFixed(2)}</b></td>
        <td>X (S-JTSK)<br /><b>${Math.abs(projected.y).toFixed(2)}</b></td>
        <td>Z (Bpv)<br /><b>${(projected.z ?? 0).toFixed(3)}</b></td>
        <td>Kvalita<br /><b>${point.rtkQuality.toUpperCase()} ±${Math.round(point.accuracyCm * 10)} mm</b></td>
        <td>Datum<br /><b>${new Date(point.recordedAt).toLocaleString("cs-CZ")}</b></td>
      </tr>
    </table>
    ${imgs ? `<div class="photos">${imgs}</div>` : `<p class="nophoto">Bod je bez fotografie.</p>`}
    ${point.note ? `<p class="note">Poznámka: ${escapeHtml(point.note)}</p>` : ""}
  </section>`;
}

function protocolHtml(project: SurveyProject, codeFilter: string, count: number, body: string): string {
  const today = new Date().toLocaleDateString("cs-CZ");
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<title>Fotoprotokol — ${escapeHtml(project.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.45 "Helvetica Neue", Arial, sans-serif; color: #14161a; margin: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #e8332a; padding-bottom: 12px; margin-bottom: 18px; }
  header h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  header p { margin: 0; color: #555; }
  .brand { text-align: right; font-weight: 700; font-size: 18px; }
  .brand span { display: block; font-weight: 400; font-size: 11px; color: #777; }
  .point { break-inside: avoid; border: 1px solid #d5d9df; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
  table.meta { width: 100%; border-collapse: collapse; }
  table.meta td { font-size: 10px; color: #666; padding-right: 14px; vertical-align: top; }
  table.meta td b { font-size: 12px; color: #14161a; font-family: "Courier New", monospace; }
  table.meta td.name { font-size: 19px; font-weight: 700; color: #14161a; width: 90px; }
  .photos { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .photos img { height: 168px; border-radius: 4px; border: 1px solid #cfd3d9; }
  .nophoto { color: #999; font-style: italic; margin: 8px 0 0; }
  .note { margin: 6px 0 0; color: #444; }
  footer { margin-top: 20px; font-size: 10px; color: #888; display: flex; justify-content: space-between; }
  @media print { body { margin: 10mm; } .point { page-break-inside: avoid; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Fotoprotokol ${codeFilter ? `— kód ${escapeHtml(codeFilter)}` : ""}</h1>
      <p>Zakázka: <b>${escapeHtml(project.name)}</b>${project.description ? " · " + escapeHtml(project.description) : ""}</p>
      <p>Souřadnicový systém S-JTSK (EPSG:5514, ČÚZK grid) · výšky Bpv · bodů: ${count}</p>
    </div>
    <div class="brand">HOMOLA a.s.<span>Homola Field · ${today}</span></div>
  </header>
  ${body}
  <footer>
    <span>Vygenerováno aplikací Homola Field Cloud</span>
    <span>Zpracoval: ______________________ Podpis: ______________________</span>
  </footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}
