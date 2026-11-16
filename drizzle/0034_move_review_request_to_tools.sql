-- One-time move: the Google review request link goes from Websites (Quick Links) to Tools,
-- in every company that has it. Matches on the name ("review request"), keeps the id (so
-- stars and the description stay) and leaves every other link alone.
WITH sites AS (
  SELECT substring(key FROM 7) AS ws, value::jsonb AS list FROM app_settings WHERE key LIKE 'links:%'
), split AS (
  SELECT ws,
    COALESCE((SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(list) WITH ORDINALITY t(e, o) WHERE e->>'label' ~* 'review request'), '[]'::jsonb) AS moving,
    COALESCE((SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(list) WITH ORDINALITY t(e, o) WHERE NOT (e->>'label' ~* 'review request')), '[]'::jsonb) AS keeping
  FROM sites
), add_tools AS (
  INSERT INTO app_settings (key, value, updated_at)
  SELECT 'dash_tools:' || ws, (COALESCE((SELECT value::jsonb FROM app_settings WHERE key = 'dash_tools:' || ws), '[]'::jsonb) || moving)::text, now()
  FROM split WHERE jsonb_array_length(moving) > 0
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING 1
)
UPDATE app_settings SET value = split.keeping::text, updated_at = now()
FROM split
WHERE app_settings.key = 'links:' || split.ws AND jsonb_array_length(split.moving) > 0;
