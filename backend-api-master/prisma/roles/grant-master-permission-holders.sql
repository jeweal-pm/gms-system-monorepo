\set ON_ERROR_STOP on

-- ADR-0049 D4 (owner 2026-11-11): lets the master authz reader read auth.permission_holders (notification recipients).
-- Run manually as an approved DB owner after the auth migration 20261111120000_permission_holders, on databases where
-- gms_master_authz_reader already exists. New installs get the same grant from provision-master-authz-reader.sql.
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_master_authz_reader') AS authz_role_exists \gset
\if :authz_role_exists
\else
\echo 'gms_master_authz_reader does not exist; run provision-master-authz-reader.sql instead.'
\quit 3
\endif
GRANT SELECT ON TABLE auth.permission_holders TO gms_master_authz_reader;
\echo 'Granted SELECT on auth.permission_holders to gms_master_authz_reader.'
