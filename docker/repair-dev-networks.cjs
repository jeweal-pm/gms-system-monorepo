// Run after `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`.
// Repairs only missing development network attachments/service DNS aliases for this
// Compose project. Does not recreate containers or touch images, volumes, or data.

const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (manifest.name !== "f1-system" || !existsSync(path.join(root, ".env"))) {
  throw new Error("Run from the f1-system checkout after creating its local .env file.");
}

const composeArgs = [
  "compose",
  "--env-file", ".env",
  "-f", "docker-compose.yml",
  "-f", "docker-compose.dev.yml",
];

function docker(args) {
  try {
    return execFileSync("docker", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    }).trim();
  } catch {
    // Do not print Docker stderr: rendered Compose output can contain credentials.
    throw new Error(`Docker command failed: docker ${args.join(" ")}`);
  }
}

function inspect(kind, id) {
  const result = JSON.parse(docker([kind, "inspect", id]));
  if (result.length !== 1) throw new Error(`Expected one ${kind} named ${id}.`);
  return result[0];
}

const config = JSON.parse(docker([...composeArgs, "config", "--format", "json"]));
if (!config.name) throw new Error("Compose did not resolve a project name.");

const required = [
  { service: "postgres", network: "partner-db", alias: "postgres" },
  { service: "api-master", network: "partner-db", alias: "api-master" },
];

const containers = new Map();
for (const { service, network, alias } of required) {
  if (!Object.hasOwn(config.services[service]?.networks ?? {}, network)) {
    throw new Error(`Compose does not declare ${service} on ${network}; refusing repair.`);
  }
  const networkName = config.networks[network]?.name;
  if (!networkName) throw new Error(`Compose network ${network} has no resolved name.`);
  const networkInfo = inspect("network", networkName);
  if (networkInfo.Labels?.["com.docker.compose.project"] !== config.name ||
      networkInfo.Labels?.["com.docker.compose.network"] !== network) {
    throw new Error(`${networkName} is not the expected Compose-managed network.`);
  }

  let containerId = containers.get(service);
  if (!containerId) {
    const ids = docker([...composeArgs, "ps", "--all", "-q", service])
      .split(/\r?\n/).filter(Boolean);
    if (ids.length !== 1) throw new Error(`Expected one ${service} container; found ${ids.length}.`);
    containerId = ids[0];
    containers.set(service, containerId);
  }
  const container = inspect("container", containerId);
  if (container.Config?.Labels?.["com.docker.compose.project"] !== config.name ||
      container.Config?.Labels?.["com.docker.compose.service"] !== service) {
    throw new Error(`${service} is not the expected Compose-managed container.`);
  }
  const endpoint = container.NetworkSettings?.Networks?.[networkName];
  if (endpoint?.Aliases?.includes(alias)) {
    console.log(`OK ${service} on ${network} as ${alias}`);
    continue;
  }
  if (!container.State?.Running) {
    throw new Error(`${service} must be running before its network can be repaired.`);
  }

  const existingAliases = (endpoint?.Aliases ?? []).filter((name) =>
    name !== containerId && name !== containerId.slice(0, 12));
  const aliases = [...new Set([...existingAliases, alias])];
  const connectArgs = ["network", "connect", ...aliases.flatMap((name) => ["--alias", name]), networkName, containerId];

  if (endpoint) {
    docker(["network", "disconnect", networkName, containerId]);
    try {
      docker(connectArgs);
    } catch (error) {
      // Restore network access even if Docker rejects an alias during reconnect.
      try { docker(["network", "connect", networkName, containerId]); } catch {}
      throw error;
    }
    console.log(`Reconnected ${service} to ${network} with alias ${alias}`);
  } else {
    docker(connectArgs);
    console.log(`Connected ${service} to ${network} with alias ${alias}`);
  }

  const verified = inspect("container", containerId).NetworkSettings?.Networks?.[networkName];
  if (!verified?.Aliases?.includes(alias)) {
    throw new Error(`${service} is still missing the ${alias} alias on ${network}.`);
  }
}
