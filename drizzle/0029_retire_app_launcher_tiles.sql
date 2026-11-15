-- App-launcher tiles on Home are retired: links to outside tools now live in the menu
-- (Tools and reports, Links). Removes those tiles from every company and personal layout.
DELETE FROM "dashboard_widgets" WHERE "type" IN ('tools', 'links');
