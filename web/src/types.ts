export type RtkQuality = "Unknown" | "Single" | "Float" | "Fix";
export type LayerGeometry = "Point" | "Polyline" | "Polygon";
export type LayerRole = "podklad" | "vytyceni" | "mereni" | "hranice" | "site";

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
  photoUrl?: string;
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
    color: "#007aff"
  },
  {
    id: crypto.randomUUID(),
    code: "PLOT",
    label: "Plot",
    dxfLayer: "GEODET_PLOT",
    shpCode: "PLOT",
    color: "#1f9d63"
  },
  {
    id: crypto.randomUUID(),
    code: "ROH",
    label: "Roh stavby",
    dxfLayer: "GEODET_ROH_STAVBY",
    shpCode: "ROH",
    color: "#d9822b"
  },
  {
    id: crypto.randomUUID(),
    code: "VYSKA",
    label: "Výškový bod",
    dxfLayer: "GEODET_VYSKA",
    shpCode: "VYSKA",
    color: "#8f5cf7"
  }
];

export const emptyProject = (name: string, description = ""): SurveyProject => ({
  id: crypto.randomUUID(),
  name,
  description,
  coordinateSystem: "EPSG:5514",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  codes: defaultCodes(),
  points: [],
  targets: [],
  layers: []
});
