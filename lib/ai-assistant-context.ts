export type AIPageContext = {
  page: string;
  pageTitle: string;
  entityType?: string;
  entityId?: string;
  userRole?: string;
  metadata?: Record<string, unknown>;
};

export function buildPageContext(params: AIPageContext): AIPageContext {
  return { ...params };
}

export type AIMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type AIAction = {
  type: string;
  label: string;
  href?: string;
  data?: Record<string, unknown>;
};

export const AI_STRUCTURED_ACTION_TYPES = [
  "CREATE_PROPOSAL",
  "CREATE_MATERIAL_LIST",
  "CREATE_REQUEST",
] as const;

export type AIStructuredActionType =
  (typeof AI_STRUCTURED_ACTION_TYPES)[number];

/** Single workflow handoff from the assistant (optional; chat still works without it). */
export type AIStructuredAction = {
  type: AIStructuredActionType;
  /** Arbitrary fields merged into form prefill (e.g. title, description, lineItems). */
  payload: Record<string, unknown>;
};

export type AIResponse = {
  message: string;
  actions?: AIAction[];
  /** Optional structured create flow — backward compatible for clients that ignore it. */
  action?: AIStructuredAction;
};
