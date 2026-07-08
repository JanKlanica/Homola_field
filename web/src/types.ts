export type RtkQuality = "Unknown" | "Single" | "Float" | "Fix";
export type LayerGeometry = "Point" | "Polyline" | "Polygon";
export type LayerRole = "podklad" | "vytyceni" | "mereni" | "hranice" | "site";
export type MapProvider = "Light" | "Ortho" | "Cadastre";

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  sjtskX?: number;
  sjtskY?: number;
}

export interface CodeDefinition {
  id: string;
  code: string;
  label: string;
  dxfLayer: string;
  shpCode: string;
  color: string;
  /** Šablona názvu bodu pro tento kód, např. "V###" — mřížky nahradí pořadové číslo. */
  nameTemplate?: string;
}

export interface SurveyPoint {
  id: string;
  name: string;
  code: string;
  note: string;
  position: GeoPoint;
  accuracyCm: number;
  rtkQuality: RtkQuality;
  samples: number;
  recordedAt: number;
  /** Zpětná kompatibilita se staršími projekty (jedna fotka). */
  photoUrl?: string;
  /** Fotky bodu — storage cesty (cloud) nebo data URL (lokální režim). */
  photos?: string[];
}

/** Sjednocené čtení fotek bodu vč. staršího photoUrl. */
export function pointPhotos(point: SurveyPoint): string[] {
  const list = [...(point.photos ?? [])];
  if (point.photoUrl && !list.includes(point.photoUrl)) list.unshift(point.photoUrl);
  return list;
}

/** Další název bodu podle šablony kódu (V### → V352) a existujících názvů v projektu. */
export function nextNameForCode(project: SurveyProject, code: string): string {
  const def = project.codes.find((item) => item.code === code);
  const template = def?.nameTemplate ?? "b###";
  const prefix = template.replace(/#+.*$/, "");
  const digits = (template.match(/#+/) ?? ["###"])[0].length;
  let max = 0;
  const all = [...project.points, ...project.targets];
  for (const item of all) {
    if (!item.name.startsWith(prefix)) continue;
    const tail = item.name.slice(prefix.length).match(/^(\d+)/);
    if (tail) max = Math.max(max, Number(tail[1]));
  }
  return prefix + String(max + 1).padStart(digits, "0");
}

export interface StakeoutTarget {
  id: string;
  name: string;
  code: string;
  position: GeoPoint;
  note: string;
  sourceLayerId?: string;
}

export interface LayerFeature {
  id: string;
  geometry: LayerGeometry;
  points: GeoPoint[];
  properties: Record<string, string>;
}

export interface ProjectLayer {
  id: string;
  name: string;
  sourceType: string;
  visible: boolean;
  role: LayerRole;
  color: string;
  features: LayerFeature[];
}

export interface SurveyProject {
  id: string;
  name: string;
  description: string;
  coordinateSystem: "EPSG:5514";
  mapProvider?: MapProvider;
  createdAt: number;
  updatedAt: number;
  codes: CodeDefinition[];
  points: SurveyPoint[];
  targets: StakeoutTarget[];
  layers: ProjectLayer[];
}

export interface UserSession {
  id: string;
  email: string;
  cloud: boolean;
}

export interface ImportResult {
  layer: ProjectLayer;
  targets: StakeoutTarget[];
  points: SurveyPoint[];
  summary: string;
}

export const defaultCodes = (): CodeDefinition[] => [
  {
    id: crypto.randomUUID(),
    code: "HRANICE",
    label: "Hranice pozemku",
    dxfLayer: "GEODET_HRANICE",
    shpCode: "HRANICE",
    color: "#007aff",
    nameTemplate: "H###"
  },
  {
    id: crypto.randomUUID(),
    code: "PLOT",
    label: "Plot",
    dxfLayer: "GEODET_PLOT",
    shpCode: "PLOT",
    color: "#1f9d63",
    nameTemplate: "PL###"
  },
  {
    id: crypto.randomUUID(),
    code: "ROH",
    label: "Roh stavby",
    dxfLayer: "GEODET_ROH_STAVBY",
    shpCode: "ROH",
    color: "#d9822b",
    nameTemplate: "R###"
  },
  {
    id: crypto.randomUUID(),
    code: "VYSKA",
    label: "Výškový bod",
    dxfLayer: "GEODET_VYSKA",
    shpCode: "VYSKA",
    color: "#8f5cf7",
    nameTemplate: "VB###"
  }
];

export const emptyProject = (name: string, description = ""): SurveyProject => ({
  id: crypto.randomUUID(),
  name,
  description,
  coordinateSystem: "EPSG:5514",
  mapProvider: "Light",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  codes: defaultCodes(),
  points: [],
  targets: [],
  layers: []
});
