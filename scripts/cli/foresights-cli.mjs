import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

export const MARKETPLACE_NAME = 'instancelabs';
export const MARKETPLACE_SOURCE = 'instancelabs/foresights';
export const PLUGIN_ID = `foresights@${MARKETPLACE_NAME}`;
const VERSION = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;

const VALID_SCOPES = new Set(['user', 'project', 'local']);

const HELP = `Foresights plugin installer

Usage:
  foresights install [--claude] [--codex] [--all] [--scope user|project|local] [--dry-run]
  foresights status  [--claude] [--codex] [--all]
  foresights --version

With no host flag, install/status targets every supported CLI found on PATH.
Claude scope defaults to user. Codex manages plugin installation per user.
`;

export const parseArgs = (argv) => {
  const parsed = {
    command: 'help',
    hosts: [],
    scope: 'user',
    dryRun: false,
    version: false,
  };

  const args = [...argv];
  if (args[0] && !args[0].startsWith('-')) parsed.command = args.shift();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--claude') parsed.hosts.push('claude');
    else if (arg === '--codex') parsed.hosts.push('codex');
    else if (arg === '--all' || arg === '--both') parsed.hosts.push('claude', 'codex');
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--version' || arg === '-v') parsed.version = true;
    else if (arg === '--help' || arg === '-h') parsed.command = 'help';
    else if (arg === '--scope') {
      const scope = args[index + 1];
      if (!scope || !VALID_SCOPES.has(scope)) {
        throw new Error('--scope must be user, project, or local');
      }
      parsed.scope = scope;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  parsed.hosts = [...new Set(parsed.hosts)];
  return parsed;
};

const commandStep = (command, ...args) => ({ command, args });

export const buildInstallPlan = (host, state, scope = 'user') => {
  if (host === 'claude') {
    return [
      state.marketplaceConfigured
        ? commandStep('claude', 'plugin', 'marketplace', 'update', MARKETPLACE_NAME)
        : commandStep('claude', 'plugin', 'marketplace', 'add', MARKETPLACE_SOURCE),
      state.pluginInstalled
        ? commandStep('claude', 'plugin', 'update', PLUGIN_ID, '--scope', scope)
        : commandStep('claude', 'plugin', 'install', PLUGIN_ID, '--scope', scope),
    ];
  }

  if (host === 'codex') {
    const steps = [
      state.marketplaceConfigured
        ? commandStep('codex', 'plugin', 'marketplace', 'upgrade', MARKETPLACE_NAME)
        : commandStep('codex', 'plugin', 'marketplace', 'add', MARKETPLACE_SOURCE),
    ];
    if (!state.pluginInstalled) {
      steps.push(commandStep('codex', 'plugin', 'add', PLUGIN_ID));
    }
    return steps;
  }

  throw new Error(`Unsupported host: ${host}`);
};

export const stateFromJson = (host, marketplacesJson, pluginsJson) => {
  if (host === 'claude') {
    return {
      marketplaceConfigured:
        Array.isArray(marketplacesJson) &&
        marketplacesJson.some((marketplace) => marketplace?.name === MARKETPLACE_NAME),
      pluginInstalled:
        Array.isArray(pluginsJson) && pluginsJson.some((plugin) => plugin?.id === PLUGIN_ID),
    };
  }

  if (host === 'codex') {
    return {
      marketplaceConfigured:
        Array.isArray(marketplacesJson?.marketplaces) &&
        marketplacesJson.marketplaces.some((marketplace) => marketplace?.name === MARKETPLACE_NAME),
      pluginInstalled:
        Array.isArray(pluginsJson?.installed) &&
        pluginsJson.installed.some((plugin) => plugin?.pluginId === PLUGIN_ID && plugin?.installed),
    };
  }

  throw new Error(`Unsupported host: ${host}`);
};

const shellQuote = (value) => (/^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value));

export const formatStep = (step) =>
  [step.command, ...step.args].map((part) => shellQuote(part)).join(' ');

const defaultRunner = (command, args, { capture = false } = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
};

const commandAvailable = (host, runner) => runner(host, ['--version'], { capture: true }).ok;

const parseCommandJson = (host, args, runner) => {
  const result = runner(host, args, { capture: true });
  if (!result.ok) {
    const detail = result.stderr.trim() || result.error?.message || `exit ${result.status}`;
    throw new Error(`${host} ${args.join(' ')} failed: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${host} ${args.join(' ')} returned invalid JSON`);
  }
};

const inspectHost = (host, runner) => {
  if (!commandAvailable(host, runner)) return { available: false };
  const marketplaces = parseCommandJson(host, ['plugin', 'marketplace', 'list', '--json'], runner);
  const plugins = parseCommandJson(host, ['plugin', 'list', '--json'], runner);
  return { available: true, ...stateFromJson(host, marketplaces, plugins) };
};

const selectedHosts = (requested, runner) => {
  if (requested.length > 0) return requested;
  return ['claude', 'codex'].filter((host) => commandAvailable(host, runner));
};

const install = (args, runner, output) => {
  const hosts = selectedHosts(args.hosts, runner);
  if (hosts.length === 0) {
    throw new Error('Neither claude nor codex was found on PATH. Install a supported CLI first.');
  }

  for (const host of hosts) {
    const state = args.dryRun
      ? { marketplaceConfigured: false, pluginInstalled: false }
      : inspectHost(host, runner);
    if (!state.available && !args.dryRun) {
      throw new Error(`${host} command not found on PATH.`);
    }

    const plan = buildInstallPlan(host, state, args.scope);
    output(`${host === 'claude' ? 'Claude Code' : 'Codex'}:`);
    for (const step of plan) {
      output(`  ${args.dryRun ? '$ ' : ''}${formatStep(step)}`);
      if (args.dryRun) continue;
      const result = runner(step.command, step.args);
      if (!result.ok) throw new Error(`${formatStep(step)} failed with exit ${result.status}`);
    }
    if (host === 'codex' && state.pluginInstalled) {
      output('  Plugin already installed; marketplace snapshot refreshed.');
    }
  }

  if (!args.dryRun) output('Start a new chat or CLI session before using Foresights.');
  return 0;
};

const status = (args, runner, output) => {
  const hosts = selectedHosts(args.hosts, runner);
  if (hosts.length === 0) {
    output('No supported CLI found on PATH.');
    return 1;
  }

  let healthy = true;
  for (const host of hosts) {
    const state = inspectHost(host, runner);
    if (!state.available) {
      output(`${host}: CLI not found`);
      healthy = false;
      continue;
    }
    output(
      `${host}: marketplace=${state.marketplaceConfigured ? 'configured' : 'missing'}, plugin=${state.pluginInstalled ? 'installed' : 'missing'}`,
    );
    healthy &&= state.marketplaceConfigured && state.pluginInstalled;
  }
  return healthy ? 0 : 1;
};

export const createMain = ({ runner = defaultRunner, output = console.log } = {}) =>
  (argv) => {
    try {
      const args = parseArgs(argv);
      if (args.version) {
        output(VERSION);
        return 0;
      }
      if (args.command === 'help') {
        output(HELP.trimEnd());
        return 0;
      }
      if (args.command === 'install') return install(args, runner, output);
      if (args.command === 'status') return status(args, runner, output);
      throw new Error(`Unknown command: ${args.command}`);
    } catch (error) {
      output(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  };

export const main = createMain();
