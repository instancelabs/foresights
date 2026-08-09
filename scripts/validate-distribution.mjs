#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const fail = (message) => {
  throw new Error(message);
};

const packageJson = readJson('package.json');
const claudePlugin = readJson('foresights/.claude-plugin/plugin.json');
const codexPlugin = readJson('foresights/.codex-plugin/plugin.json');
const claudeMarketplace = readJson('.claude-plugin/marketplace.json');
const codexMarketplace = readJson('.agents/plugins/marketplace.json');

for (const manifest of [claudePlugin, codexPlugin]) {
  if (manifest.name !== 'foresights') fail('plugin manifest name must be foresights');
  if (manifest.version !== packageJson.version) {
    fail(`version mismatch: package=${packageJson.version}, plugin=${manifest.version}`);
  }
}

for (const marketplace of [claudeMarketplace, codexMarketplace]) {
  if (marketplace.name !== 'instancelabs') fail('marketplace name must be instancelabs');
  if (!marketplace.plugins?.some((plugin) => plugin.name === 'foresights')) {
    fail('marketplace must expose the foresights plugin');
  }
}

const codexEntry = codexMarketplace.plugins.find((plugin) => plugin.name === 'foresights');
if (codexEntry.source?.path !== './foresights') {
  fail('OpenAI marketplace source must point at ./foresights');
}
if (codexEntry.policy?.installation !== 'AVAILABLE') {
  fail('OpenAI marketplace install policy must be AVAILABLE');
}

const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${packageJson.version}]`)) {
  fail(`CHANGELOG.md must contain an entry for ${packageJson.version}`);
}

const skillsRoot = resolve(root, 'foresights/skills');
const skillDirs = readdirSync(skillsRoot).filter((entry) =>
  statSync(resolve(skillsRoot, entry)).isDirectory(),
);
for (const skill of skillDirs) {
  try {
    statSync(resolve(skillsRoot, skill, 'SKILL.md'));
  } catch {
    fail(`skill is missing SKILL.md: ${skill}`);
  }
}

console.log(
  `Distribution valid: ${skillDirs.length} skills, Claude + OpenAI manifests, version ${packageJson.version}.`,
);
