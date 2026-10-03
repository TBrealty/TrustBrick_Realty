-- Listing approval is always mandatory: the auto-publish shortcut for verified agents is gone.
DELETE FROM "platform"."system_settings" WHERE "key" = 'listings.auto_publish_verified_agents';
