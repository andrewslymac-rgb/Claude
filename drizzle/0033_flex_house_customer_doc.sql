-- Lemon and Lavender Cleaning Co.: the Flex House link is the one-pager customers get about
-- the discounted cleaning service, so it moves from Documents to the new Customer Facing
-- Documents list and gets its description. Its id stays, so stars stay. Every company's
-- Flex House link gets the description wherever it is, unless one was already written.
WITH ws AS (
  SELECT id FROM workspaces WHERE slug = 'lemon-and-lavender'
), src AS (
  SELECT s.key, s.value::jsonb AS list, ws.id AS wid FROM app_settings s, ws WHERE s.key = 'doc_links:' || ws.id
), moving AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items FROM src, jsonb_array_elements(src.list) WITH ORDINALITY t(e, o) WHERE e->>'label' ~* 'flex ?house'
), keeping AS (
  SELECT COALESCE(jsonb_agg(e ORDER BY o), '[]'::jsonb) AS items FROM src, jsonb_array_elements(src.list) WITH ORDINALITY t(e, o) WHERE NOT (e->>'label' ~* 'flex ?house')
), add_customer AS (
  INSERT INTO app_settings (key, value, updated_at)
  SELECT 'customer_docs:' || src.wid, (COALESCE((SELECT value::jsonb FROM app_settings WHERE key = 'customer_docs:' || src.wid), '[]'::jsonb) || moving.items)::text, now()
  FROM src, moving WHERE jsonb_array_length(moving.items) > 0
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING 1
)
UPDATE app_settings SET value = keeping.items::text, updated_at = now()
FROM src, keeping, moving
WHERE app_settings.key = src.key AND jsonb_array_length(moving.items) > 0;
--> statement-breakpoint
UPDATE app_settings s
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN e->>'label' ~* 'flex ?house' AND COALESCE(e->>'description', '') = ''
      THEN e || '{"description":"One-pager describing our discounted Flex House cleaning service, to share with customers."}'
      ELSE e END ORDER BY o), '[]'::jsonb)::text
  FROM jsonb_array_elements(s.value::jsonb) WITH ORDINALITY t(e, o)
)
WHERE s.key ~ '^(dash_tools|report_links|links|doc_links|customer_docs):' AND jsonb_typeof(s.value::jsonb) = 'array';
