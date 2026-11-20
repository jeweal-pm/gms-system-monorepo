#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return options.capture ? result.stdout.trim() : '';
}

const repoRoot = path.resolve(__dirname, '..');
const containerIds = run(
  'docker',
  ['ps', '-aq', '--filter', 'label=com.docker.compose.service=postgres'],
  { capture: true },
).split(/\s+/).filter(Boolean);

let target;
for (const id of containerIds) {
  const rawLabels = run('docker', ['inspect', id, '--format', '{{json .Config.Labels}}'], {
    capture: true,
  });
  const labels = JSON.parse(rawLabels);
  const workingDir = labels['com.docker.compose.project.working_dir'];
  if (workingDir && path.resolve(workingDir) === repoRoot) {
    target = labels;
    break;
  }
}

if (!target) {
  console.error('No PostgreSQL Compose container for this project was found. Start the project first.');
  process.exit(1);
}

const composeFiles = (target['com.docker.compose.project.config_files'] ?? '')
  .split(',')
  .filter(Boolean);

if (composeFiles.length === 0 || !target['com.docker.compose.project']) {
  console.error('Could not read the Compose files used by this PostgreSQL container.');
  process.exit(1);
}

const missingFile = composeFiles.find((file) => !fs.existsSync(file));
if (missingFile) {
  console.error(`Compose file recorded by the container is missing: ${missingFile}`);
  process.exit(1);
}

const args = ['compose', '-p', target['com.docker.compose.project']];
for (const file of composeFiles) args.push('-f', file);
args.push('up', '-d', '--force-recreate', 'postgres');

console.log('Applying the current Compose PostgreSQL settings by recreating only its container.');
console.log('The existing named database volume is kept; this command does not run compose down or remove volumes.');
run('docker', args, { cwd: repoRoot });
