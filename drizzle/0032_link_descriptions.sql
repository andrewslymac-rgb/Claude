-- Fills in descriptions for the existing menu links (Tools, Reports, Quick Links) in every
-- company, matched by name. Only links with no description yet are touched, so anything
-- typed in Orbit is never overwritten. Links that don't match keep no description.
UPDATE app_settings s
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE(e->>'description', '') <> '' THEN e
      WHEN e->>'label' ~* 'review request' THEN e || '{"description":"Ready-to-send Google review request: text and email wording, the review link and the QR code. Copy a message, replace the customer''s name, then paste the QR code after it."}'
      WHEN e->>'label' ~* 'google business' THEN e || '{"description":"Our Google Business Profile: reviews, photos, posts, hours and how customers find us on Google Search and Maps."}'
      WHEN e->>'label' ~* 'google ads' THEN e || '{"description":"Google Ads account: campaigns, budgets and how the ads are performing."}'
      WHEN e->>'label' ~* 'meta business' THEN e || '{"description":"Meta Business Suite: Facebook and Instagram posts, messages, ads and insights."}'
      WHEN e->>'label' ~* '^gusto' THEN e || '{"description":"Gusto: payroll, pay stubs, payroll taxes and employee benefits."}'
      WHEN e->>'label' ~* '^slack' THEN e || '{"description":"Slack: team chat, channels and messages."}'
      WHEN e->>'label' ~* '^indeed' THEN e || '{"description":"Indeed employer account: job postings and the candidates who applied."}'
      WHEN e->>'label' ~* 'pipehire' THEN e || '{"description":"PipeHire: hiring and HR."}'
      WHEN e->>'label' ~* 'handbook' THEN e || '{"description":"Employee handbook: company policies and what is expected of the team."}'
      WHEN e->>'label' ~* 'commission' THEN e || '{"description":"Tracks the commission each technician has earned."}'
      ELSE e
    END ORDER BY o), '[]'::jsonb)::text
  FROM jsonb_array_elements(s.value::jsonb) WITH ORDINALITY t(e, o)
)
WHERE s.key ~ '^(dash_tools|report_links|links|doc_links):' AND jsonb_typeof(s.value::jsonb) = 'array';
