\set ON_ERROR_STOP on

-- load-to-stock SA rev 1 (ADR-0052 D1, authorization.md "Service-to-service", infra handoff "Database"):
--   gms_inventory_migrator  owns schema "inventory"; used only by the one-off migrate job (prisma migrate deploy).
--   gms_inventory_app       USAGE on "inventory" + SELECT/INSERT/UPDATE/DELETE on its tables (default privileges of the
--                           migrator); stock_movement INSERT/SELECT only (the migration revokes UPDATE/DELETE/TRUNCATE).
--                           No other schema.
-- The authz reader (gms_inventory_authz_reader) is provisioned by backend-api-auth/prisma/roles/provision-inventory-authz-reader.sql.
-- Run manually as an approved DB owner BEFORE the first inventory migration, after reviewing owners and ACLs. Never run
-- automatically during app startup or migration. Same structure as backend-api-master/prisma/roles/provision-master-authz-reader.sql.
\getenv inventory_migrator_password INVENTORY_MIGRATOR_PASSWORD
\getenv inventory_app_password INVENTORY_APP_PASSWORD
\if :{?inventory_migrator_password}
\else
\echo 'INVENTORY_MIGRATOR_PASSWORD is required in the psql environment.'
\quit 3
\endif
\if :{?inventory_app_password}
\else
\echo 'INVENTORY_APP_PASSWORD is required in the psql environment.'
\quit 3
\endif

SELECT current_database() AS inventory_database \gset
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('gms_inventory_migrator', 'gms_inventory_app')) AS inventory_roles_exist \gset
\if :inventory_roles_exist
\echo 'gms_inventory_migrator or gms_inventory_app already exists; inspect it manually and do not alter it here.'
\quit 3
\endif
SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'inventory') AS inventory_schema_exists \gset
\if :inventory_schema_exists
\echo 'Schema inventory already exists; inspect its owner and ACL manually.'
\quit 3
\endif

CREATE ROLE gms_inventory_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 2 PASSWORD :'inventory_migrator_password';
CREATE ROLE gms_inventory_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 7 PASSWORD :'inventory_app_password';
GRANT CONNECT ON DATABASE :"inventory_database" TO gms_inventory_migrator, gms_inventory_app;

CREATE SCHEMA "inventory" AUTHORIZATION gms_inventory_migrator;
GRANT USAGE ON SCHEMA "inventory" TO gms_inventory_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gms_inventory_migrator IN SCHEMA "inventory"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gms_inventory_app;
-- Nothing in schema public for either role.
REVOKE CREATE ON SCHEMA public FROM gms_inventory_migrator, gms_inventory_app;

SELECT NOT EXISTS (
  SELECT 1 FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member
  WHERE u.rolname IN ('gms_inventory_migrator', 'gms_inventory_app')
) AS inventory_roles_have_no_memberships \gset
\if :inventory_roles_have_no_memberships
\echo 'Inventory roles created: schema inventory owned by gms_inventory_migrator; gms_inventory_app has DML only.'
\echo 'Next: run the migrate job as gms_inventory_migrator (INVENTORY_MIGRATE_DATABASE_URL, ?schema=inventory).'
\else
\echo 'Unexpected role membership; inspect and revoke manually.'
\quit 3
\endif
