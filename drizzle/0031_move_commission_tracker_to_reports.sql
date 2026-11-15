-- One-time move: the technician commission tracker link goes from Tools to Reports, in
-- whichever company it was added. Matches on the name ("commission"), keeps the link's id
-- (so stars stay) and leaves every other link alone.
WITH tools AS (
  SELECT substring(key FROM 12) AS ws, value::jsonb AS list FROM app_settings WHERE key LIKE 'dash_tools:%'
), split AS (
  SELECT ws,
    COALESCE((SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(list) WITH ORDINALITY t(e, o) WHERE e->>'label' ~* 'commission'), '[]'::jsonb) AS moving,
    COALESCE((SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(list) WITH ORDINALITY t(e, o) WHERE NOT (e->>'label' ~* 'commission')), '[]'::jsonb) AS keeping
  FROM tools
), add_reports AS (
  INSERT INTO app_settings (key, value, updated_at)
  SELECT 'report_links:' || ws, (COALESCE((SELECT value::jsonb FROM app_settings WHERE key = 'report_links:' || ws), '[]'::jsonb) || moving)::text, now()
  FROM split WHERE jsonb_array_length(moving) > 0
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING 1
)
UPDATE app_settings SET value = split.keeping::text, updated_at = now()
FROM split
WHERE app_settings.key = 'dash_tools:' || split.ws AND jsonb_array_length(split.moving) > 0;
