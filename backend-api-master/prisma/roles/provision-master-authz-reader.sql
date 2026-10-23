\set ON_ERROR_STOP on

-- Run manually as an approved DB owner only after reviewing the actual object owners,
-- current ACLs and PUBLIC grants. Never run automatically during app startup or migration.
\getenv master_authz_reader_password MASTER_AUTHZ_READER_PASSWORD
\if :{?master_authz_reader_password}
\else
\echo 'MASTER_AUTHZ_READER_PASSWORD is required in the psql environment.'
\quit 3
\endif

SELECT current_database() AS authz_database \gset
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_master_authz_reader') AS authz_role_exists \gset
\if :authz_role_exists
\echo 'gms_master_authz_reader already exists; inspect it manually and do not alter it here.'
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

CREATE ROLE gms_master_authz_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  PASSWORD :'master_authz_reader_password';
GRANT CONNECT ON DATABASE :"authz_database" TO gms_master_authz_reader;
GRANT USAGE ON SCHEMA auth TO gms_master_authz_reader;
GRANT SELECT ON TABLE auth.current_authorization TO gms_master_authz_reader;

-- Fail if role membership unexpectedly exists; role is newly created above.
SELECT NOT EXISTS (
  SELECT 1 FROM pg_auth_members m
  JOIN pg_roles r ON r.oid = m.roleid
  JOIN pg_roles u ON u.oid = m.member
  WHERE u.rolname = 'gms_master_authz_reader'
) AS authz_has_no_memberships \gset
\if :authz_has_no_memberships
\echo 'Master authz reader role created with the documented narrow grants.'
\else
\echo 'Unexpected role membership; inspect and revoke manually.'
\quit 3
\endif
