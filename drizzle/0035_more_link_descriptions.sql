-- Descriptions for the rest of the menu links (Tools, Reports, Quick Links), written after
-- opening each one. Matched by company and name; only links with no description yet change.
-- The commission tracker's description is replaced: it was written before the sheet was read.
UPDATE app_settings s
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN e->>'label' ~* 'commission' AND e->>'description' = 'Tracks the commission each technician has earned.' THEN (e - 'description') || '{"description": "Responses from the technician sale submission form: customer, sale amount, estimated commission and payout status."}'
      WHEN COALESCE(e->>'description', '') <> '' THEN e
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* '^jobber scheduling tool' THEN e || '{"description": "Two-week schedule planner that pulls visits from Jobber. Drag jobs between cleaners and days to balance hours and check drive times."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'empowered ?pay' THEN e || '{"description": "Pay workbook: works out each cleaner''s weekly commission and training pay from their job title, with a team roster tab."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'rate card' THEN e || '{"description": "Internal pricing reference: how residential prices are set (hours from square footage at $85/hr) and the minimum for each service type."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'job tim' THEN e || '{"description": "Tracks how long each job actually took against its scheduled hours: jobs over or under time and revenue per labor hour, year to date."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'residential estimator' THEN e || '{"description": "Quote builder: load a Jobber request and get a low, recommended and high price for each service to write the quote."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'drive time' THEN e || '{"description": "Weekly report of each cleaner''s drive time and miles, including drives over 45 minutes, with year-to-date totals."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'walkthrough|walk-through' THEN e || '{"description": "Phone form for in-home walk-throughs: record the home and its condition, price it from the rate card, then save it or send a draft quote to Jobber."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'business snapshot' THEN e || '{"description": "2026 business tracker: recurring clients, hourly rate, leads quoted and converted, cancellations and retention, with a year-at-a-glance tab."}'
      WHEN w.slug = 'lemon-and-lavender' AND e->>'label' ~* 'time off request' THEN e || '{"description": "Form cleaners use to request days off."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'proposal builder' THEN e || '{"description": "Builds multifamily pest control proposals with pricing, and makes the PDF and a Gmail draft to send."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* '^coi request' THEN e || '{"description": "Builds certificate of insurance requests to our insurance agents, using each property manager''s exact certificate holder wording, and logs each request."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'compliance tracker' THEN e || '{"description": "Tracks property management companies: compliance status, vendor portals, locations, contacts and follow-ups, with alerts for what needs action."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'sds' THEN e || '{"description": "Product reference for technicians: safety data sheets, label details, mix rates, product picks by pest and location, and outdated SDS tracking."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'field hub' THEN e || '{"description": "Technicians'' home screen: SDS toolkit, pest guide, inspection reports, stock and truck inventory forms, sale submission, time-off requests, prep sheets and review requests."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'customer request form' THEN e || '{"description": "GorillaDesk customer portal form where customers send service requests to Adapt Pest Pros."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'pest guide' THEN e || '{"description": "Training guide to common Portland-area pests: how to recognize each one and how it is treated. Written for office staff training."}'
      WHEN w.slug = 'adapt-pest-pros' AND e->>'label' ~* 'commission' THEN e || '{"description": "Responses from the technician sale submission form: customer, sale amount, estimated commission and payout status."}'
      ELSE e
    END ORDER BY o), '[]'::jsonb)::text
  FROM jsonb_array_elements(s.value::jsonb) WITH ORDINALITY t(e, o)
)
FROM workspaces w
WHERE s.key ~ '^(dash_tools|report_links|links|doc_links|customer_docs):' AND substring(s.key FROM position(':' IN s.key) + 1) = w.id::text AND jsonb_typeof(s.value::jsonb) = 'array';
