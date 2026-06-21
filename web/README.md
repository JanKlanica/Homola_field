# Homola Field Cloud

Web portal for preparing and downloading Homola Field projects. Production URL:
`https://field.pipetrack.cz`.

## Features

- user login through Supabase when `cloud-config.json` or `.env.local` is configured,
- local browser demo mode when Supabase is not configured,
- create and delete projects,
- import CSV, DXF, GeoJSON and SHP ZIP,
- import data as a layer, stakeout targets or measured points,
- project map with OSM tiles,
- layer visibility, color and role editing,
- export project JSON, GeoJSON, CSV and DXF,
- S-JTSK / EPSG:5514 CUZK Grid conversion for projected imports and DXF/CSV exports.

## Run

```powershell
cd web
npm install
npm run dev
```

Open the printed local URL. Without Supabase environment values the portal uses
localStorage and a demo project.

## Build for field.pipetrack.cz

```powershell
npm run build:field
```

Upload the contents of `dist` to the root of `field.pipetrack.cz`.

## Supabase runtime config

The browser and Android app use the same public config:

```text
https://field.pipetrack.cz/cloud-config.json
```

It must contain only the public Supabase URL and public anon key:

```json
{
  "supabaseUrl": "https://PROJECT.supabase.co",
  "supabaseAnonKey": "PUBLIC_ANON_KEY",
  "appName": "Homola Field"
}
```

Do not put a service role key here. User data is protected by Supabase Auth and
RLS policies from `../supabase/schema.sql`.

`.env.local` is still supported for local development.
