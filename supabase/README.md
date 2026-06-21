# Homola Field Cloud - Supabase

1. Create a Supabase project.
2. Open SQL editor and run `supabase/schema.sql`.
3. Build the web portal with `npm run build:field` inside `web`.
4. Upload `web/dist` to `https://field.pipetrack.cz`.
5. Fill `field.pipetrack.cz/cloud-config.json` with the Supabase URL and public anon key.

For local development you can still copy `web/.env.example` to `web/.env.local`.

The web portal stores the complete `SurveyProject` object in `projects.data`.
This keeps the first sync version simple and compatible with the Android model:
projects, codes, measured points, stakeout targets and imported layers live in one
document, while Supabase RLS still protects each project by `owner_id`.

Files such as original imports, exported ZIPs, DXFs, PDFs or photos can be stored
in the private `project-files` bucket under this path:

```text
{user_id}/{project_id}/{file_name}
```

The RLS policies allow users to read/write only their own folder.
