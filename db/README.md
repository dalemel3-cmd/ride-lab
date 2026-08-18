# Migrations

Numbered SQL files, applied in order. **Apply a migration before deploying the app code that
uses it** — PostgREST rejects inserts naming unknown columns, so a deploy that runs ahead of its
migration fails every write.

| File | What it does |
| --- | --- |
| `001_init.sql` | `rides`, `body_comp`, `journal_entries`, `routes`, with RLS and owner policies |

Apply via the Supabase dashboard SQL editor, or `supabase db push` with the CLI.

Never change a migration that has already been applied — add a new numbered file instead. Any
column added directly in the dashboard must also be written into a migration here, or the next
person to set up the project gets a schema that silently differs from production.
