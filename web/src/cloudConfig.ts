export interface CloudRuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  appName?: string;
}

const ENV_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ENV_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export async function loadCloudConfig(): Promise<CloudRuntimeConfig> {
  const envConfig: CloudRuntimeConfig = {
    supabaseUrl: clean(ENV_SUPABASE_URL),
    supabaseAnonKey: clean(ENV_SUPABASE_ANON_KEY),
    appName: "PipeTrack Field"
  };

  const runtimeConfig = await loadRuntimeConfig();
  return {
    ...runtimeConfig,
    supabaseUrl: clean(runtimeConfig.supabaseUrl) || envConfig.supabaseUrl,
    supabaseAnonKey: clean(runtimeConfig.supabaseAnonKey) || envConfig.supabaseAnonKey,
    appName: runtimeConfig.appName || envConfig.appName
  };
}

async function loadRuntimeConfig(): Promise<CloudRuntimeConfig> {
  const url = `${import.meta.env.BASE_URL}cloud-config.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return {};
    const json = (await response.json()) as CloudRuntimeConfig;
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function clean(value?: string): string {
  const text = (value ?? "").trim();
  if (!text || text.includes("your-project") || text.includes("your-public")) return "";
  return text.replace(/\/+$/, "");
}
