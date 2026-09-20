import type { ToolSlug } from "../catalog";
import { anthropicConnector } from "./anthropic";
import { githubConnector } from "./github";
import { googleConnector } from "./google";
import { microsoftConnector } from "./microsoft";
import type { Connector } from "./types";

export * from "./types";

/** Connectors that are implemented against a documented vendor endpoint. */
export const CONNECTORS: Connector[] = [
  microsoftConnector,
  githubConnector,
  anthropicConnector,
  googleConnector,
];

export const CONNECTOR_BY_SLUG: Partial<Record<ToolSlug, Connector>> = Object.fromEntries(
  CONNECTORS.map((c) => [c.slug, c]),
);

export function getConnector(slug: ToolSlug): Connector | null {
  return CONNECTOR_BY_SLUG[slug] ?? null;
}

/**
 * Researched and deliberately NOT implemented.
 *
 * Kept in code rather than a notebook so the next person does not repeat the
 * research and, more importantly, does not build one of these without reading
 * why it was skipped. In both cases an endpoint exists — shipping it would have
 * been easy and would have produced a number that looks authoritative and
 * means something different from what the Stack page claims it means.
 */
export const RESEARCHED_NOT_IMPLEMENTED: {
  slug: ToolSlug;
  name: string;
  endpoint: string;
  scope: string;
  reason: string;
}[] = [
  {
    slug: "slack-ai",
    name: "Slack AI",
    endpoint: "POST https://slack.com/api/admin.analytics.getFile (type=member, date=YYYY-MM-DD)",
    scope: "admin.analytics:read, org owner or org admin",
    reason:
      "Member analytics measures SLACK activity — messages posted, days active — not Slack AI usage. Wiring it would show a high utilisation figure for a tool nobody is using the AI features of, because everyone opens Slack. That is worse than no number. Revisit if Slack exposes AI-specific member metrics. Also returns gzipped JSONL rather than JSON, and 'file_not_yet_available' for recent dates.",
  },
  {
    slug: "chatgpt-enterprise",
    name: "ChatGPT Enterprise",
    endpoint: "OpenAI Compliance Logs Platform, workspace-scoped Admin key",
    scope: "Workspace owner grants compliance permissions; admin can grant individual log categories",
    reason:
      "The platform exports immutable time-windowed JSONL log files rather than a seat report, and OpenAI's own help centre notes counts differ between the Compliance API and Workspace Analytics because one is raw and one is cleaned. Deriving a seat-utilisation figure from raw conversation logs is an inference, not a measurement, and it would sit on the Stack page next to figures that are measurements. Needs a documented seat/analytics endpoint before it is worth building.",
  },
];
