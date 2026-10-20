# Local Docker stack and Prisma Studio

The development stack bind-mounts this checkout into the shared `f1-system-dev:local`
image. Source changes appear in the running frontend/backend watchers without rebuilding
the image. Start or reconcile it with `pnpm docker:dev`; that command also checks and
repairs the extra service networks and DNS aliases used by `backend-api-partner` on this
machine's Docker Compose v2.24.6. It does not remove volumes or database data.

If workspace dependencies change, run `pnpm docker:dev:install` to update the container
node_modules volumes. Use `pnpm docker:dev:build` only when the dev Dockerfile/base image
changes or the shared image is missing. Before removing an old image, check that no
container still uses its exact image ID; never prune all Docker images or volumes as part
of this workflow.

The local `.env` needs `PARTNER_SERVICE_TOKEN` (a unique value of at least 32 characters),
`PARTNER_DATABASE_URL` for host tools, and `PARTNER_CONTAINER_DATABASE_URL` for Compose.
See `.env.example` for their formats. If another local project uses port 3000, set
`F1_FRONTEND_HOST_PORT=3002` in `.env`; this checkout then serves the frontend on
<http://localhost:3002>. Use `localhost` in the browser: Next.js dev allows that
origin for hot reload, while this checkout's `127.0.0.1` origin is blocked. Port 3000
currently belongs to another local project. The dev auth service receives a matching
`FRONTEND_URL`.

## Prisma Studio

Prisma Studio runs on the host against the PostgreSQL container's published local port.
It is a development database editor with direct write access. Start it only while needed;
do not publish its ports outside localhost or use it against production.

```powershell
pnpm --filter @gem-crm/backend-api-auth exec prisma studio --port 5555 --browser none
pnpm --filter @gem-crm/backend-api-partner exec prisma studio --port 5556 --browser none
```

Open <http://127.0.0.1:5555> for the `auth` schema and
<http://127.0.0.1:5556> for `partner`. Run the commands in separate terminals; stop each
with Ctrl+C. If host dependencies are missing, run
`pnpm --filter @gem-crm/backend-api-auth --filter @gem-crm/backend-api-partner install --frozen-lockfile`
first. A quick read-only database check is `pnpm --filter <package> exec prisma migrate
status` for each package.

`docker/repair-dev-networks.cjs` validates Compose project/container/network labels and
repairs only missing development attachments or service aliases. It is idempotent and is
also available as `pnpm docker:dev:repair`. The current Docker/Compose combination was
observed starting `postgres` and gateway on only their default network despite the merged
Compose config declaring a second network. The script restores `postgres` on `partner-db`
and gateway on `partner-api`; it does not substitute for the partner health check.
