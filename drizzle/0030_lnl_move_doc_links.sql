-- One-time move for Lemon and Lavender Cleaning Co.: the employee handbook and the Flex House
-- program links were added under Websites; they belong under Documents. Matches on the link
-- name, moves only those, keeps their ids (so stars stay) and leaves every other link alone.
WITH ws AS (
  SELECT id FROM workspaces WHERE slug = 'lemon-and-lavender'
), site AS (
  SELECT s.key, s.value::jsonb AS list FROM app_settings s, ws WHERE s.key = 'links:' || ws.id
), moving AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items
  FROM site, jsonb_array_elements(site.list) WITH ORDINALITY AS t(e, o)
  WHERE e->>'label' ~* '(handbook|flex ?house)'
), keeping AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items
  FROM site, jsonb_array_elements(site.list) WITH ORDINALITY AS t(e, o)
  WHERE NOT (e->>'label' ~* '(handbook|flex ?house)')
), upd_docs AS (
  INSERT INTO app_settings (key, value, updated_at)
  SELECT 'doc_links:' || ws.id, ((COALESCE((SELECT value::jsonb FROM app_settings WHERE key = 'doc_links:' || ws.id), '[]'::jsonb)) || moving.items)::text, now()
  FROM ws, moving
  WHERE jsonb_array_length(moving.items) > 0
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING 1
)
UPDATE app_settings SET value = keeping.items::text, updated_at = now()
FROM site, keeping, moving
WHERE app_settings.key = site.key AND jsonb_array_length(moving.items) > 0;
