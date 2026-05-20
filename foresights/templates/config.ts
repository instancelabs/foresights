/**
 * Wizard-substituted runtime config.
 *
 * The wizard rewrites this module at build time with the user's answers
 * (topic name, slug, accent colour, GitHub MCP server name). The defaults
 * below preserve the proven CDK shape so the un-substituted bundle still
 * runs and the integration tests still pass.
 */

/** Display name of the topic this dashboard tracks (e.g. "AWS CDK"). */
export const TOPIC = 'AWS CDK';

/** Kebab-case slug — used in localStorage keys and DOM IDs. */
export const TOPIC_SLUG = 'aws-cdk';

/**
 * The user's GitHub MCP server name. Detected at wizard time by
 * pattern-matching against the available MCP tools (looking for `__list_releases`).
 */
export const GH_SERVER = 'mcp__github';
