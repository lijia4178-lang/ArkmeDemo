export type ArrangementStatus = "pending" | "done" | "later";
export type ArrangementImportance = 1 | 2 | 3 | 4 | 5;
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
  scheduledDate: string | null;
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
  scheduledDate: string | null;
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

export type ArrangementDraftInput = {
  title: string;
  description: string;
  people: string[];
  timeText: string;
  scheduledDate: string | null;
  scheduledAt: number | null;
  place: string;
  importance: ArrangementImportance;
  contextRefs: ArrangementContextRef[];
  source: ArrangementSource;
};

export type ArrangementDailyReviewSuggestion = {
  arrangementId: string;
  appendDescription: string;
  confidence: number;
  reason: string;
  contextRefs: ArrangementContextRef[];
};

export const arrangementsStorageKey = "arkme-demo.arrangements.v1";
export const arrangementAiConfigStorageKey = "arkme-demo.arrangementAiConfig.v1";

const defaultAiBaseUrl = "https://api.openai.com/v1";
const defaultAiModel = "gpt-4o-mini";
const aiRecognitionTimeoutMs = 12000;

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

function dateStringFromTimestamp(value: number | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function normalizeDateString(value: unknown) {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsedValue = Date.parse(`${text}T00:00:00`);
  return Number.isFinite(parsedValue) ? text : null;
}

const chineseHourMap: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
};

function normalizeHour(value: string) {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;
  return chineseHourMap[value] ?? null;
}

function timestampFromDateAndTime(dateValue: string, hour: number, minute: number) {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const parsedValue = Date.parse(
    `${dateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}:00`
  );
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function inferScheduledAtFromText(dateValue: string | null, text: string) {
  if (!dateValue || !text) return null;

  const colonMatch = text.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (colonMatch) {
    return timestampFromDateAndTime(
      dateValue,
      Number(colonMatch[1]),
      Number(colonMatch[2])
    );
  }

  const hourMatch = text.match(
    /(凌晨|早上|上午|中午|下午|晚上|晚间)?\s*(\d{1,2}|十[一二]?|十二|十一|十|[一二两三四五六七八九])\s*[点時时](?:\s*([0-5]?\d|半|一刻|三刻)\s*分?)?/
  );
  if (!hourMatch) return null;

  let hour = normalizeHour(hourMatch[2]);
  if (hour === null) return null;

  const period = hourMatch[1] ?? "";
  if ((period === "下午" || period === "晚上" || period === "晚间") && hour < 12) {
    hour += 12;
  } else if (period === "中午" && hour < 11) {
    hour += 12;
  } else if (period === "凌晨" && hour === 12) {
    hour = 0;
  }

  const minuteText = hourMatch[3] ?? "";
  const minute =
    minuteText === "半"
      ? 30
      : minuteText === "一刻"
        ? 15
        : minuteText === "三刻"
          ? 45
          : minuteText
            ? Number(minuteText)
            : 0;

  return timestampFromDateAndTime(dateValue, hour, minute);
}

function normalizeImportance(value: unknown): ArrangementImportance {
  if (value === 5 || value === "5" || value === "highest") return 5;
  if (value === 4 || value === "4" || value === "high") return 4;
  if (value === 3 || value === "3" || value === "medium") return 3;
  if (value === 2 || value === "2" || value === "low") return 2;
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
  const scheduledAt = normalizeOptionalTimestamp(item.scheduledAt);
  const scheduledDate =
    normalizeDateString(item.scheduledDate) || dateStringFromTimestamp(scheduledAt);

  return {
    id: normalizeText(item.id) || `arrangement-${now}`,
    title,
    description: normalizeText(item.description),
    status,
    importance: normalizeImportance(item.importance),
    people: normalizePeople(item.people),
    timeText: normalizeText(item.timeText),
    scheduledDate,
    scheduledAt,
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
        scheduledDate: dateStringFromTimestamp(hospitalTime.getTime()),
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
        scheduledDate: dateStringFromTimestamp(breakfastTime.getTime()),
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

function parseAiJsonContent(content: string): unknown {
  try {
    return JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error(buildAiJsonErrorMessage(content));
  }
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
  const scheduledAt = normalizeOptionalTimestamp(draft.scheduledAt);
  const scheduledDate =
    normalizeDateString(draft.scheduledDate) || dateStringFromTimestamp(scheduledAt);
  const description = normalizeText(draft.description);
  const timeText = normalizeText(draft.timeText);
  const inferredScheduledAt =
    scheduledAt ??
    inferScheduledAtFromText(scheduledDate, `${timeText}\n${title}\n${description}`);

  return {
    title,
    description,
    people: normalizePeople(draft.people),
    timeText,
    scheduledDate,
    scheduledAt: inferredScheduledAt,
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

function normalizeDailyReviewSuggestion(
  value: unknown,
  arrangements: Array<Pick<ArrangementItem, "id">>,
  contextRefs: ArrangementContextRef[]
): ArrangementDailyReviewSuggestion | null {
  if (!value || typeof value !== "object") return null;

  const suggestion = value as Partial<ArrangementDailyReviewSuggestion>;
  const arrangementId = normalizeText(suggestion.arrangementId);
  if (!arrangements.some((arrangement) => arrangement.id === arrangementId)) {
    return null;
  }
  const appendDescription = normalizeText(suggestion.appendDescription);
  if (!appendDescription) return null;

  const contextIds = Array.isArray(suggestion.contextRefs)
    ? suggestion.contextRefs
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const ref = item as Partial<ArrangementContextRef>;
          return `${normalizeText(ref.conversationId)}::${normalizeText(ref.messageId)}`;
        })
        .filter(Boolean)
    : [];
  const selectedContextRefs = contextIds.length
    ? contextRefs.filter((ref) =>
        contextIds.includes(`${ref.conversationId}::${ref.messageId}`)
      )
    : [];

  return {
    arrangementId,
    appendDescription,
    confidence:
      typeof suggestion.confidence === "number" && Number.isFinite(suggestion.confidence)
        ? Math.max(0, Math.min(1, suggestion.confidence))
        : 0.7,
    reason: normalizeText(suggestion.reason),
    contextRefs: selectedContextRefs,
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

function getObjectValue(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function readTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (typeof item === "string") return item;
      return (
        normalizeText(getObjectValue(item, "text")) ||
        normalizeText(getObjectValue(item, "content"))
      );
    })
    .filter(Boolean)
    .join("");
}

function shouldReadPrimaryTextForKey(key: string) {
  return (
    key === "content" ||
    key === "delta" ||
    key === "output_text" ||
    key === "text"
  );
}

function shouldReadReasoningTextForKey(key: string) {
  return (
    key === "reasoning_content" ||
    key === "reasoning" ||
    key === "reasoning_text"
  );
}

function collectAiTextFragments(value: unknown, keyHint = ""): string[] {
  if (typeof value === "string") {
    return shouldReadPrimaryTextForKey(keyHint) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectAiTextFragments(item, keyHint));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (isDirectAiJsonPayload(value)) {
    return [JSON.stringify(value)];
  }

  const objectValue = value as Record<string, unknown>;
  const preferredKeys = [
    "output_text",
    "content",
    "text",
    "delta",
    "message",
    "output",
    "choices",
  ];

  return preferredKeys.flatMap((key) =>
    key in objectValue ? collectAiTextFragments(objectValue[key], key) : []
  );
}

function collectAiReasoningFragments(value: unknown, keyHint = ""): string[] {
  if (typeof value === "string") {
    return shouldReadReasoningTextForKey(keyHint) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectAiReasoningFragments(item, keyHint));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (isDirectAiJsonPayload(value)) {
    return [JSON.stringify(value)];
  }

  const objectValue = value as Record<string, unknown>;
  const preferredKeys = [
    "reasoning_content",
    "reasoning_text",
    "reasoning",
    "message",
    "delta",
    "output",
    "choices",
  ];

  return preferredKeys.flatMap((key) =>
    key in objectValue ? collectAiReasoningFragments(objectValue[key], key) : []
  );
}

type ExtractedAiContent = {
  primary: string;
  reasoning: string;
};

function extractAiContentFromPayload(payload: unknown): ExtractedAiContent {
  if (isDirectAiJsonPayload(payload)) {
    return { primary: JSON.stringify(payload), reasoning: "" };
  }

  const outputText = normalizeText(getObjectValue(payload, "output_text"));
  if (outputText) return { primary: outputText, reasoning: "" };

  const responseType = normalizeText(getObjectValue(payload, "type"));
  const topLevelDelta = normalizeText(getObjectValue(payload, "delta"));
  if (topLevelDelta && responseType.includes("reasoning")) {
    return { primary: "", reasoning: topLevelDelta };
  }
  if (topLevelDelta) {
    return { primary: topLevelDelta, reasoning: "" };
  }

  const choices = getObjectValue(payload, "choices");
  if (Array.isArray(choices)) {
    const parts = choices.map((choice) => {
      const delta = getObjectValue(choice, "delta");
      const message = getObjectValue(choice, "message");
      const deltaContent = readTextContent(
        getObjectValue(delta, "content")
      );
      const messageContent = readTextContent(
        getObjectValue(message, "content")
      );
      const textContent = readTextContent(getObjectValue(choice, "text"));
      const reasoningContent =
        readTextContent(getObjectValue(delta, "reasoning_content")) ||
        readTextContent(getObjectValue(delta, "reasoning")) ||
        readTextContent(getObjectValue(delta, "reasoning_text")) ||
        readTextContent(getObjectValue(message, "reasoning_content")) ||
        readTextContent(getObjectValue(message, "reasoning"));
      return {
        primary: deltaContent || messageContent || textContent,
        reasoning: reasoningContent,
      };
    });
    return {
      primary: parts.map((part) => part.primary).filter(Boolean).join(""),
      reasoning: parts.map((part) => part.reasoning).filter(Boolean).join(""),
    };
  }

  return {
    primary:
      readTextContent(getObjectValue(payload, "content")) ||
      collectAiTextFragments(payload).join(""),
    reasoning: collectAiReasoningFragments(payload).join(""),
  };
}

function isDirectAiJsonPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const objectPayload = payload as Record<string, unknown>;
  return "title" in objectPayload || "suggestions" in objectPayload;
}

async function readAiResponseContent(response: Response) {
  if (!response.body) {
    throw new Error("AI 未返回可读取的响应内容");
  }

  const rawText = (await response.text()).trim();
  if (!rawText) return "";

  try {
    const payload = JSON.parse(rawText) as unknown;
    const content = extractAiContentFromPayload(payload);
    if (content.primary.trim()) return content.primary.trim();
    if (isDirectAiJsonPayload(payload)) return JSON.stringify(payload);
  } catch {
    // Fall through to SSE parsing for OpenAI-compatible streaming responses.
  }

  let content = "";

  for (const line of rawText.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith("data:")) continue;

    const data = trimmedLine.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    try {
      const chunk = JSON.parse(data) as unknown;
      const extractedContent = extractAiContentFromPayload(chunk);
      content += extractedContent.primary;
    } catch {
      // Ignore malformed keep-alive chunks from OpenAI-compatible gateways.
    }
  }

  return content.trim();
}

function buildAiJsonErrorMessage(content: string) {
  const preview = content.trim().replace(/\s+/g, " ").slice(0, 160);
  return preview
    ? `AI 未返回有效 JSON 内容：${preview}`
    : "AI 未返回有效 JSON 内容";
}

const arrangementRecognitionSystemPrompt = [
  "你是一个只输出 JSON 的安排识别函数，不是聊天助手。",
  "禁止输出分析、推理、解释、Markdown、代码块、前缀、后缀、自然语言或 <think>。",
  "最终回复必须满足：第一个字符是 {，最后一个字符是 }，整段内容可以被 JSON.parse 直接解析。",
  "唯一允许的 JSON 结构：{\"title\":\"\",\"description\":\"\",\"people\":[],\"timeText\":\"\",\"scheduledDate\":null,\"scheduledAt\":null,\"place\":\"\",\"importance\":1}。",
  "识别未来需要执行、关注、确认或继续推进的事项。",
  "无安排时也必须返回同结构，且 title 为空字符串，不要解释原因。",
  "相对日期按输入中的参考时间解析为 YYYY-MM-DD 的 scheduledDate。",
  "只有明确时刻如 09:00、上午九点、下午3点才返回毫秒 scheduledAt；仅明天、后天、上午、下午不虚构时刻，scheduledAt 返回 null。",
].join("\n");

function buildArrangementRecognitionUserPrompt(content: string) {
  return [
    "从下面 INPUT 中识别安排，并只返回 JSON。",
    "输出前自检：不能出现“分析：”“用户要求”“消息内容”“根据”“因此”等 JSON 字段外文字。",
    "字段要求：title, description, people, timeText, scheduledDate, scheduledAt, place, importance。",
    "importance 只能是 1、2、3、4、5，5 最重要。",
    "如果无法识别为安排，返回：{\"title\":\"\",\"description\":\"\",\"people\":[],\"timeText\":\"\",\"scheduledDate\":null,\"scheduledAt\":null,\"place\":\"\",\"importance\":1}",
    "<INPUT>",
    content,
    "</INPUT>",
    "只输出 JSON：",
  ].join("\n");
}

const dailyReviewSystemPrompt = [
  "你是一个只输出 JSON 的安排复盘函数，不是聊天助手。",
  "禁止输出分析、推理、解释、Markdown、代码块、前缀、后缀、自然语言或 <think>。",
  "最终回复必须满足：第一个字符是 {，最后一个字符是 }，整段内容可以被 JSON.parse 直接解析。",
  "唯一允许的 JSON 结构：{\"suggestions\":[]}。",
  "根据聊天内容判断是否有新信息可以更新已有安排。",
  "不要创建新安排，不要更新已完成或待定安排。",
  "没有可靠更新时返回 {\"suggestions\":[]}，不要解释原因。",
].join("\n");

function buildDailyReviewUserPrompt(content: string) {
  return [
    "从下面 INPUT 中识别已有安排的更新，并只返回 JSON。",
    "输出前自检：不能出现“分析：”“用户要求”“消息内容”“根据”“因此”等 JSON 字段外文字。",
    "返回格式：{\"suggestions\":[{\"arrangementId\":\"...\",\"appendDescription\":\"...\",\"confidence\":0.8,\"reason\":\"...\",\"contextRefs\":[{\"conversationId\":\"...\",\"messageId\":\"...\"}]}]}。",
    "appendDescription 只写需要追加到安排描述的新事实，比如检查结果、对方补充信息、地点变更等；不要重复安排已有描述。",
    "<INPUT>",
    content,
    "</INPUT>",
    "只输出 JSON：",
  ].join("\n");
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

  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, aiRecognitionTimeoutMs);

  let response: Response;
  try {
    response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      signal: abortController.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 1,
        max_tokens: 520,
        stream: true,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: arrangementRecognitionSystemPrompt,
          },
          {
            role: "user",
            content: buildArrangementRecognitionUserPrompt(normalizedContent),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 识别超时，请稍后重试或切换更快的模型");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await readAiErrorMessage(response);
    throw new Error(getAiHttpErrorMessage(response.status, detail));
  }

  const contentText = await readAiResponseContent(response);
  if (!contentText) {
    throw new Error("AI 未返回有效 JSON 内容");
  }

  return normalizeAiDraft(parseAiJsonContent(contentText), source, contextRefs);
}

export async function recognizeArrangementDailyUpdates(
  config: AiArrangementConfig,
  content: string,
  arrangements: Array<
    Pick<
      ArrangementItem,
      "id" | "title" | "description" | "people" | "place" | "scheduledDate" | "scheduledAt"
    >
  >,
  contextRefs: ArrangementContextRef[]
): Promise<ArrangementDailyReviewSuggestion[]> {
  const normalizedContent = content.trim();
  if (!normalizedContent || arrangements.length === 0 || contextRefs.length === 0) {
    return [];
  }
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error("请先在设置中填写 AI Base URL、API Key 和模型名");
  }

  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    abortController.abort();
  }, aiRecognitionTimeoutMs);

  let response: Response;
  try {
    response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      signal: abortController.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim(),
        temperature: 0.6,
        max_tokens: 720,
        stream: true,
        thinking: { type: "disabled" },
        messages: [
          {
            role: "system",
            content: dailyReviewSystemPrompt,
          },
          {
            role: "user",
            content: buildDailyReviewUserPrompt(normalizedContent),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 每日复盘超时，请稍后重试或切换更快的模型");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await readAiErrorMessage(response);
    throw new Error(getAiHttpErrorMessage(response.status, detail));
  }

  const contentText = await readAiResponseContent(response);
  if (!contentText) {
    throw new Error("AI 未返回有效 JSON 内容");
  }

  const parsedValue = parseAiJsonContent(contentText) as {
    suggestions?: unknown[];
  };
  const suggestions = Array.isArray(parsedValue.suggestions)
    ? parsedValue.suggestions
    : [];
  return suggestions
    .map((suggestion) =>
      normalizeDailyReviewSuggestion(suggestion, arrangements, contextRefs)
    )
    .filter((suggestion): suggestion is ArrangementDailyReviewSuggestion =>
      Boolean(suggestion)
    );
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
    scheduledDate: draft.scheduledDate,
    scheduledAt: draft.scheduledAt,
    place: draft.place.trim(),
    source: draft.source,
    contextRefs: draft.contextRefs,
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}
