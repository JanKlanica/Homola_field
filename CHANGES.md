# Web portál 0.2.0 — kompletní přestavba

Obsah tohoto ZIPu jsou **jen změněné a nové soubory** se zachovanými cestami
vůči repu `Homola_field`. Rozbal přes kořen repa, projdi `git diff`, commitni.

## Co je nové

- **Layout dle mockupu**: topbar (přepínač projektu, stav syncu, Export, účet)
  · levý rail projektů (filtr konečně přes React stav) · mapa · pravý panel
  s taby **Body / Cíle / Vrstvy**.
- **Tab Body**: řádky s miniaturou fotky, kvalitou textem i barvou
  (`FIX ±9 mm`), filtr fulltext + kód. Klik → **detail bodu nad mapou**:
  fotka (galerie, stáhnout JPG, odebrat), souřadnice Y/X S-JTSK + Z Bpv,
  editace názvu/kódu/poznámky, smazání bodu.
- **Fotky**: upload z webu rovnou k bodu (komprese na 1600 px JPEG).
  V cloud režimu jde soubor do Storage bucketu `project-files`
  (`{user_id}/{project_id}/photos/{point_id}/{ts}.jpg`, čtení přes signed URL),
  v lokálním demu jako data URL v projektu.
- **Šablony názvů**: `CodeDefinition.nameTemplate` (`V###`) + `nextNameForCode()`
  — placeholder nového cíle sám pokračuje v řadě (V351 → V352). Stejná logika
  je navržená pro Android (§5 redesign specu).
- **Export parita s Androidem**: nově **SHP ZIP** (PointZ + DBF UTF-8 + .cpg
  + .prj EPSG:5514), **Fotky ZIP** (JPG dle názvů bodů + `fotoindex.csv`)
  a **Fotoprotokol** (tiskové okno s hlavičkou HOMOLA → PDF přes tisk;
  řeší diakritiku bez embedování fontů). DXF/CSV/GeoJSON/JSON zůstávají.
- **Responsivní**: pod 1100 px rail jako drawer, pod 900 px datový panel
  jako spodní sheet. Zmizel předvyplněný `stavba@homola.local`.
- Vizuální řeč mockupu: Barlow Condensed + IBM Plex Mono, vysoký kontrast,
  červená jen pro akce.

## Změněné soubory

```
web/package.json              + jszip, verze 0.2.0
web/package-lock.json         regenerovaný
web/index.html                Google Fonts
web/src/types.ts              photos[], nameTemplate, pointPhotos(), nextNameForCode()
web/src/storage.ts            uploadPointPhoto(), resolvePhotoUrl() (local i Supabase Storage)
web/src/exporters.ts          + projectShpZip, projectPhotosZip, downloadBinary, slug…
web/src/App.tsx               přepsán — tenký shell (~220 řádků)
web/src/styles.css            přepsán — nový design systém
```

## Nové soubory

```
web/src/photos.ts             komprese snímků, data URL helpery
web/src/shp.ts                zápis SHP PointZ + DBF + SHX + PRJ
web/src/protocol.ts           fotoprotokol (tiskové okno)
web/src/components/common.tsx        QualityBadge, PhotoThumb, časy
web/src/components/AuthScreen.tsx
web/src/components/TopBar.tsx
web/src/components/ExportMenu.tsx
web/src/components/ProjectRail.tsx
web/src/components/MapPanel.tsx      mapa + ČÚZK podklady + výběr bodu
web/src/components/PointDetail.tsx   detail s fotkami
web/src/components/DataPanel.tsx     taby Body/Cíle/Vrstvy + import + cíle
supabase/photos-storage.sql   bucket project-files + RLS (nutné pro fotky v cloudu)
supabase/sharing-fix.sql      sdílení projektů bez RLS rekurze (volitelné, na později)
```

Beze změny: `cloudConfig.ts`, `geo/*` (projekce + ČÚZK grid), `importers.ts`,
`main.tsx`, `vite.config.ts`, skripty. Sémantika formuláře cílů (JTSK X/Y,
čárka→tečka) je zachovaná 1:1.

## Nasazení

```bash
cd web
npm install          # přibyl jszip
npm run build:field
# nahrát dist/ na field.pipetrack.cz
```

Pro fotky v cloudu spusť v Supabase SQL editoru `supabase/photos-storage.sql`
(jednorázově). Bez toho funguje vše kromě uploadu fotek v cloud režimu.

## Ověřeno

- `tsc` strict + `vite build` bez chyb.
- Playwright smoke test nad `vite preview`: login (lokální režim), 3 body,
  badge `FIX ±9`, detail V351 s fotkou, placeholder dalšího názvu **V352**
  (šablona funguje), export menu (6 formátů + Fotoprotokol), taby Cíle/Vrstvy,
  mobilní viewport 390 px (drawer + spodní panel). Konzole bez chyb.

## Poznámky / vědomé kompromisy

- **Kompatibilita JSONB**: projekt se všude ukládá spreadem původního objektu,
  takže pole, která zná jen Android (např. výkopy), sync přežijí netknutá.
  Proto v panelu zatím není tab Výkopy — webový model je nezná; doplní se,
  až je Android vystaví v datovém modelu (spec §3).
- Když na webu přidáš/odebereš fotku u bodu, starší `photoUrl` se přemigruje
  do `photos[]`. Body, na které nesáhneš, zůstávají beze změny.
- Odebrání fotky z bodu smaže referenci v projektu, soubor ve Storage zůstává
  (úklid přijde se sync fází A — mazat až po potvrzeném merge).
- Fotky z telefonu se na webu objeví až s Androidem 0.8.2 (upload při syncu,
  spec §5.3) — web je na ně připravený už teď.
