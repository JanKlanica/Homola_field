import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CloudRuntimeConfig } from "./cloudConfig";
import type { SurveyProject, UserSession } from "./types";
import { emptyProject } from "./types";
import { blobToDataUrl, compressImage, isInlinePhoto } from "./photos";

export interface ProjectStore {
  mode: "local" | "supabase";
  isCloudConfigured: boolean;
  setupMessage: string;
  currentSession(): Promise<UserSession | null>;
  signIn(email: string, password: string): Promise<UserSession>;
  signUp(email: string, password: string): Promise<UserSession>;
  signOut(): Promise<void>;
  listProjects(): Promise<SurveyProject[]>;
  saveProject(project: SurveyProject): Promise<SurveyProject>;
  deleteProject(projectId: string): Promise<void>;
  /** Nahraje fotku bodu; vrací referenci pro uložení do point.photos (storage cesta nebo data URL). */
  uploadPointPhoto(project: SurveyProject, pointId: string, file: File): Promise<string>;
  /** Přeloží referenci fotky na zobrazitelné URL (signed URL v cloudu, jinak beze změny). */
  resolvePhotoUrl(ref: string): Promise<string | null>;
}

const LOCAL_PROJECTS_KEY = "homola-field-cloud-projects";
const LOCAL_USER_KEY = "homola-field-cloud-user";

export function createProjectStore(config: CloudRuntimeConfig = {}): ProjectStore {
  const url = config.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key = config.supabaseAnonKey || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (url && key && !url.includes("your-project")) {
    return new SupabaseProjectStore(createClient(url, key));
  }
  if (isProductionHost()) {
    return new MissingCloudStore();
  }
  return new LocalProjectStore();
}

class LocalProjectStore implements ProjectStore {
  mode: "local" = "local";
  isCloudConfigured = false;
  setupMessage = "Cloud zatím není nakonfigurovaný, takže portál běží v lokálním demo režimu v tomto prohlížeči.";

  async currentSession(): Promise<UserSession | null> {
    const email = localStorage.getItem(LOCAL_USER_KEY);
    return email ? { id: "local-user", email, cloud: false } : null;
  }

  async signIn(email: string): Promise<UserSession> {
    localStorage.setItem(LOCAL_USER_KEY, email || "stavba@homola.local");
    ensureSeedProjects();
    return { id: "local-user", email: email || "stavba@homola.local", cloud: false };
  }

  async signUp(email: string): Promise<UserSession> {
    return this.signIn(email);
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(LOCAL_USER_KEY);
  }

  async listProjects(): Promise<SurveyProject[]> {
    ensureSeedProjects();
    return readLocalProjects().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveProject(project: SurveyProject): Promise<SurveyProject> {
    const existing = readLocalProjects().find((item) => item.id === project.id);
    const next = mergeProjects(existing, project);
    const projects = readLocalProjects().filter((item) => item.id !== next.id);
    projects.push(next);
    writeLocalProjects(projects);
    return next;
  }

  async deleteProject(projectId: string): Promise<void> {
    writeLocalProjects(readLocalProjects().filter((project) => project.id !== projectId));
  }

  async uploadPointPhoto(_project: SurveyProject, _pointId: string, file: File): Promise<string> {
    const compressed = await compressImage(file);
    return blobToDataUrl(compressed);
  }

  async resolvePhotoUrl(ref: string): Promise<string | null> {
    return isInlinePhoto(ref) ? ref : null;
  }
}

class SupabaseProjectStore implements ProjectStore {
  mode: "supabase" = "supabase";
  isCloudConfigured = true;
  setupMessage = "Přihlas se firemním účtem. Projekty se ukládají do firemního cloudu.";

  private readonly photoUrlCache = new Map<string, { url: string; expires: number }>();

  constructor(private readonly supabase: SupabaseClient) {}

  async currentSession(): Promise<UserSession | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    return user ? { id: user.id, email: user.email ?? "uzivatel", cloud: true } : null;
  }

  async signIn(email: string, password: string): Promise<UserSession> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data.user;
    return { id: user.id, email: user.email ?? email, cloud: true };
  }

  async signUp(email: string, password: string): Promise<UserSession> {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw error;
    const user = data.user;
    if (!user) return this.signIn(email, password);
    return { id: user.id, email: user.email ?? email, cloud: true };
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async listProjects(): Promise<SurveyProject[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("id,name,description,coordinate_system,data,updated_at,created_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => hydrateProject(row));
  }

  async saveProject(project: SurveyProject): Promise<SurveyProject> {
    const { data: existingRows, error: selectError } = await this.supabase
      .from("projects")
      .select("id,name,description,coordinate_system,data,updated_at,created_at")
      .eq("id", project.id)
      .limit(1);
    if (selectError) throw selectError;
    const existing = existingRows?.[0] ? hydrateProject(existingRows[0]) : null;
    const next = mergeProjects(existing, project);
    const { error } = await this.supabase.from("projects").upsert({
      id: next.id,
      name: next.name,
      description: next.description,
      coordinate_system: next.coordinateSystem,
      data: next,
      updated_at: new Date(next.updatedAt).toISOString()
    });
    if (error) throw error;
    return next;
  }

  async deleteProject(projectId: string): Promise<void> {
    const { error } = await this.supabase.from("projects").delete().eq("id", projectId);
    if (error) throw error;
  }

  async uploadPointPhoto(project: SurveyProject, pointId: string, file: File): Promise<string> {
    const { data } = await this.supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) throw new Error("Nejsi přihlášený.");
    const compressed = await compressImage(file);
    const path = `${userId}/${project.id}/photos/${pointId}/${Date.now()}.jpg`;
    const { error } = await this.supabase.storage
      .from("project-files")
      .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`Upload fotky selhal: ${error.message}`);
    return path;
  }

  async resolvePhotoUrl(ref: string): Promise<string | null> {
    if (isInlinePhoto(ref)) return ref;
    const cached = this.photoUrlCache.get(ref);
    if (cached && cached.expires > Date.now()) return cached.url;
    const { data, error } = await this.supabase.storage.from("project-files").createSignedUrl(ref, 3600);
    if (error || !data?.signedUrl) return null;
    this.photoUrlCache.set(ref, { url: data.signedUrl, expires: Date.now() + 3300 * 1000 });
    return data.signedUrl;
  }
}

class MissingCloudStore implements ProjectStore {
  mode: "local" = "local";
  isCloudConfigured = false;
  setupMessage = "Na field.pipetrack.cz chybí cloud-config.json se Supabase URL a veřejným anon key.";

  async currentSession(): Promise<UserSession | null> {
    return null;
  }

  async signIn(): Promise<UserSession> {
    throw new Error(this.setupMessage);
  }

  async signUp(): Promise<UserSession> {
    throw new Error(this.setupMessage);
  }

  async signOut(): Promise<void> {}

  async listProjects(): Promise<SurveyProject[]> {
    return [];
  }

  async saveProject(): Promise<SurveyProject> {
    throw new Error(this.setupMessage);
  }

  async deleteProject(): Promise<void> {
    throw new Error(this.setupMessage);
  }

  async uploadPointPhoto(): Promise<string> {
    throw new Error(this.setupMessage);
  }

  async resolvePhotoUrl(): Promise<string | null> {
    return null;
  }
}

function isProductionHost(): boolean {
  return typeof window !== "undefined" && window.location.hostname.toLowerCase() === "field.pipetrack.cz";
}

function hydrateProject(row: any): SurveyProject {
  const data = row.data ?? {};
  return {
    ...emptyProject(row.name ?? "Projekt"),
    ...data,
    id: row.id,
    name: row.name ?? data.name ?? "Projekt",
    description: row.description ?? data.description ?? "",
    coordinateSystem: "EPSG:5514",
    createdAt: row.created_at ? Date.parse(row.created_at) : data.createdAt ?? Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : data.updatedAt ?? Date.now()
  };
}

function mergeProjects(existing: SurveyProject | null | undefined, incoming: SurveyProject): SurveyProject {
  const updatedAt = Date.now();
  if (!existing) {
    return { ...incoming, coordinateSystem: "EPSG:5514", updatedAt };
  }
  const deletedPoints = mergeById(existing.deletedPoints ?? [], incoming.deletedPoints ?? [], mergeSurveyPoint);
  const deletedPointIds = new Set(deletedPoints.map((point) => point.id));
  return {
    ...existing,
    ...incoming,
    coordinateSystem: "EPSG:5514",
    createdAt: Math.min(existing.createdAt ?? incoming.createdAt, incoming.createdAt ?? existing.createdAt),
    updatedAt,
    codes: mergeCodes(existing.codes, incoming.codes),
    points: mergeById(existing.points, incoming.points, mergeSurveyPoint).filter((point) => !deletedPointIds.has(point.id)),
    deletedPoints,
    targets: mergeById(existing.targets, incoming.targets),
    layers: mergeById(existing.layers, incoming.layers, mergeLayer)
  };
}

function mergeCodes(existing: SurveyProject["codes"] = [], incoming: SurveyProject["codes"] = []): SurveyProject["codes"] {
  const result = new Map<string, SurveyProject["codes"][number]>();
  for (const code of existing) {
    result.set(code.code, normalizeCode(code));
  }
  for (const code of incoming) {
    const previous = result.get(code.code);
    result.set(code.code, normalizeCode(previous ? { ...previous, ...code, id: previous.id || code.id } : code));
  }
  return [...result.values()];
}

function normalizeCode(code: SurveyProject["codes"][number]): SurveyProject["codes"][number] {
  return { ...code, id: code.id || crypto.randomUUID() };
}

function mergeById<T extends { id: string }>(
  existing: T[] = [],
  incoming: T[] = [],
  merge: (existing: T, incoming: T) => T = (_existing, item) => item
): T[] {
  const result = new Map<string, T>();
  for (const item of existing) result.set(item.id, item);
  for (const item of incoming) {
    const previous = result.get(item.id);
    result.set(item.id, previous ? merge(previous, item) : item);
  }
  return [...result.values()];
}

function mergeSurveyPoint(
  existing: SurveyProject["points"][number],
  incoming: SurveyProject["points"][number]
): SurveyProject["points"][number] {
  const newer = (incoming.recordedAt ?? 0) >= (existing.recordedAt ?? 0) ? incoming : existing;
  const photos = mergeStringArray(existing.photos, incoming.photos);
  return {
    ...existing,
    ...newer,
    photoUrl: newer.photoUrl ?? existing.photoUrl,
    ...(photos.length ? { photos } : {})
  };
}

function mergeLayer(
  existing: SurveyProject["layers"][number],
  incoming: SurveyProject["layers"][number]
): SurveyProject["layers"][number] {
  return {
    ...existing,
    ...incoming,
    features: mergeById(existing.features, incoming.features, (oldFeature, nextFeature) => ({
      ...oldFeature,
      ...nextFeature,
      points: nextFeature.points?.length ? nextFeature.points : oldFeature.points,
      properties: { ...(oldFeature.properties ?? {}), ...(nextFeature.properties ?? {}) }
    }))
  };
}

function mergeStringArray(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  return [...new Set([...(existing ?? []), ...(incoming ?? [])])];
}

function readLocalProjects(): SurveyProject[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalProjects(projects: SurveyProject[]): void {
  localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
}

function ensureSeedProjects(): void {
  if (readLocalProjects().length > 0) return;
  const seed = emptyProject("Pole U Lesa", "Ukázkový cloud projekt pro webovou přípravu vytyčení.");
  seed.layers = [
    {
      id: crypto.randomUUID(),
      name: "Hranice pozemku",
      sourceType: "Demo",
      visible: true,
      role: "hranice",
      color: "#e53935",
      features: [
        {
          id: crypto.randomUUID(),
          geometry: "Polygon",
          properties: { name: "parcela 219/2", code: "HRANICE" },
          points: [
            { latitude: 49.19509, longitude: 16.60666, altitude: 284.1 },
            { latitude: 49.19515, longitude: 16.6071, altitude: 284.2 },
            { latitude: 49.19491, longitude: 16.60719, altitude: 284.3 },
            { latitude: 49.19484, longitude: 16.60673, altitude: 284.0 }
          ]
        }
      ]
    }
  ];
  seed.targets = [
    {
      id: crypto.randomUUID(),
      name: "V001",
      code: "ROH",
      note: "roh stavby",
      position: { latitude: 49.19502, longitude: 16.60691, altitude: 284.12 }
    }
  ];
  writeLocalProjects([seed]);
}
