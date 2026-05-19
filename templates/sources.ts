/**
 * Sources — the SOURCES_CONST sentinel and the source dispatcher.
 *
 * Status: Phase 2 scaffold. The default SOURCES below preserves the proven
 * CDK shape so the un-substituted bundle still runs. The wizard's
 * SOURCES_CONST generator replaces it at build time.
 *
 * dispatchSource() is implemented in Phase 5 alongside render/*.
 */

import type { Source } from './types';

// FORESIGHTS_START:SOURCES_CONST
export const SOURCES: readonly Source[] = [
  {
    id: 'cdk-core',
    label: 'aws/aws-cdk',
    owner: 'aws',
    repo: 'aws-cdk',
    kind: 'releases',
    section: 'releases',
    args: { perPage: 5 },
  },
  {
    id: 'cdk-rfcs',
    label: 'aws/aws-cdk-rfcs',
    owner: 'aws',
    repo: 'aws-cdk-rfcs',
    kind: 'issues',
    section: 'rfcs',
    args: { perPage: 10, state: 'OPEN', orderBy: 'UPDATED_AT', direction: 'DESC' },
  },
  {
    id: 'cdk-prs',
    label: 'aws/aws-cdk PRs',
    owner: 'aws',
    repo: 'aws-cdk',
    kind: 'pull_requests',
    section: 'prs',
    args: { state: 'closed', sort: 'updated', direction: 'desc', perPage: 30 },
  },
];
// FORESIGHTS_END:SOURCES_CONST
