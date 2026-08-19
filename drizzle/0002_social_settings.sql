--
-- Two new settings rows rather than a schema change.
--
-- Seeding only fills an empty table, so a settings row added after the first
-- run has to arrive as a migration. ON CONFLICT keeps it safe to apply twice
-- and stops it overwriting a value already edited in the admin panel.
--
INSERT INTO "settings" ("key", "value", "label", "hint", "sort")
VALUES
  ('instagram_url', '', 'Instagram', 'Leave empty to hide the link', 2),
  ('facebook_url',  '', 'Facebook',  'Leave empty to hide the link', 3)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
UPDATE "settings"
SET "hint" = 'Leave empty to hide the link'
WHERE "key" = 'linkedin_url' AND ("hint" IS NULL OR "hint" = '');