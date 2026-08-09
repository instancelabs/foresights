#!/usr/bin/env node

import { main } from '../scripts/cli/foresights-cli.mjs';

process.exitCode = main(process.argv.slice(2));
