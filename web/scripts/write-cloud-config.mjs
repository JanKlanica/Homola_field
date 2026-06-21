import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const appName = (process.env.HOMOLA_FIELD_APP_NAME || "Homola Field").trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.log("cloud-config.json: using checked-in public config");
  process.exit(0);
}

const target = resolve("public/cloud-config.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  `${JSON.stringify({ supabaseUrl, supabaseAnonKey, appName }, null, 2)}\n`,
  "utf8"
);
console.log("cloud-config.json: written from environment");
