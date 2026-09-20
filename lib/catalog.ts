/**
 * The tool catalog — Adopt's model of the AI market.
 *
 * v1 asked "is this a good Microsoft 365 Copilot use case?". That question is
 * obsolete. Organisations now run a portfolio: Copilot and ChatGPT Enterprise
 * and Claude and Gemini and Slack AI and Notion AI and a coding assistant, often
 * bought by different departments in different quarters.
 *
 * The consequence is measurable. Glean's Work AI Institute surveyed 6,000 digital
 * workers: 77% use multiple AI tools weekly, a third use four or more, and 60%
 * shuffle the SAME PROMPT between tools because nobody told them which one to
 * use. Thomson Reuters found organisations deploying these tools without telling
 * anyone which tool suits which task.
 *
 * This file is the answer to that question, made explicit and inspectable.
 *
 * HONESTY CONTRACT (see CONVENTIONS.md)
 * -------------------------------------
 * Capability scores are Adopt's editorial judgement of how well a tool suits a
 * task category, not vendor-published benchmarks. Seat prices are ILLUSTRATIVE
 * list-ish figures for modelling seat economics, not quoted pricing — every
 * organisation negotiates its own. Both are shown in the UI as such. They exist
 * so the routing and the economics are inspectable and arguable, which is the
 * opposite of a black box.
 */

// ── Task categories ──────────────────────────────────────────────────────────

/**
 * A closed set of the task shapes knowledge workers actually bring. Closed on
 * purpose: an open taxonomy cannot be scored, and an unscoreable taxonomy cannot
 * route. Adding one means adding it here first.
 */
export type TaskCategory =
  | "email"
  | "meetings"
  | "docs"
  | "slides"
  | "spreadsheet"
  | "knowledge-search"
  | "code"
  | "research"
  | "long-doc"
  | "automation";

export const TASK_CATEGORIES: { id: TaskCategory; label: string; blurb: string }[] = [
  { id: "email", label: "Email and inbox", blurb: "Summarise threads, draft replies, triage a backlog." },
  { id: "meetings", label: "Meetings", blurb: "Notes, transcripts, action items, recaps." },
  { id: "docs", label: "Writing and documents", blurb: "Long-form drafting, reports, policies, proposals." },
  { id: "slides", label: "Presentations", blurb: "Decks, outlines, narrative structure." },
  { id: "spreadsheet", label: "Spreadsheets and analysis", blurb: "Formulas, pivots, explaining a dataset." },
  { id: "knowledge-search", label: "Finding things", blurb: "Locate the policy, doc or answer across company systems." },
  { id: "code", label: "Code", blurb: "Writing, reviewing, debugging, refactoring." },
  { id: "research", label: "External research", blurb: "Market, competitor and desk research from outside sources." },
  { id: "long-doc", label: "Long document analysis", blurb: "Read a contract, filing or report and extract what matters." },
  { id: "automation", label: "Repeatable processes", blurb: "Multi-step routines worth handing to an agent." },
];

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = Object.fromEntries(
  TASK_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<TaskCategory, string>;

// ── Tool profiles ────────────────────────────────────────────────────────────

export type ToolSlug =
  | "copilot-m365"
  | "chatgpt-enterprise"
  | "claude-enterprise"
  | "gemini-workspace"
  | "slack-ai"
  | "notion-ai"
  | "github-copilot"
  | "cursor"
  | "glean"
  | "perplexity-enterprise";

export type ToolProfile = {
  slug: ToolSlug;
  name: string;
  vendor: string;
  /** Where the tool actually lives in someone's day. */
  surfaces: string[];
  /**
   * Whether the tool can see the organisation's own content (mail, files, chat,
   * wiki, repos) without the user pasting it in. This is the single biggest
   * routing factor and the one people most often get wrong: a task that depends
   * on internal context routed to an ungrounded tool forces copy-paste, which is
   * both the top abandonment cause and the top shadow-data risk.
   */
  groundedInOrgData: boolean;
  /** What that grounding covers, in plain words. Empty when ungrounded. */
  groundingScope: string;
  /** 0-100 suitability per task category. Adopt's editorial judgement. */
  strengths: Record<TaskCategory, number>;
  /** Illustrative monthly seat price in EUR. NOT quoted pricing. */
  seatPriceEur: number;
  /** One line on where this tool genuinely wins. */
  bestFor: string;
  /** One line on where it disappoints. Honest by design — every tool has one. */
  weakFor: string;
};

/**
 * Scores are relative within a row, not across vendors: they answer "how well
 * does THIS tool serve THIS task", so a specialist scores high in one column and
 * low everywhere else, which is exactly what makes overlap detection work.
 */
export const CATALOG: ToolProfile[] = [
  {
    slug: "copilot-m365",
    name: "Microsoft 365 Copilot",
    vendor: "Microsoft",
    surfaces: ["Outlook", "Teams", "Word", "Excel", "PowerPoint", "Copilot Chat"],
    groundedInOrgData: true,
    groundingScope: "Microsoft 365 mail, files, chats and meetings via Graph",
    strengths: {
      email: 92, meetings: 90, docs: 74, slides: 80, spreadsheet: 76,
      "knowledge-search": 82, code: 28, research: 44, "long-doc": 58, automation: 66,
    },
    seatPriceEur: 28,
    bestFor: "Anything that lives inside Outlook or Teams and needs your own mail and meeting context.",
    weakFor: "Open-ended writing and reasoning. It is a context engine first and a writer second.",
  },
  {
    slug: "claude-enterprise",
    name: "Claude Enterprise",
    vendor: "Anthropic",
    surfaces: ["Claude web", "Desktop", "Projects"],
    groundedInOrgData: false,
    groundingScope: "",
    strengths: {
      email: 60, meetings: 56, docs: 93, slides: 56, spreadsheet: 64,
      "knowledge-search": 40, code: 88, research: 80, "long-doc": 95, automation: 72,
    },
    seatPriceEur: 28,
    bestFor: "Long documents and careful writing. The strongest option when the input is 50 pages and nuance matters.",
    weakFor: "Anything needing live company context, unless the material is brought to it.",
  },
  {
    slug: "chatgpt-enterprise",
    name: "ChatGPT Enterprise",
    vendor: "OpenAI",
    surfaces: ["ChatGPT web", "Desktop", "Mobile"],
    groundedInOrgData: false,
    groundingScope: "",
    strengths: {
      email: 62, meetings: 54, docs: 85, slides: 62, spreadsheet: 72,
      "knowledge-search": 42, code: 82, research: 86, "long-doc": 80, automation: 74,
    },
    seatPriceEur: 25,
    bestFor: "General-purpose reasoning and external research with broad tool support.",
    weakFor: "Finding something that lives in your own SharePoint. It cannot see it.",
  },
  {
    slug: "gemini-workspace",
    name: "Gemini for Workspace",
    vendor: "Google",
    surfaces: ["Gmail", "Docs", "Sheets", "Slides", "Meet"],
    groundedInOrgData: true,
    groundingScope: "Google Workspace mail, Drive files and Meet recordings",
    strengths: {
      email: 86, meetings: 82, docs: 78, slides: 76, spreadsheet: 82,
      "knowledge-search": 78, code: 56, research: 72, "long-doc": 76, automation: 58,
    },
    seatPriceEur: 22,
    bestFor: "Workspace-native organisations. Strong on Sheets and in-Gmail drafting.",
    weakFor: "Code work, and anything outside the Google surface area.",
  },
  {
    slug: "glean",
    name: "Glean",
    vendor: "Glean",
    surfaces: ["Glean web", "Browser extension", "Slack", "Teams"],
    groundedInOrgData: true,
    groundingScope: "Cross-system: Drive, SharePoint, Slack, Jira, Confluence, Salesforce and more",
    strengths: {
      email: 44, meetings: 48, docs: 52, slides: 34, spreadsheet: 36,
      "knowledge-search": 96, code: 34, research: 66, "long-doc": 62, automation: 44,
    },
    seatPriceEur: 30,
    bestFor: "One question, answered from every system at once. Nothing else searches this broadly.",
    weakFor: "Producing work. It finds and synthesises; it does not draft your deck.",
  },
  {
    slug: "slack-ai",
    name: "Slack AI",
    vendor: "Salesforce",
    surfaces: ["Slack"],
    groundedInOrgData: true,
    groundingScope: "Slack channels, threads and huddles",
    strengths: {
      email: 28, meetings: 62, docs: 34, slides: 18, spreadsheet: 24,
      "knowledge-search": 74, code: 20, research: 30, "long-doc": 38, automation: 46,
    },
    seatPriceEur: 9,
    bestFor: "Catching up. Channel recaps and thread summaries where the conversation already is.",
    weakFor: "Anything that has to leave Slack.",
  },
  {
    slug: "notion-ai",
    name: "Notion AI",
    vendor: "Notion",
    surfaces: ["Notion"],
    groundedInOrgData: true,
    groundingScope: "Notion workspace pages and databases",
    strengths: {
      email: 34, meetings: 66, docs: 80, slides: 40, spreadsheet: 48,
      "knowledge-search": 70, code: 32, research: 50, "long-doc": 58, automation: 54,
    },
    seatPriceEur: 10,
    bestFor: "Teams whose documentation genuinely lives in Notion. Meeting notes into structured pages.",
    weakFor: "Organisations where Notion is a side system. Its grounding is only as good as its coverage.",
  },
  {
    slug: "github-copilot",
    name: "GitHub Copilot",
    vendor: "GitHub",
    surfaces: ["VS Code", "JetBrains", "GitHub.com", "CLI"],
    groundedInOrgData: true,
    groundingScope: "Repository code, issues and pull requests",
    strengths: {
      email: 10, meetings: 12, docs: 30, slides: 8, spreadsheet: 22,
      "knowledge-search": 32, code: 94, research: 26, "long-doc": 30, automation: 52,
    },
    seatPriceEur: 19,
    bestFor: "In-editor code completion and review, with repository context.",
    weakFor: "Everything that is not code. A general seat given to a non-engineer is pure waste.",
  },
  {
    slug: "cursor",
    name: "Cursor",
    vendor: "Anysphere",
    surfaces: ["Cursor editor"],
    groundedInOrgData: true,
    groundingScope: "Local codebase",
    strengths: {
      email: 8, meetings: 10, docs: 32, slides: 6, spreadsheet: 20,
      "knowledge-search": 30, code: 93, research: 24, "long-doc": 34, automation: 58,
    },
    seatPriceEur: 20,
    bestFor: "Multi-file code changes where the editor itself is the agent.",
    weakFor: "Non-engineering work, and it overlaps heavily with any other coding assistant.",
  },
  {
    slug: "perplexity-enterprise",
    name: "Perplexity Enterprise",
    vendor: "Perplexity",
    surfaces: ["Perplexity web", "Browser extension"],
    groundedInOrgData: false,
    groundingScope: "",
    strengths: {
      email: 22, meetings: 24, docs: 54, slides: 30, spreadsheet: 34,
      "knowledge-search": 50, code: 34, research: 94, "long-doc": 62, automation: 30,
    },
    seatPriceEur: 35,
    bestFor: "External research with citations you can actually follow.",
    weakFor: "Internal work. It is a window outward, not inward.",
  },
];

export const TOOL_BY_SLUG: Record<ToolSlug, ToolProfile> = Object.fromEntries(
  CATALOG.map((t) => [t.slug, t]),
) as Record<ToolSlug, ToolProfile>;

export function isToolSlug(v: unknown): v is ToolSlug {
  return typeof v === "string" && CATALOG.some((t) => t.slug === v);
}

// ── Shadow tools ─────────────────────────────────────────────────────────────

/**
 * Tools people reach for when the licensed stack fails them. Offered as options
 * in the shadow-AI capture step.
 *
 * Recording these is the point. 67% of US workers report using unapproved AI
 * tools, and IBM found shadow AI involved in 43% of AI-related security
 * incidents, more than double the prior year. Governance products treat that as
 * something to detect and block. Adopt treats each instance as a routing failure
 * with a cause worth knowing: the person had a real task and the sanctioned
 * stack did not serve it.
 */
export const COMMON_SHADOW_TOOLS = [
  "ChatGPT (personal account)",
  "Claude (personal account)",
  "Gemini (personal account)",
  "Perplexity (personal)",
  "DeepSeek",
  "A browser extension",
  "An AI feature inside another SaaS tool",
  "Something else",
] as const;

// ── Data sensitivity ─────────────────────────────────────────────────────────

export type Sensitivity = "public" | "internal" | "confidential" | "personal-data";

export const SENSITIVITY_LEVELS: { id: Sensitivity; label: string; note: string }[] = [
  { id: "public", label: "Public", note: "Already published or safe to publish." },
  { id: "internal", label: "Internal", note: "Ordinary company material, not for outside eyes." },
  { id: "confidential", label: "Confidential", note: "Commercially sensitive, restricted circulation." },
  { id: "personal-data", label: "Personal data", note: "Identifies a person. GDPR applies." },
];

/** Sensitivity levels that require an approved tool, not merely a licensed one. */
export const RESTRICTED: Sensitivity[] = ["confidential", "personal-data"];

export function isSensitivity(v: unknown): v is Sensitivity {
  return typeof v === "string" && SENSITIVITY_LEVELS.some((s) => s.id === v);
}
