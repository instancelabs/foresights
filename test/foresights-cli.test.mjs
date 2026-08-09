import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInstallPlan,
  createMain,
  formatStep,
  parseArgs,
  stateFromJson,
} from '../scripts/cli/foresights-cli.mjs';

test('parseArgs selects explicit hosts and Claude scope', () => {
  assert.deepEqual(parseArgs(['install', '--all', '--scope', 'project', '--dry-run']), {
    command: 'install',
    hosts: ['claude', 'codex'],
    scope: 'project',
    dryRun: true,
    version: false,
  });
});

test('parseArgs rejects an invalid scope', () => {
  assert.throws(() => parseArgs(['install', '--scope', 'machine']), /user, project, or local/);
});

test('Claude plan adds a missing marketplace and installs at the requested scope', () => {
  const plan = buildInstallPlan(
    'claude',
    { marketplaceConfigured: false, pluginInstalled: false },
    'local',
  );
  assert.deepEqual(plan, [
    {
      command: 'claude',
      args: ['plugin', 'marketplace', 'add', 'instancelabs/foresights'],
    },
    {
      command: 'claude',
      args: ['plugin', 'install', 'foresights@instancelabs', '--scope', 'local'],
    },
  ]);
});

test('Claude plan refreshes configured and installed components', () => {
  const commands = buildInstallPlan('claude', {
    marketplaceConfigured: true,
    pluginInstalled: true,
  }).map(formatStep);
  assert.deepEqual(commands, [
    'claude plugin marketplace update instancelabs',
    'claude plugin update foresights@instancelabs --scope user',
  ]);
});

test('Codex plan refreshes an existing installation without removing it', () => {
  const commands = buildInstallPlan('codex', {
    marketplaceConfigured: true,
    pluginInstalled: true,
  }).map(formatStep);
  assert.deepEqual(commands, ['codex plugin marketplace upgrade instancelabs']);
});

test('stateFromJson understands both host response shapes', () => {
  assert.deepEqual(
    stateFromJson(
      'claude',
      [{ name: 'instancelabs' }],
      [{ id: 'foresights@instancelabs' }],
    ),
    { marketplaceConfigured: true, pluginInstalled: true },
  );
  assert.deepEqual(
    stateFromJson(
      'codex',
      { marketplaces: [{ name: 'instancelabs' }] },
      { installed: [{ pluginId: 'foresights@instancelabs', installed: true }] },
    ),
    { marketplaceConfigured: true, pluginInstalled: true },
  );
});

test('dry-run emits commands without executing mutations', () => {
  const calls = [];
  const output = [];
  const runner = (command, args) => {
    calls.push([command, args]);
    return { ok: true, status: 0, stdout: '', stderr: '' };
  };
  const main = createMain({ runner, output: (line) => output.push(line) });
  assert.equal(main(['install', '--all', '--dry-run']), 0);
  assert.equal(calls.length, 0);
  assert.ok(output.some((line) => line.includes('claude plugin marketplace add')));
  assert.ok(output.some((line) => line.includes('codex plugin add')));
});

test('install fails when an explicitly requested host is unavailable', () => {
  const output = [];
  const runner = () => ({
    ok: false,
    status: null,
    stdout: '',
    stderr: '',
    error: new Error('ENOENT'),
  });
  const main = createMain({ runner, output: (line) => output.push(line) });

  assert.equal(main(['install', '--claude']), 1);
  assert.deepEqual(output, ['Error: claude command not found on PATH.']);
});
