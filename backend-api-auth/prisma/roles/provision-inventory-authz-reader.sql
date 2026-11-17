\set ON_ERROR_STOP on

-- BE-LS-001 (ADR-0052 D2/D12, load-to-stock SA rev 1 authorization.md): read-only role through which
-- backend-api-inventory reads live authorization (auth.current_authorization) and notification recipients
-- (auth.permission_holders). Same shape as backend-api-master/prisma/roles/provision-master-authz-reader.sql.
-- Run manually as an approved DB owner after the auth migrations, before backend-api-inventory starts. Never run
-- automatically during app startup or migration. The role gets nothing else: no other auth object, no partner,
-- stone or inventory privilege, no membership.
\getenv inventory_authz_reader_password INVENTORY_AUTHZ_READER_PASSWORD
\if :{?inventory_authz_reader_password}
\else
\echo 'INVENTORY_AUTHZ_READER_PASSWORD is required in the psql environment.'
\quit 3
\endif

SELECT current_database() AS authz_database \gset
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_authz_reader') AS authz_role_exists \gset
\if :authz_role_exists
\echo 'gms_inventory_authz_reader already exists; inspect it manually and do not alter it here.'
\quit 3
\endif

-- Abort rather than hiding pre-existing PUBLIC access to auth-owned data.
SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) acl
  WHERE n.nspname = 'auth'
    AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
    AND acl.grantee = 0
    AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE', 'REFERENCES', 'TRIGGER')
) AS auth_public_data_access \gset
\if :auth_public_data_access
\echo 'PUBLIC already has auth data privileges; stop for a separate reviewed ACL decision.'
\quit 3
\endif

CREATE ROLE gms_inventory_authz_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 2 PASSWORD :'inventory_authz_reader_password';
GRANT CONNECT ON DATABASE :"authz_database" TO gms_inventory_authz_reader;
GRANT USAGE ON SCHEMA auth TO gms_inventory_authz_reader;
GRANT SELECT ON TABLE auth.current_authorization TO gms_inventory_authz_reader;
GRANT SELECT ON TABLE auth.permission_holders TO gms_inventory_authz_reader;

-- Fail if role membership unexpectedly exists; role is newly created above.
SELECT NOT EXISTS (
  SELECT 1 FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.roleid
  JOIN pg_roles u ON u.oid = m.member
  WHERE u.rolname = 'gms_inventory_authz_reader'
) AS authz_has_no_memberships \gset
\if :authz_has_no_memberships
\echo 'Inventory authz reader role created with the documented narrow grants.'
\else
\echo 'Unexpected role membership; inspect and revoke manually.'
\quit 3
\endif
