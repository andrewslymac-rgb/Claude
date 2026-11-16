-- Lemon and Lavender Cleaning Co.: the Weekly Business Snapshot and the Employee Drive Time
-- Report move from Tools to Reports. Matched by name, ids kept (stars and descriptions stay).
WITH ws AS (
  SELECT id FROM workspaces WHERE slug = 'lemon-and-lavender'
), src AS (
  SELECT s.key, s.value::jsonb AS list, ws.id AS wid FROM app_settings s, ws WHERE s.key = 'dash_tools:' || ws.id
), moving AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items FROM src, jsonb_array_elements(src.list) WITH ORDINALITY t(e, o) WHERE e->>'label' ~* '(business snapshot|drive time)'
), keeping AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items FROM src, jsonb_array_elements(src.list) WITH ORDINALITY t(e, o) WHERE NOT (e->>'label' ~* '(business snapshot|drive time)')
), add_reports AS (
  INSERT INTO app_settings (key, value, updated_at)
  SELECT 'report_links:' || src.wid, (COALESCE((SELECT value::jsonb FROM app_settings WHERE key = 'report_links:' || src.wid), '[]'::jsonb) || moving.items)::text, now()
  FROM src, moving WHERE jsonb_array_length(moving.items) > 0
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING 1
)
UPDATE app_settings SET value = keeping.items::text, updated_at = now()
FROM src, keeping, moving
WHERE app_settings.key = src.key AND jsonb_array_length(moving.items) > 0;
