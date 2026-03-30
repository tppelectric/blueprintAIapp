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

export type AIResponse = {
  message: string;
  actions?: AIAction[];
};
