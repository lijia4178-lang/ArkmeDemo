export type ArrangementStatus = "pending" | "done" | "later";
export type ArrangementImportance = 1 | 2 | 3;
export type ArrangementSource = "manual" | "ai-manual-input" | "ai-message";

export type ArrangementContextRef = {
  conversationId: string;
  messageId: string;
  conversationType: "private" | "group" | "self";
  senderName: string;
  conversationTitle: string;
  text: string;
  sentAt: number;
};

export type ArrangementItem = {
  id: string;
  title: string;
  description: string;
  status: ArrangementStatus;
  importance: ArrangementImportance;
  people: string[];
  timeText: string;
  scheduledAt: number | null;
  place: string;
  source: ArrangementSource;
  contextRefs: ArrangementContextRef[];
  createdAt: number;
  updatedAt: number;
};

export type AiArrangementDraft = {
  title: string;
  description: string;
  people: string[];
  timeText: string;
  scheduledAt: number | null;
  place: string;
  importance: ArrangementImportance;
  confidence: number;
  reason: string;
  contextRefs: ArrangementContextRef[];
  source: Exclude<ArrangementSource, "manual">;
};

export type AiArrangementConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type ArrangementDraftInput = {
  title: string;
  description: string;
  people: string[];
  timeText: string;
  scheduledAt: number | null;
  place: string;
  importance: ArrangementImportance;
  contextRefs: ArrangementContextRef[];
  source: ArrangementSource;
};

export const arrangementsStorageKey = "arkme-demo.arrangements.v1";
export const arrangementAiConfigStorageKey = "arkme-demo.arrangementAiConfig.v1";

const defaultAiBaseUrl = "https://api.openai.com/v1";
const defaultAiModel = "gpt-4o-mini";

function readJsonValue(key: string): unknown {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJsonValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory UI usable if localStorage is unavailable.
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeOptionalTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;
    const numericValue = Number(trimmedValue);
    if (Number.isFinite(numericValue)) return numericValue;
    const parsedValue = Date.parse(trimmedValue);
    if (Number.isFinite(parsedValue)) return parsedValue;
  }
  return null;
}

function normalizeImportance(value: unknown): ArrangementImportance {
  if (value === 3 || value === "3" || value === "high") return 3;
  if (value === 2 || value === "2" || value === "medium") return 2;
  return 1;
}

function normalizePeople(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeText).filter(Boolean).slice(0, 6);
}

function normalizeContextRef(value: unknown, index: number): ArrangementContextRef | null {
  if (!value || typeof value !== "object") return null;

  const ref = value as Partial<ArrangementContextRef>;
  const conversationId = normalizeText(ref.conversationId);
  const messageId = normalizeText(ref.messageId);
  const text = normalizeText(ref.text);
  if (!conversationId || !messageId || !text) return null;

  return {
    conversationId,
    messageId,
    conversationType:
      ref.conversationType === "group"
        ? "group"
        : ref.conversationType === "self"
          ? "self"
          : "private",
    senderName: normalizeText(ref.senderName) || "未知",
    conversationTitle: normalizeText(ref.conversationTitle) || "相关对话",
    text,
    sentAt: normalizeTimestamp(ref.sentAt, Date.now() + index),
  };
}

function normalizeArrangement(value: unknown, index: number): ArrangementItem | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<ArrangementItem>;
  const title = normalizeText(item.title);
  if (!title) return null;

  const now = Date.now() + index;
  const status: ArrangementStatus =
    item.status === "done" || item.status === "later" ? item.status : "pending";
  const source: ArrangementSource =
    item.source === "ai-manual-input" || item.source === "ai-message"
      ? item.source
      : "manual";

  return {
    id: normalizeText(item.id) || `arrangement-${now}`,
    title,
    description: normalizeText(item.description),
    status,
    importance: normalizeImportance(item.importance),
    people: normalizePeople(item.people),
    timeText: normalizeText(item.timeText),
    scheduledAt: normalizeOptionalTimestamp(item.scheduledAt),
    place: normalizeText(item.place),
    source,
    contextRefs: Array.isArray(item.contextRefs)
      ? item.contextRefs
          .map(normalizeContextRef)
          .filter((ref): ref is ArrangementContextRef => Boolean(ref))
      : [],
    createdAt: normalizeTimestamp(item.createdAt, now),
    updatedAt: normalizeTimestamp(item.updatedAt, now),
  };
}

export function getInitialArrangements(): ArrangementItem[] {
  const parsedValue = readJsonValue(arrangementsStorageKey);
  if (!Array.isArray(parsedValue)) {
    const now = Date.now();
    const hospitalTime = new Date(now);
    hospitalTime.setDate(hospitalTime.getDate() + 2);
    hospitalTime.setHours(9, 0, 0, 0);
    const breakfastTime = new Date(now);
    breakfastTime.setDate(breakfastTime.getDate() + 1);
    breakfastTime.setHours(8, 30, 0, 0);
    return [
      {
        id: "arrangement-demo-hospital",
        title: "后天去医院检查身体",
        description: "把挂号信息、家人提醒和后续检查结果都归集到这一条安排里。",
        status: "pending",
        importance: 3,
        people: ["爸爸", "姐姐"],
        timeText: "后天上午",
        scheduledAt: hospitalTime.getTime(),
        place: "医院",
        source: "manual",
        contextRefs: [],
        createdAt: now - 1000 * 60 * 60 * 5,
        updatedAt: now - 1000 * 60 * 60 * 5,
      },
      {
        id: "arrangement-demo-breakfast",
        title: "明天到公司帮同事带早餐",
        description: "适合从私聊里识别出来，并保留对方请求的上下文。",
        status: "pending",
        importance: 2,
        people: ["面试官"],
        timeText: "明天早上",
        scheduledAt: breakfastTime.getTime(),
        place: "公司",
        source: "manual",
        contextRefs: [],
        createdAt: now - 1000 * 60 * 40,
        updatedAt: now - 1000 * 60 * 40,
      },
    ];
  }

  const arrangements = parsedValue
    .map(normalizeArrangement)
    .filter((item): item is ArrangementItem => Boolean(item));

  return arrangements;
}

export function persistArrangements(arrangements: ArrangementItem[]) {
  writeJsonValue(arrangementsStorageKey, arrangements);
}

export function getInitialAiArrangementConfig(): AiArrangementConfig {
  const parsedValue = readJsonValue(arrangementAiConfigStorageKey);
  if (!parsedValue || typeof parsedValue !== "object") {
    return { baseUrl: defaultAiBaseUrl, apiKey: "", model: defaultAiModel };
  }

  const config = parsedValue as Partial<AiArrangementConfig>;
  return {
    baseUrl: normalizeText(config.baseUrl) || defaultAiBaseUrl,
    apiKey: normalizeText(config.apiKey),
    model: normalizeText(config.model) || defaultAiModel,
  };
}

export function persistAiArrangementConfig(config: AiArrangementConfig) {
  writeJsonValue(arrangementAiConfigStorageKey, {
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  });
}

function buildChatCompletionsUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (trimmedBaseUrl.endsWith("/chat/completions")) return trimmedBaseUrl;
  return `${trimmedBaseUrl}/chat/completions`;
}

function extractJsonObject(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] ?? content;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return source;
  return source.slice(start, end + 1);
}

function normalizeAiDraft(
  value: unknown,
  source: Exclude<ArrangementSource, "manual">,
  contextRefs: ArrangementContextRef[]
): AiArrangementDraft {
  if (!value || typeof value !== "object") {
    throw new Error("AI 返回内容不是有效对象");
  }

  const draft = value as Partial<AiArrangementDraft>;
  const title = normalizeText(draft.title);
  if (!title) {
    throw new Error("识别失败，非安排相关内容");
  }

  return {
    title,
    description: normalizeText(draft.description),
    people: normalizePeople(draft.people),
    timeText: normalizeText(draft.timeText),
    scheduledAt: normalizeOptionalTimestamp(draft.scheduledAt),
    place: normalizeText(draft.place),
    importance: normalizeImportance(draft.importance),
    confidence:
      typeof draft.confidence === "number" && Number.isFinite(draft.confidence)
        ? Math.max(0, Math.min(1, draft.confidence))
        : 0.72,
    reason: normalizeText(draft.reason),
    contextRefs,
    source,
  };
}

async function readAiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return normalizeText(payload.error?.message) || normalizeText(payload.message);
  } catch {
    return "";
  }
}

function getAiHttpErrorMessage(status: number, detail: string) {
  const suffix = detail ? `：${detail}` : "";
  if (status === 401) {
    return `AI 鉴权失败，请检查设置里的 API Key、Base URL 和模型名称${suffix}`;
  }
  if (status === 403) {
    return `AI 服务拒绝访问，请检查 API Key 权限或模型权限${suffix}`;
  }
  if (status === 404) {
    return `AI 接口或模型不存在，请检查 Base URL 和模型名称${suffix}`;
  }
  if (status === 429) {
    return `AI 请求过于频繁或额度不足，请稍后再试或检查账号额度${suffix}`;
  }
  return `AI 识别失败：${status}${suffix}`;
}

export async function recognizeArrangement(
  config: AiArrangementConfig,
  content: string,
  source: Exclude<ArrangementSource, "manual">,
  contextRefs: ArrangementContextRef[]
): Promise<AiArrangementDraft> {
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new Error("请输入需要识别的内容");
  }
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error("请先在设置中填写 AI Base URL、API Key 和模型名");
  }

  const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      temperature: 1,
      messages: [
        {
          role: "system",
          content:
            "你是即我 app 的安排识别助手。请从用户文本或聊天消息中识别一个未来需要执行、关注或确认的安排。必须根据输入里的消息发送时间或当前时间解析相对日期。若用户只说明天、后天或某一天但没有具体时刻，使用参考时间的时分秒落到目标日期。只返回 JSON，不要解释。",
        },
        {
          role: "user",
          content: `请把下面内容拆解为安排 JSON，字段必须包含 title, description, people, timeText, scheduledAt, place, importance, confidence, reason。scheduledAt 必须是毫秒时间戳；如果完全无法判断明确日期时间，返回 null。importance 只能是 1、2、3，3 最重要。内容：\n${normalizedContent}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await readAiErrorMessage(response);
    throw new Error(getAiHttpErrorMessage(response.status, detail));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const contentText = payload.choices?.[0]?.message?.content;
  if (!contentText) {
    throw new Error("AI 未返回可解析内容");
  }

  try {
    return normalizeAiDraft(
      JSON.parse(extractJsonObject(contentText)),
      source,
      contextRefs
    );
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("AI 返回内容无法解析为安排");
  }
}

export function createArrangementFromDraft(
  draft: ArrangementDraftInput,
  overrides?: Partial<ArrangementItem>
): ArrangementItem {
  const timestamp = Date.now();
  return {
    id: overrides?.id ?? `arrangement-${timestamp}`,
    title: draft.title.trim(),
    description: draft.description.trim(),
    status: overrides?.status ?? "pending",
    importance: draft.importance,
    people: draft.people,
    timeText: draft.timeText.trim(),
    scheduledAt: draft.scheduledAt,
    place: draft.place.trim(),
    source: draft.source,
    contextRefs: draft.contextRefs,
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}
