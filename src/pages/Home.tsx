import React from "react";
import AppShell from "@/layouts/AppShell";
import ChatBubble from "@/components/ChatBubble";
import ChatInput from "@/components/ChatInput";
import ChatList from "@/components/ChatList";
import RecordDetailSheet from "@/components/RecordDetailSheet";
import RecordFullDetailScreen from "@/components/RecordFullDetailScreen";
import Records from "@/pages/Records";
import {
  createArrangementFromDraft,
  getInitialAiArrangementConfig,
  getInitialArrangements,
  persistAiArrangementConfig,
  persistArrangements,
  recognizeArrangement,
  recognizeArrangementDailyUpdates,
  type AiArrangementConfig,
  type AiArrangementDraft,
  type ArrangementDailyReviewSuggestion,
  type ArrangementContextRef,
  type ArrangementDraftInput,
  type ArrangementImportance,
  type ArrangementItem,
  type ArrangementStatus,
} from "@/data/arrangements";
import { aiConversationLogEntries } from "@/data/aiConversationLog";
import { useCandidateProfile } from "@/data/candidateProfile";
import {
  createTestReplyMessage,
  demoSenderIdentityId,
  getInitialTestGroups,
  getInitialTestIdentities,
  getInitialTestMessages,
  getInitialTestReadState,
  getPrivateConversationId,
  persistTestMessages,
  persistTestReadState,
  testConversationStorageEvent,
  testGroupsStorageKey,
  testIdentitiesStorageKey,
  testMessagesStorageKey,
  testReadStateStorageKey,
  type TestConversationType,
  type TestGroup,
  type TestIdentity,
  type TestMessage,
  type TestReadState,
  type TestMessageSender,
} from "@/data/testConversations";
import { formatBubbleTime, formatTimeLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  accentColorOptions,
  getLocaleDisplayName,
  supportedLocales,
  usePreferences,
  type AccentColor,
  type AppIcon,
  type LocaleCode,
  type ResolvedTheme,
  type ThemeMode,
} from "@/settings/preferences";
import type { PageType } from "@/App";
import type { RecordItem, RecordReference, RecordSourceConversation } from "@/types/record";

type HomeProps = {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
};

type TabItem = {
  key: PageType;
};

const tabs: TabItem[] = [
  { key: "records" },
  { key: "arrangements" },
  { key: "insight" },
  { key: "mine" },
];

const aiConversationReadCountStorageKey = "arkme-demo.aiConversationReadCount";
const browserNotificationPromptedStorageKey = "arkme-demo.browserNotificationPrompted";
const createdSelfRecordsStorageKey = "arkme-demo.selfRecords";
const arrangementDailyReviewStorageKey = "arkme-demo.lastArrangementDailyReviewDate";
const searchHistoryStorageKey = "arkme-demo.searchHistory";
const aiConversationTotalCount = aiConversationLogEntries.length;
const maxSearchHistoryCount = 4;

type QuickSearchType = "image" | "audio" | "link" | "file" | "longArticle" | "contact";

type ConversationReturnContext =
  | { mode: "drawer" }
  | {
      mode: "previous";
      recordDetail: RecordItem | null;
      recordSnapshot: RecordItem | null;
    };

type TestConversationSummary = {
  conversationId: string;
  conversationType: TestConversationType;
  title: string;
  subtitle: string;
  avatarLabel: string;
  color: string;
  identity?: TestIdentity;
  group?: TestGroup;
  memberIdentities: TestIdentity[];
  records: TestConversationRecord[];
  latestMessage: TestMessage;
  latestUnreadIdentityMessage: TestMessage | null;
  unreadCount: number;
};

type TestConversationRecord = RecordItem & {
  sender: TestMessageSender;
  identityId: string;
};

type HomeMessagePreview = {
  summary: TestConversationSummary;
  message: TestMessage;
  unreadCount: number;
};

const quickSearchTypes: QuickSearchType[] = [
  "image",
  "audio",
  "link",
  "file",
  "longArticle",
  "contact",
];

function getInitialAiConversationReadCount() {
  if (typeof window === "undefined") {
    return aiConversationTotalCount;
  }

  const storedValue = window.localStorage.getItem(aiConversationReadCountStorageKey);
  if (storedValue === null) {
    window.localStorage.setItem(
      aiConversationReadCountStorageKey,
      String(aiConversationTotalCount)
    );
    return aiConversationTotalCount;
  }

  const parsedValue = Number(storedValue);
  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.min(Math.max(0, parsedValue), aiConversationTotalCount);
}

function normalizeStoredSelfRecord(value: unknown): RecordItem | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<RecordItem>;
  if (
    typeof record.uid !== "string" ||
    typeof record.text_content !== "string" ||
    typeof record.send_at !== "number" ||
    typeof record.create_at !== "number" ||
    typeof record.update_at !== "number" ||
    !Number.isFinite(record.send_at) ||
    !Number.isFinite(record.create_at) ||
    !Number.isFinite(record.update_at)
  ) {
    return null;
  }

  const referencedRecord = normalizeStoredRecordReference(record.referencedRecord);

  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(referencedRecord ? { referencedRecord } : {}),
  };
}

function normalizeStoredRecordReference(value: unknown): RecordReference | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<RecordReference>;
  if (
    typeof record.uid !== "string" ||
    typeof record.text_content !== "string" ||
    typeof record.send_at !== "number" ||
    typeof record.create_at !== "number" ||
    typeof record.update_at !== "number" ||
    !Number.isFinite(record.send_at) ||
    !Number.isFinite(record.create_at) ||
    !Number.isFinite(record.update_at)
  ) {
    return null;
  }

  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(record.sourceConversation ? { sourceConversation: record.sourceConversation } : {}),
  };
}

function getInitialCreatedSelfRecords() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(createdSelfRecordsStorageKey);
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map(normalizeStoredSelfRecord)
      .filter((record): record is RecordItem => Boolean(record));
  } catch {
    return [];
  }
}

function persistCreatedSelfRecords(records: RecordItem[]) {
  if (typeof window === "undefined") return;

  const storableRecords = records.map(
    ({ uid, text_content, send_at, create_at, update_at, referencedRecord }) => ({
      uid,
      text_content,
      send_at,
      create_at,
      update_at,
      ...(referencedRecord ? { referencedRecord } : {}),
    })
  );

  try {
    window.localStorage.setItem(
      createdSelfRecordsStorageKey,
      JSON.stringify(storableRecords)
    );
  } catch {
    // Storage can be unavailable in private modes; keep the in-memory record.
  }
}

function makeRecordReference(record: RecordItem): RecordReference {
  return {
    uid: record.uid,
    text_content: record.text_content,
    send_at: record.send_at,
    create_at: record.create_at,
    update_at: record.update_at,
    ...(record.sourceConversation ? { sourceConversation: record.sourceConversation } : {}),
  };
}

function getInitialSearchHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(searchHistoryStorageKey);
    if (!storedValue) return [];
    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxSearchHistoryCount);
  } catch {
    return [];
  }
}

function persistSearchHistory(history: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(searchHistoryStorageKey, JSON.stringify(history));
  } catch {
    // Keep the visible in-memory history if storage is unavailable.
  }
}

function parseAiConversationTimestamp(value: string, fallbackTime: number) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return fallbackTime;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

function countRecordTextLength(value: string) {
  return Array.from(value.trim()).length;
}

function formatNumberForLocale(value: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function formatStatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function formatTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function openExternalLink(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function shouldRequestBrowserNotificationPermission() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(browserNotificationPromptedStorageKey) === "true") {
    return false;
  }
  window.localStorage.setItem(browserNotificationPromptedStorageKey, "true");
  return true;
}

export default function Home({ currentPage, onNavigate }: HomeProps) {
  const { resolvedLocale, t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const [showSearch, setShowSearch] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showAnswerGuide, setShowAnswerGuide] = React.useState(false);
  const [showAiConversation, setShowAiConversation] = React.useState(false);
  const [showSendToSelf, setShowSendToSelf] = React.useState(false);
  const [showTestConversation, setShowTestConversation] = React.useState(false);
  const [conversationReturnContext, setConversationReturnContext] =
    React.useState<ConversationReturnContext>({ mode: "drawer" });
  const [aiConversationTargetIndex, setAiConversationTargetIndex] =
    React.useState<number | null>(null);
  const [sendToSelfTargetUid, setSendToSelfTargetUid] = React.useState<string | null>(null);
  const [activeTestIdentityId, setActiveTestIdentityId] = React.useState<string | null>(null);
  const [testConversationTargetUid, setTestConversationTargetUid] = React.useState<string | null>(null);
  const [settingsView, setSettingsView] = React.useState<null | "settings" | "appearance" | "about">(
    null
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchHistory, setSearchHistory] = React.useState(getInitialSearchHistory);
  const [recordDetail, setRecordDetail] = React.useState<RecordItem | null>(null);
  const [recordSnapshot, setRecordSnapshot] = React.useState<RecordItem | null>(null);
  const [lastReadAiConversationCount, setLastReadAiConversationCount] =
    React.useState(getInitialAiConversationReadCount);
  const recordsDemoBaseTime = React.useMemo(() => Date.now(), []);
  const selfDemoBaseTime = React.useMemo(() => Date.now(), []);
  const [createdSelfRecords, setCreatedSelfRecords] = React.useState(
    getInitialCreatedSelfRecords
  );
  const [testIdentities, setTestIdentities] = React.useState(getInitialTestIdentities);
  const [testGroups, setTestGroups] = React.useState(getInitialTestGroups);
  const [testMessages, setTestMessages] = React.useState(getInitialTestMessages);
  const [testReadState, setTestReadState] =
    React.useState<TestReadState>(getInitialTestReadState);
  const [arrangements, setArrangements] = React.useState(getInitialArrangements);
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());
  const [arrangementToOpenId, setArrangementToOpenId] = React.useState<string | null>(
    null
  );
  const [arrangementAiConfig, setArrangementAiConfig] = React.useState(
    getInitialAiArrangementConfig
  );
  const [selfArrangementDraft, setSelfArrangementDraft] =
    React.useState<AiArrangementDraft | null>(null);
  const [dailyReviewSuggestion, setDailyReviewSuggestion] =
    React.useState<ArrangementDailyReviewSuggestion | null>(null);
  const [dailyReviewMessage, setDailyReviewMessage] = React.useState("");
  const [isDailyReviewing, setIsDailyReviewing] = React.useState(false);
  const [editingSelfArrangementDraft, setEditingSelfArrangementDraft] =
    React.useState<AiArrangementDraft | null>(null);
  const [selfArrangementMessage, setSelfArrangementMessage] = React.useState("");
  const [recognizingSelfArrangementUid, setRecognizingSelfArrangementUid] =
    React.useState<string | null>(null);
  const lastAutoRecognizedSelfUidRef = React.useRef<string | null>(null);
  const dailyReviewAttemptDateRef = React.useRef<string | null>(null);
  const initializedBrowserNotificationMessagesRef = React.useRef(false);
  const browserNotifiedMessageIdsRef = React.useRef<Set<string>>(new Set());

  const unreadAiConversationCount = Math.max(
    0,
    aiConversationTotalCount - lastReadAiConversationCount
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshTestConversations = () => {
      setTestIdentities(getInitialTestIdentities());
      setTestGroups(getInitialTestGroups());
      setTestMessages(getInitialTestMessages());
      setTestReadState(getInitialTestReadState());
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== testIdentitiesStorageKey &&
        event.key !== testGroupsStorageKey &&
        event.key !== testMessagesStorageKey &&
        event.key !== testReadStateStorageKey
      ) {
        return;
      }
      refreshTestConversations();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(testConversationStorageEvent, refreshTestConversations);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(testConversationStorageEvent, refreshTestConversations);
    };
  }, []);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const markAiConversationAsRead = React.useCallback(() => {
    setLastReadAiConversationCount(aiConversationTotalCount);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        aiConversationReadCountStorageKey,
        String(aiConversationTotalCount)
      );
    }
  }, []);

  const makeSelfSource = React.useCallback(
    (recordUid: string): RecordSourceConversation => ({
      type: "self",
      label: t("sendToSelf.title"),
      actionLabel: t("sendToSelf.open"),
      iconLabel: t("sendToSelf.icon"),
      recordUid,
    }),
    [t]
  );

  const makeTestSource = React.useCallback(
    (
      label: string,
      iconLabel: string,
      conversationId: string,
      recordUid?: string
    ): RecordSourceConversation => ({
      type: "test",
      label,
      actionLabel: t("records.openSource"),
      iconLabel,
      conversationId,
      recordUid,
    }),
    [t]
  );

  const demoRecords = React.useMemo<RecordItem[]>(
    () => [
      {
        uid: "demo-1",
        text_content: t("records.demo1"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
        create_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
        update_at: recordsDemoBaseTime - 1000 * 60 * 60 * 5,
      },
      {
        uid: "demo-2",
        text_content: t("records.demo2"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 45,
        create_at: recordsDemoBaseTime - 1000 * 60 * 45,
        update_at: recordsDemoBaseTime - 1000 * 60 * 45,
      },
      {
        uid: "demo-3",
        text_content: t("records.demo3"),
        send_at: recordsDemoBaseTime - 1000 * 60 * 12,
        create_at: recordsDemoBaseTime - 1000 * 60 * 12,
        update_at: recordsDemoBaseTime - 1000 * 60 * 12,
      },
    ],
    [recordsDemoBaseTime, t]
  );

  const aiConversationRecords = React.useMemo<RecordItem[]>(
    () =>
      aiConversationLogEntries.map((entry, index) => {
        const timestamp = parseAiConversationTimestamp(
          entry.timestamp,
          recordsDemoBaseTime + index
        );
        return {
          uid: `ai-conversation-user-${index}`,
          text_content: entry.userInput,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
          sourceConversation: {
            type: "ai",
            label: t("ai.title"),
            actionLabel: t("records.openSource"),
            iconLabel: "AI",
            entryIndex: index,
          },
        };
      }),
    [recordsDemoBaseTime, t]
  );

  const selfDemoRecords = React.useMemo<RecordItem[]>(
    () => [
      {
        uid: "self-demo-1",
        text_content: t("sendToSelf.demo1"),
        send_at: selfDemoBaseTime - 1000 * 60 * 28,
        create_at: selfDemoBaseTime - 1000 * 60 * 28,
        update_at: selfDemoBaseTime - 1000 * 60 * 28,
        sourceConversation: makeSelfSource("self-demo-1"),
      },
      {
        uid: "self-demo-2",
        text_content: t("sendToSelf.demo2"),
        send_at: selfDemoBaseTime - 1000 * 60 * 7,
        create_at: selfDemoBaseTime - 1000 * 60 * 7,
        update_at: selfDemoBaseTime - 1000 * 60 * 7,
        sourceConversation: makeSelfSource("self-demo-2"),
      },
    ],
    [makeSelfSource, selfDemoBaseTime, t]
  );

  const selfRecords = React.useMemo(
    () =>
      [...selfDemoRecords, ...createdSelfRecords].map((record) => ({
        ...record,
        sourceConversation: makeSelfSource(record.uid),
      })),
    [createdSelfRecords, makeSelfSource, selfDemoRecords]
  );
  const latestSelfRecord = React.useMemo(
    () =>
      selfRecords.reduce<RecordItem | null>((latest, record) => {
        if (!latest || record.send_at > latest.send_at) return record;
        return latest;
      }, null),
    [selfRecords]
  );

  const testConversationRecords = React.useMemo<TestConversationRecord[]>(
    () =>
      testMessages
        .map<TestConversationRecord | null>((message) => {
          const identity = testIdentities.find((item) => item.id === message.identityId);
          const group = testGroups.find((item) => item.id === message.conversationId);
          const isGroup = message.conversationType === "group";
          const privateIdentity =
            !isGroup
              ? testIdentities.find(
                  (item) => getPrivateConversationId(item.id) === message.conversationId
                )
              : null;
          const sourceLabel = isGroup ? group?.name : privateIdentity?.name;
          const iconLabel = isGroup ? group?.avatarLabel : privateIdentity?.avatarLabel;
          if (!sourceLabel || !iconLabel) return null;
          if (message.sender === "identity" && !identity) return null;

          const uid = `test-${message.id}`;
          return {
            uid,
            text_content: message.text,
            send_at: message.sentAt,
            create_at: message.sentAt,
            update_at: message.sentAt,
            sourceConversation: makeTestSource(
              sourceLabel,
              iconLabel,
              message.conversationId,
              uid
            ),
            sender: message.sender,
            identityId: message.identityId,
          };
        })
        .filter((record): record is TestConversationRecord => Boolean(record)),
    [makeTestSource, testGroups, testIdentities, testMessages]
  );

  const testDemoReplyRecords = React.useMemo<RecordItem[]>(
    () => testConversationRecords.filter((record) => record.sender === "demo"),
    [testConversationRecords]
  );

  const testConversationSummaries = React.useMemo<TestConversationSummary[]>(
    () => {
      const privateSummaries = testIdentities
        .map<TestConversationSummary | null>((identity) => {
          const conversationId = getPrivateConversationId(identity.id);
          const records = testConversationRecords.filter(
            (record) => record.sourceConversation?.conversationId === conversationId
          );
          const messages = testMessages.filter(
            (message) => message.conversationId === conversationId
          );
          const unreadIdentityMessages = messages.filter(
            (message) =>
              message.sender === "identity" &&
              message.sentAt > (testReadState[conversationId] ?? 0)
          );
          const latestMessage = messages.reduce<TestMessage | null>(
            (latest, message) => {
              if (!latest || message.sentAt > latest.sentAt) return message;
              return latest;
            },
            null
          );
          const latestUnreadIdentityMessage =
            unreadIdentityMessages.reduce<TestMessage | null>(
              (latest, message) => {
                if (!latest || message.sentAt > latest.sentAt) return message;
                return latest;
              },
              null
            );

          if (!latestMessage) return null;

          return {
            conversationId,
            conversationType: "private",
            title: identity.name,
            subtitle: identity.note || "测试私聊",
            avatarLabel: identity.avatarLabel,
            color: identity.color,
            identity,
            memberIdentities: [identity],
            records,
            latestMessage,
            latestUnreadIdentityMessage,
            unreadCount: unreadIdentityMessages.length,
          };
        });
      const groupSummaries = testGroups
        .map<TestConversationSummary | null>((group) => {
          const memberIdentities = group.memberIdentityIds
            .map((identityId) => testIdentities.find((identity) => identity.id === identityId))
            .filter((identity): identity is TestIdentity => Boolean(identity));
          const records = testConversationRecords.filter(
            (record) => record.sourceConversation?.conversationId === group.id
          );
          const messages = testMessages.filter(
            (message) => message.conversationId === group.id
          );
          const unreadIdentityMessages = messages.filter(
            (message) =>
              message.sender === "identity" &&
              message.sentAt > (testReadState[group.id] ?? 0)
          );
          const latestMessage = messages.reduce<TestMessage | null>(
            (latest, message) => {
              if (!latest || message.sentAt > latest.sentAt) return message;
              return latest;
            },
            null
          );
          const latestUnreadIdentityMessage =
            unreadIdentityMessages.reduce<TestMessage | null>(
              (latest, message) => {
                if (!latest || message.sentAt > latest.sentAt) return message;
                return latest;
              },
              null
            );

          if (!latestMessage) {
            return {
              conversationId: group.id,
              conversationType: "group",
              title: group.name,
              subtitle: group.note || `${memberIdentities.length} 位成员`,
              avatarLabel: group.avatarLabel,
              color: group.color,
              group,
              memberIdentities,
              records,
              latestMessage: {
                id: `empty-${group.id}`,
                conversationId: group.id,
                conversationType: "group",
                identityId: demoSenderIdentityId,
                text: "群聊能力已开启，可从后台发送群消息测试。",
                sentAt: group.createdAt,
                sender: "demo",
              },
              latestUnreadIdentityMessage: null,
              unreadCount: 0,
            };
          }

          return {
            conversationId: group.id,
            conversationType: "group",
            title: group.name,
            subtitle: group.note || `${memberIdentities.length} 位成员`,
            avatarLabel: group.avatarLabel,
            color: group.color,
            group,
            memberIdentities,
            records,
            latestMessage,
            latestUnreadIdentityMessage,
            unreadCount: unreadIdentityMessages.length,
          };
        });

      return [...privateSummaries, ...groupSummaries]
        .filter((summary): summary is TestConversationSummary => Boolean(summary))
        .sort((a, b) => b.latestMessage.sentAt - a.latestMessage.sentAt);
    },
    [testConversationRecords, testGroups, testIdentities, testMessages, testReadState]
  );

  const unreadTestConversationCount = testConversationSummaries.reduce(
    (total, summary) => total + summary.unreadCount,
    0
  );
  const homeMessagePreview = React.useMemo<HomeMessagePreview | null>(
    () =>
      testConversationSummaries.reduce<HomeMessagePreview | null>(
        (latestPreview, summary) => {
          if (!summary.latestUnreadIdentityMessage) return latestPreview;
          if (
            latestPreview &&
            latestPreview.message.sentAt >= summary.latestUnreadIdentityMessage.sentAt
          ) {
            return latestPreview;
          }
          return {
            summary,
            message: summary.latestUnreadIdentityMessage,
            unreadCount: summary.unreadCount,
          };
        },
        null
      ),
    [testConversationSummaries]
  );

  const activeTestConversationSummary =
    testConversationSummaries.find(
      (summary) => summary.conversationId === activeTestIdentityId
    ) ?? null;
  const arrangementContextRefs = React.useMemo<ArrangementContextRef[]>(
    () =>
      testConversationSummaries.flatMap((summary) =>
        summary.records.map((record) => {
          const senderName =
            record.sender === "demo"
              ? candidateProfile?.name || t("recordDetail.me")
              : summary.memberIdentities.find((identity) => identity.id === record.identityId)
                  ?.name ?? summary.title;
          return {
            conversationId: summary.conversationId,
            messageId: record.uid.replace(/^test-/, ""),
            conversationType: summary.conversationType,
            senderName,
            conversationTitle: summary.title,
            text: record.text_content,
            sentAt: record.send_at,
          };
        })
      ),
    [candidateProfile?.name, t, testConversationSummaries]
  );

  const mineStatisticRecords = React.useMemo(
    () => [
      ...demoRecords,
      ...aiConversationRecords,
      ...selfRecords,
      ...testDemoReplyRecords,
    ],
    [aiConversationRecords, demoRecords, selfRecords, testDemoReplyRecords]
  );
  const recordDetailExtensionRecords = React.useMemo(
    () =>
      recordDetail
        ? mineStatisticRecords.filter(
            (record) => record.referencedRecord?.uid === recordDetail.uid
          )
        : [],
    [mineStatisticRecords, recordDetail]
  );

  const commitSearchKeyword = React.useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) return;

    setSearchHistory((prev) => {
      const nextHistory = [
        normalizedKeyword,
        ...prev.filter((value) => value !== normalizedKeyword),
      ].slice(0, maxSearchHistoryCount);
      persistSearchHistory(nextHistory);
      return nextHistory;
    });
  }, []);

  const updateArrangements = React.useCallback(
    (updater: (prev: ArrangementItem[]) => ArrangementItem[]) => {
      setArrangements((prev) => {
        const nextArrangements = updater(prev);
        persistArrangements(nextArrangements);
        return nextArrangements;
      });
    },
    []
  );

  const updateArrangementAiConfig = React.useCallback((nextConfig: AiArrangementConfig) => {
    setArrangementAiConfig(nextConfig);
    persistAiArrangementConfig(nextConfig);
  }, []);

  const dueArrangement = React.useMemo(() => {
    const todayStart = getDayStart(new Date(currentTime));
    return sortArrangementsByStatusImportanceDate(
      arrangements.filter((arrangement) => {
        if (arrangement.status !== "pending") return false;
        if (arrangement.scheduledAt) return arrangement.scheduledAt <= currentTime;
        if (!arrangement.scheduledDate) return false;
        const scheduledStart = getArrangementSortDate(arrangement);
        return Number.isFinite(scheduledStart) && scheduledStart <= todayStart;
      })
    )[0];
  }, [arrangements, currentTime]);

  const updateArrangementStatus = React.useCallback(
    (arrangement: ArrangementItem, status: ArrangementStatus) => {
      updateArrangements((prev) =>
        prev.map((item) =>
          item.id === arrangement.id
            ? { ...item, status, updatedAt: Date.now() }
            : item
        )
      );
    },
    [updateArrangements]
  );

  const openDueArrangement = React.useCallback(
    (arrangement: ArrangementItem) => {
      setRecordDetail(null);
      setRecordSnapshot(null);
      setShowSearch(false);
      setShowAiConversation(false);
      setShowSendToSelf(false);
      setShowTestConversation(false);
      setShowAnswerGuide(false);
      setSettingsView(null);
      setArrangementToOpenId(arrangement.id);
      onNavigate("arrangements");
    },
    [onNavigate]
  );

  const makeSelfArrangementContextRef = React.useCallback(
    (record: RecordItem): ArrangementContextRef => ({
      conversationId: "self",
      messageId: record.uid,
      conversationType: "self",
      senderName: candidateProfile?.name || t("recordDetail.me"),
      conversationTitle: t("sendToSelf.title"),
      text: record.text_content,
      sentAt: record.send_at,
    }),
    [candidateProfile?.name, t]
  );

  const makeTestArrangementContextRef = React.useCallback(
    (
      summary: TestConversationSummary,
      record: TestConversationRecord
    ): ArrangementContextRef => {
      const senderName =
        record.sender === "demo"
          ? candidateProfile?.name || t("recordDetail.me")
          : summary.memberIdentities.find((identity) => identity.id === record.identityId)
              ?.name ?? summary.title;
      return {
        conversationId: summary.conversationId,
        messageId: record.uid.replace(/^test-/, ""),
        conversationType: summary.conversationType,
        senderName,
        conversationTitle: summary.title,
        text: record.text_content,
        sentAt: record.send_at,
      };
    },
    [candidateProfile?.name, t]
  );

  const recognizeSelfRecordAsArrangement = React.useCallback(
    async (record: RecordItem, mode: "auto" | "manual") => {
      if (!record.text_content.trim()) return;
      if (recognizingSelfArrangementUid) return;

      setSelfArrangementMessage("");
      setRecognizingSelfArrangementUid(record.uid);
      try {
        const contextRef = makeSelfArrangementContextRef(record);
        const messageDate = new Date(record.send_at);
        const inputText = [
          `Message sent at ISO time: ${messageDate.toISOString()}`,
          `Message local time: ${messageDate.toLocaleString("zh-CN", {
            hour12: false,
          })}`,
          `Sender: ${contextRef.senderName}`,
          `Message: ${contextRef.text}`,
        ].join("\n");
        const draft = await recognizeArrangement(
          arrangementAiConfig,
          inputText,
          "ai-message",
          [contextRef]
        );
        setSelfArrangementDraft(draft);
      } catch (error) {
        if (mode === "manual") {
          setSelfArrangementMessage(
            error instanceof Error ? error.message : t("arrangements.aiFailed")
          );
        }
      } finally {
        setRecognizingSelfArrangementUid(null);
      }
    },
    [
      arrangementAiConfig,
      makeSelfArrangementContextRef,
      recognizingSelfArrangementUid,
      t,
    ]
  );

  const recognizeTestRecordAsArrangement = React.useCallback(
    async (summary: TestConversationSummary, record: TestConversationRecord) => {
      if (!record.text_content.trim()) return;
      if (recognizingSelfArrangementUid) return;

      setSelfArrangementMessage("");
      setRecognizingSelfArrangementUid(record.uid);
      try {
        const sortedRecords = [...summary.records].sort((a, b) => a.send_at - b.send_at);
        const anchorIndex = sortedRecords.findIndex((item) => item.uid === record.uid);
        const safeAnchorIndex = anchorIndex >= 0 ? anchorIndex : 0;
        const contextRecords = sortedRecords.slice(
          Math.max(0, safeAnchorIndex - 10),
          safeAnchorIndex + 11
        );
        const contextRefs = contextRecords.map((item) =>
          makeTestArrangementContextRef(summary, item)
        );
        const anchorRef =
          contextRefs.find((item) => item.messageId === record.uid.replace(/^test-/, "")) ??
          makeTestArrangementContextRef(summary, record);
        const inputText = [
          `Conversation: ${summary.title}`,
          `Conversation type: ${summary.conversationType}`,
          `Anchor message sender: ${anchorRef.senderName}`,
          `Anchor message local time: ${new Date(record.send_at).toLocaleString("zh-CN", {
            hour12: false,
          })}`,
          "Context messages, oldest to newest:",
          ...contextRefs.map((item) => {
            const marker = item.messageId === anchorRef.messageId ? "ANCHOR" : "CONTEXT";
            return `[${marker}] ${new Date(item.sentAt).toISOString()} | ${item.senderName}: ${
              item.text
            }`;
          }),
        ].join("\n");
        const draft = await recognizeArrangement(
          arrangementAiConfig,
          inputText,
          "ai-message",
          contextRefs
        );
        setSelfArrangementDraft(draft);
      } catch (error) {
        setSelfArrangementMessage(
          error instanceof Error ? error.message : t("arrangements.aiFailed")
        );
      } finally {
        setRecognizingSelfArrangementUid(null);
      }
    },
    [
      arrangementAiConfig,
      makeTestArrangementContextRef,
      recognizingSelfArrangementUid,
      t,
    ]
  );

  const runDailyArrangementReview = React.useCallback(
    async (reviewDate: string) => {
      if (dailyReviewAttemptDateRef.current === reviewDate) return;
      dailyReviewAttemptDateRef.current = reviewDate;

      const reviewableArrangements = arrangements.filter(
        (arrangement) => arrangement.status === "pending"
      );
      if (reviewableArrangements.length === 0) {
        window.localStorage.setItem(arrangementDailyReviewStorageKey, reviewDate);
        return;
      }

      const selfContextRefs = selfRecords.map(makeSelfArrangementContextRef);
      const testContextRefs = testConversationSummaries.flatMap((summary) =>
        summary.records.map((record) => makeTestArrangementContextRef(summary, record))
      );
      const dailyContextRefs = [...selfContextRefs, ...testContextRefs].sort(
        (left, right) => left.sentAt - right.sentAt
      );
      if (dailyContextRefs.length === 0) {
        window.localStorage.setItem(arrangementDailyReviewStorageKey, reviewDate);
        return;
      }

      setDailyReviewMessage("");
      setIsDailyReviewing(true);
      try {
        const inputText = [
          `Review date: ${reviewDate}`,
          "Reviewable arrangements:",
          ...reviewableArrangements.map((arrangement) =>
            [
              `- id: ${arrangement.id}`,
              `  title: ${arrangement.title}`,
              `  description: ${arrangement.description || "无"}`,
              `  people: ${arrangement.people.join("、") || "无"}`,
              `  place: ${arrangement.place || "无"}`,
              `  scheduledDate: ${arrangement.scheduledDate ?? "无"}`,
              `  scheduledAt: ${arrangement.scheduledAt ?? "无"}`,
            ].join("\n")
          ),
          "Chat messages:",
          ...dailyContextRefs.map(
            (ref) =>
              `[${ref.conversationId}::${ref.messageId}] ${new Date(
                ref.sentAt
              ).toISOString()} | ${ref.conversationTitle} | ${ref.senderName}: ${
                ref.text
              }`
          ),
        ].join("\n");
        const suggestions = await recognizeArrangementDailyUpdates(
          arrangementAiConfig,
          inputText,
          reviewableArrangements,
          dailyContextRefs
        );
        window.localStorage.setItem(arrangementDailyReviewStorageKey, reviewDate);
        setDailyReviewSuggestion(suggestions[0] ?? null);
        setDailyReviewMessage(
          suggestions[0] ? "AI 发现一条安排更新，等待确认" : ""
        );
      } catch (error) {
        setDailyReviewMessage(
          error instanceof Error ? error.message : t("arrangements.aiFailed")
        );
      } finally {
        setIsDailyReviewing(false);
      }
    },
    [
      arrangementAiConfig,
      arrangements,
      makeSelfArrangementContextRef,
      makeTestArrangementContextRef,
      selfRecords,
      t,
      testConversationSummaries,
    ]
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const todayValue = formatLocalDateValue(new Date(currentTime));
    const lastReviewDate =
      window.localStorage.getItem(arrangementDailyReviewStorageKey) ?? "";
    if (lastReviewDate >= todayValue) return;
    void runDailyArrangementReview(todayValue);
  }, [currentTime, runDailyArrangementReview]);

  React.useEffect(() => {
    if (!showSendToSelf || !latestSelfRecord) return;
    if (lastAutoRecognizedSelfUidRef.current === latestSelfRecord.uid) return;

    lastAutoRecognizedSelfUidRef.current = latestSelfRecord.uid;
    void recognizeSelfRecordAsArrangement(latestSelfRecord, "auto");
  }, [latestSelfRecord, recognizeSelfRecordAsArrangement, showSendToSelf]);

  const confirmSelfArrangementDraft = React.useCallback(() => {
    if (!selfArrangementDraft) return;
    if (!selfArrangementDraft.scheduledDate) {
      setSelfArrangementMessage(t("arrangements.timeRequired"));
      return;
    }
    updateArrangements((prev) => [
      createArrangementFromDraft(selfArrangementDraft),
      ...prev,
    ]);
    setSelfArrangementDraft(null);
    setSelfArrangementMessage(t("arrangements.confirmed"));
  }, [selfArrangementDraft, t, updateArrangements]);

  const confirmDailyReviewSuggestion = React.useCallback(() => {
    if (!dailyReviewSuggestion) return;
    const updateDate = new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    updateArrangements((prev) =>
      prev.map((arrangement) => {
        if (arrangement.id !== dailyReviewSuggestion.arrangementId) return arrangement;
        const existingContextIds = new Set(
          arrangement.contextRefs.map((ref) => `${ref.conversationId}::${ref.messageId}`)
        );
        const mergedContextRefs = [
          ...arrangement.contextRefs,
          ...dailyReviewSuggestion.contextRefs.filter(
            (ref) => !existingContextIds.has(`${ref.conversationId}::${ref.messageId}`)
          ),
        ];
        const appendText = `${updateDate} 聊天更新：${dailyReviewSuggestion.appendDescription}`;
        return {
          ...arrangement,
          description: arrangement.description
            ? `${arrangement.description}\n${appendText}`
            : appendText,
          contextRefs: mergedContextRefs,
          updatedAt: Date.now(),
        };
      })
    );
    setDailyReviewSuggestion(null);
    setDailyReviewMessage("安排更新已确认");
  }, [dailyReviewSuggestion, updateArrangements]);

  const cancelDailyReviewSuggestion = React.useCallback(() => {
    setDailyReviewSuggestion(null);
    setDailyReviewMessage("");
  }, []);

  const saveEditingSelfArrangementDraft = React.useCallback(
    (nextDraft: ArrangementDraftInput) => {
      if (!editingSelfArrangementDraft) return;
      setSelfArrangementDraft({
        ...editingSelfArrangementDraft,
        ...nextDraft,
        source: editingSelfArrangementDraft.source,
      });
      setEditingSelfArrangementDraft(null);
      setSelfArrangementMessage("");
    },
    [editingSelfArrangementDraft]
  );

  const cancelSelfArrangementDraft = React.useCallback(() => {
    setSelfArrangementDraft(null);
    setSelfArrangementMessage(t("arrangements.cancelled"));
  }, [t]);

  const createSelfRecord = React.useCallback((content: string) => {
    const timestamp = Date.now();
    setCreatedSelfRecords((prev) => {
      const nextRecords = [
        ...prev,
        {
          uid: `self-${timestamp}`,
          text_content: content,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
        },
      ];
      persistCreatedSelfRecords(nextRecords);
      return nextRecords;
    });
  }, []);

  const createRecordExtension = React.useCallback((parentRecord: RecordItem, content: string) => {
    const timestamp = Date.now();
    setCreatedSelfRecords((prev) => {
      const nextRecords = [
        ...prev,
        {
          uid: `self-extension-${timestamp}`,
          text_content: content,
          send_at: timestamp,
          create_at: timestamp,
          update_at: timestamp,
          referencedRecord: makeRecordReference(parentRecord),
        },
      ];
      persistCreatedSelfRecords(nextRecords);
      return nextRecords;
    });
  }, []);

  const backToDrawer = () => {
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setShowMenu(true);
    setConversationReturnContext({ mode: "drawer" });
  };

  const backToPreviousConversationOrigin = () => {
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setShowMenu(false);

    if (conversationReturnContext.mode === "previous") {
      setRecordDetail(conversationReturnContext.recordDetail);
      setRecordSnapshot(conversationReturnContext.recordSnapshot);
    }

    setConversationReturnContext({ mode: "drawer" });
  };

  const handleConversationBack = () => {
    if (conversationReturnContext.mode === "drawer") {
      backToDrawer();
      return;
    }

    backToPreviousConversationOrigin();
  };

  const openAiConversation = React.useCallback(
    (
      targetIndex: number | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      markAiConversationAsRead();
      setConversationReturnContext(returnContext);
      setAiConversationTargetIndex(targetIndex);
      setShowMenu(false);
      setShowSendToSelf(false);
      setShowTestConversation(false);
      setShowAiConversation(true);
    },
    [markAiConversationAsRead]
  );

  const openSendToSelf = React.useCallback(
    (
      targetUid: string | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      setConversationReturnContext(returnContext);
      setShowMenu(false);
      setSendToSelfTargetUid(targetUid);
      setShowAiConversation(false);
      setShowTestConversation(false);
      setShowSendToSelf(true);
    },
    []
  );

  const markTestConversationAsRead = React.useCallback(
    (conversationId: string) => {
      const latestMessageTime = testMessages.reduce((latest, message) => {
        if (message.conversationId !== conversationId) return latest;
        return Math.max(latest, message.sentAt);
      }, 0);

      setTestReadState((prev) => {
        const nextReadState = {
          ...prev,
          [conversationId]: latestMessageTime || Date.now(),
        };
        persistTestReadState(nextReadState);
        return nextReadState;
      });
    },
    [testMessages]
  );

  const openTestConversation = React.useCallback(
    (
      conversationId: string,
      targetUid: string | null = null,
      returnContext: ConversationReturnContext = { mode: "drawer" }
    ) => {
      markTestConversationAsRead(conversationId);
      setConversationReturnContext(returnContext);
      setActiveTestIdentityId(conversationId);
      setTestConversationTargetUid(targetUid);
      setShowMenu(false);
      setShowAiConversation(false);
      setShowSendToSelf(false);
      setShowTestConversation(true);
    },
    [markTestConversationAsRead]
  );

  const returnToHomeFromNotification = React.useCallback(() => {
    if (typeof window !== "undefined") {
      window.focus();
    }

    setShowSearch(false);
    setShowMenu(false);
    setShowAnswerGuide(false);
    setShowAiConversation(false);
    setShowSendToSelf(false);
    setShowTestConversation(false);
    setConversationReturnContext({ mode: "drawer" });
    setAiConversationTargetIndex(null);
    setSendToSelfTargetUid(null);
    setActiveTestIdentityId(null);
    setTestConversationTargetUid(null);
    setSettingsView(null);
    setRecordDetail(null);
    setRecordSnapshot(null);
    onNavigate("records");
  }, [onNavigate]);

  const showBrowserMessageNotification = React.useCallback(
    (summary: TestConversationSummary, message: TestMessage) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;

      const showNotification = () => {
        const notification = new Notification(summary.title, {
          body: message.text,
          icon: "/images/logo-jiwo-green.svg",
          tag: `arkme-demo-message-${message.id}`,
        });
        notification.onclick = () => {
          notification.close();
          returnToHomeFromNotification();
        };
      };

      if (Notification.permission === "granted") {
        showNotification();
        return;
      }

      if (
        Notification.permission === "default" &&
        shouldRequestBrowserNotificationPermission()
      ) {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            showNotification();
          }
        });
      }
    },
    [returnToHomeFromNotification]
  );

  React.useEffect(() => {
    if (!showTestConversation || !activeTestIdentityId) return;
    markTestConversationAsRead(activeTestIdentityId);
  }, [
    activeTestIdentityId,
    markTestConversationAsRead,
    showTestConversation,
    testMessages.length,
  ]);

  React.useEffect(() => {
    const identityMessages = testMessages.filter(
      (message) => message.sender === "identity"
    );

    if (!initializedBrowserNotificationMessagesRef.current) {
      identityMessages.forEach((message) => {
        browserNotifiedMessageIdsRef.current.add(message.id);
      });
      initializedBrowserNotificationMessagesRef.current = true;
      return;
    }

    const newIdentityMessages = identityMessages.filter(
      (message) => !browserNotifiedMessageIdsRef.current.has(message.id)
    );
    if (newIdentityMessages.length === 0) return;

    newIdentityMessages.forEach((message) => {
      browserNotifiedMessageIdsRef.current.add(message.id);
    });

    const latestMessage = newIdentityMessages.reduce((latest, message) =>
      message.sentAt > latest.sentAt ? message : latest
    );
    if (
      showTestConversation &&
      activeTestIdentityId === latestMessage.conversationId
    ) {
      return;
    }

    const summary = testConversationSummaries.find(
      (item) => item.conversationId === latestMessage.conversationId
    );
    if (!summary) return;

    showBrowserMessageNotification(summary, latestMessage);
  }, [
    activeTestIdentityId,
    showBrowserMessageNotification,
    showTestConversation,
    testConversationSummaries,
    testMessages,
  ]);

  const openHomeMessagePreview = React.useCallback(() => {
    if (!homeMessagePreview) return;

    const returnContext: ConversationReturnContext = {
      mode: "previous",
      recordDetail: null,
      recordSnapshot: null,
    };
    openTestConversation(
      homeMessagePreview.summary.conversationId,
      `test-${homeMessagePreview.message.id}`,
      returnContext
    );
  }, [homeMessagePreview, openTestConversation]);

  const createTestReply = React.useCallback((summary: TestConversationSummary, content: string) => {
    const reply = createTestReplyMessage(
      summary.conversationId,
      content,
      summary.conversationType
    );
    setTestMessages((prev) => {
      const nextMessages = [...prev, reply];
      persistTestMessages(nextMessages);
      return nextMessages;
    });
    markTestConversationAsRead(summary.conversationId);
    setTestConversationTargetUid(`test-${reply.id}`);
  }, [markTestConversationAsRead]);

  const openSourceConversation = React.useCallback(
    (source: RecordSourceConversation) => {
      const returnContext: ConversationReturnContext = {
        mode: "previous",
        recordDetail,
        recordSnapshot,
      };

      setRecordDetail(null);
      setRecordSnapshot(null);

      if (source.type === "ai" && typeof source.entryIndex === "number") {
        openAiConversation(source.entryIndex, returnContext);
        return;
      }

      if (source.type === "test" && source.conversationId) {
        openTestConversation(source.conversationId, source.recordUid ?? null, returnContext);
        return;
      }

      openSendToSelf(source.recordUid ?? null, returnContext);
    },
    [
      openAiConversation,
      openSendToSelf,
      openTestConversation,
      recordDetail,
      recordSnapshot,
    ]
  );

  const renderMainContent = () => {
    if (recordDetail) {
      return (
        <RecordFullDetailScreen
          record={recordDetail}
          extensionRecords={recordDetailExtensionRecords}
          onBack={() => setRecordDetail(null)}
          onCreateExtension={createRecordExtension}
          onOpenSource={openSourceConversation}
        />
      );
    }

    if (settingsView === "appearance") {
      return <AppearanceStyleScreen onBack={() => setSettingsView("settings")} />;
    }

    if (settingsView === "about") {
      return <AboutScreen onBack={() => setSettingsView(null)} />;
    }

    if (settingsView === "settings") {
      return (
        <SettingsScreen
          onBack={() => setSettingsView(null)}
          onOpenAppearance={() => setSettingsView("appearance")}
          arrangementAiConfig={arrangementAiConfig}
          onChangeArrangementAiConfig={updateArrangementAiConfig}
        />
      );
    }

    if (showAiConversation) {
      return (
        <AiToolConversationChat
          onBack={handleConversationBack}
          targetIndex={aiConversationTargetIndex}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
        />
      );
    }

    if (editingSelfArrangementDraft) {
      return (
        <ArrangementDraftEditScreen
          title={t("arrangements.editTitle")}
          initialDraft={editingSelfArrangementDraft}
          onBack={() => setEditingSelfArrangementDraft(null)}
          onSave={saveEditingSelfArrangementDraft}
        />
      );
    }

    if (showSendToSelf) {
      return (
        <SendToSelfConversationChat
          records={selfRecords}
          targetUid={sendToSelfTargetUid}
          onBack={handleConversationBack}
          onCreateRecord={createSelfRecord}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
          pendingArrangementDraft={selfArrangementDraft}
          arrangementMessage={selfArrangementMessage}
          recognizingArrangementUid={recognizingSelfArrangementUid}
          onRecognizeRecord={(record) => {
            void recognizeSelfRecordAsArrangement(record, "manual");
          }}
          onConfirmArrangement={confirmSelfArrangementDraft}
          onCancelArrangement={cancelSelfArrangementDraft}
          onEditArrangement={() => {
            if (selfArrangementDraft) setEditingSelfArrangementDraft(selfArrangementDraft);
          }}
        />
      );
    }

    if (showTestConversation && activeTestConversationSummary) {
      return (
        <TestIdentityConversationChat
          summary={activeTestConversationSummary}
          targetUid={testConversationTargetUid}
          onBack={handleConversationBack}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
          onCreateReply={(content) => createTestReply(activeTestConversationSummary, content)}
          pendingArrangementDraft={selfArrangementDraft}
          arrangementMessage={selfArrangementMessage}
          recognizingArrangementUid={recognizingSelfArrangementUid}
          onRecognizeRecord={(record) => {
            void recognizeTestRecordAsArrangement(activeTestConversationSummary, record);
          }}
          onConfirmArrangement={confirmSelfArrangementDraft}
          onCancelArrangement={cancelSelfArrangementDraft}
          onEditArrangement={() => {
            if (selfArrangementDraft) setEditingSelfArrangementDraft(selfArrangementDraft);
          }}
        />
      );
    }

    if (showAnswerGuide) {
      return <AnswerGuideChat onBack={backToDrawer} />;
    }

    if (showSearch) {
      return (
        <SearchScreen
          searchQuery={searchQuery}
          searchHistory={searchHistory}
          records={mineStatisticRecords}
          onChangeSearchQuery={setSearchQuery}
          onCommitSearch={commitSearchKeyword}
          onClose={() => {
            commitSearchKeyword(searchQuery);
            setShowSearch(false);
          }}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
          onOpenSourceConversation={openSourceConversation}
        />
      );
    }

    if (currentPage === "mine") {
      return (
        <MinePreview
          records={mineStatisticRecords}
          onOpenSettings={() => setSettingsView("settings")}
          onOpenAbout={() => setSettingsView("about")}
        />
      );
    }

    if (currentPage === "arrangements") {
      return (
        <ArrangementsScreen
          arrangements={arrangements}
          aiConfig={arrangementAiConfig}
          contextRefs={arrangementContextRefs}
          dailyReviewSuggestion={dailyReviewSuggestion}
          dailyReviewMessage={dailyReviewMessage}
          isDailyReviewing={isDailyReviewing}
          openArrangementId={arrangementToOpenId}
          onOpenedArrangement={() => setArrangementToOpenId(null)}
          onAddArrangement={(arrangement) =>
            updateArrangements((prev) => [arrangement, ...prev])
          }
          onUpdateArrangement={(arrangement) =>
            updateArrangements((prev) =>
              prev.map((item) => (item.id === arrangement.id ? arrangement : item))
            )
          }
          onOpenContext={(ref) => {
            if (ref.conversationType === "self") {
              openSendToSelf(ref.messageId);
              return;
            }
            openTestConversation(ref.conversationId, `test-${ref.messageId}`);
          }}
          onConfirmDailyReviewSuggestion={confirmDailyReviewSuggestion}
          onCancelDailyReviewSuggestion={cancelDailyReviewSuggestion}
        />
      );
    }

    if (currentPage === "insight") {
      return <InsightPreview />;
    }

    return (
      <div className="flex h-full flex-col bg-bg">
        <MobileHeader
          onMenuClick={() => setShowMenu(true)}
          onSearchClick={() => setShowSearch(true)}
          unreadCount={unreadAiConversationCount + unreadTestConversationCount}
        />
        {homeMessagePreview && (
          <div className="shrink-0 bg-bg px-4 pb-2">
            <HomeNewMessagePreview
              preview={homeMessagePreview}
              onOpen={openHomeMessagePreview}
            />
          </div>
        )}
        <Records
          compactHeader
          demoRecords={[...demoRecords, ...testDemoReplyRecords]}
          aiConversationEntries={aiConversationLogEntries}
          selfRecords={selfRecords}
          onCreateSelfRecord={createSelfRecord}
          onOpenSourceConversation={openSourceConversation}
          onOpenRecordDetail={setRecordDetail}
          onOpenRecordSnapshot={setRecordSnapshot}
        />
      </div>
    );
  };

  return (
    <AppShell
      mainPane={
        <div className="relative flex min-h-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-hidden">{renderMainContent()}</main>
          {dueArrangement && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex max-h-[50%] justify-center px-4 pt-4">
              <div className="pointer-events-auto w-full max-w-[520px]">
                <DueArrangementBanner
                  arrangement={dueArrangement}
                  locale={resolvedLocale}
                  onOpen={() => openDueArrangement(dueArrangement)}
                  onMoveLater={() => updateArrangementStatus(dueArrangement, "later")}
                  onDone={() => updateArrangementStatus(dueArrangement, "done")}
                />
              </div>
            </div>
          )}
          {!recordDetail && !showSearch && !showAnswerGuide && !showAiConversation && !showSendToSelf && !showTestConversation && !settingsView && (
            <MobileBottomNavigation currentPage={currentPage} onNavigate={onNavigate} />
          )}
          <MobileSideDrawer
            open={showMenu}
            onClose={() => setShowMenu(false)}
            onOpenAnswerGuide={() => {
              setShowMenu(false);
              setShowAnswerGuide(true);
            }}
            onOpenAiConversation={() => {
              openAiConversation(null);
            }}
            onOpenSendToSelf={() => {
              openSendToSelf(null);
            }}
            onOpenTestConversation={(conversationId) => {
              openTestConversation(conversationId);
            }}
            unreadAiConversationCount={unreadAiConversationCount}
            selfRecords={selfRecords}
            testConversations={testConversationSummaries}
          />
          <RecordDetailSheet
            record={recordSnapshot}
            onClose={() => setRecordSnapshot(null)}
            onOpenSource={openSourceConversation}
          />
        </div>
      }
    />
  );
}

function SearchScreen({
  searchQuery,
  searchHistory,
  records,
  onChangeSearchQuery,
  onCommitSearch,
  onClose,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
  onOpenSourceConversation,
}: {
  searchQuery: string;
  searchHistory: string[];
  records: RecordItem[];
  onChangeSearchQuery: (value: string) => void;
  onCommitSearch: (value: string) => void;
  onClose: () => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
  onOpenSourceConversation: (source: RecordSourceConversation) => void;
}) {
  const { resolvedTheme, t } = usePreferences();
  const [activeTab, setActiveTab] = React.useState<"records" | "topics">("records");
  const [activeQuickType, setActiveQuickType] = React.useState<QuickSearchType | null>(null);
  const keyword = searchQuery.trim().toLowerCase();
  const hasSearchCondition = keyword.length > 0 || activeQuickType !== null;
  const searchTags = React.useMemo(
    () =>
      t("search.defaultTags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [t]
  );
  const emptyImageSrc =
    resolvedTheme === "dark"
      ? "/images/image_search_empty.png"
      : "/images/image_search_empty_light.png";

  const filteredRecords = React.useMemo(
    () =>
      records.filter((record) => {
        const content = record.text_content.toLowerCase();
        const matchesKeyword = !keyword || content.includes(keyword);
        const matchesQuickType =
          activeQuickType === null || recordMatchesQuickType(record, activeQuickType);
        return matchesKeyword && matchesQuickType;
      }),
    [activeQuickType, keyword, records]
  );

  const topicGroups = React.useMemo(
    () => buildSearchTopicGroups(records, t).filter((topic) => {
      if (!keyword) return topic.count > 0;
      return (
        topic.title.toLowerCase().includes(keyword) ||
        topic.description.toLowerCase().includes(keyword)
      );
    }),
    [keyword, records, t]
  );

  const handleKeywordSelect = (value: string) => {
    setActiveQuickType(null);
    onChangeSearchQuery(value);
    onCommitSearch(value);
  };

  const handleQuickSearch = (type: QuickSearchType) => {
    setActiveQuickType(type);
    setActiveTab("records");
    onChangeSearchQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-[50px] shrink-0 items-center bg-bg pl-2.5">
        <div className="relative min-w-0 flex-1">
          <input
            value={searchQuery}
            onChange={(event) => {
              onChangeSearchQuery(event.target.value);
              setActiveQuickType(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitSearch(searchQuery);
                event.currentTarget.blur();
              }
            }}
            onBlur={() => onCommitSearch(searchQuery)}
            autoFocus
            placeholder={t("search.placeholder")}
            className="h-10 w-full rounded-[12px] bg-surface px-2.5 pr-12 text-[16px] leading-10 text-text outline-none transition placeholder:text-input-placeholder focus:bg-input-bg-focus"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-fill-2 text-text-tertiary transition active:scale-[0.94]"
              onClick={() => {
                onChangeSearchQuery("");
                setActiveQuickType(null);
              }}
              aria-label={t("search.clear")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 px-[19px] py-2 text-[16px] leading-6 text-text transition active:scale-[0.96]"
          onClick={onClose}
        >
          {t("search.cancel")}
        </button>
      </header>

      {!hasSearchCondition ? (
        <SearchLanding
          searchHistory={searchHistory}
          searchTags={searchTags}
          onKeywordSelect={handleKeywordSelect}
          onQuickSearch={handleQuickSearch}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <SearchTabs
            activeTab={activeTab}
            activeQuickType={activeQuickType}
            onChangeTab={setActiveTab}
            onClearQuickType={() => setActiveQuickType(null)}
          />
          {activeTab === "records" ? (
            filteredRecords.length > 0 ? (
              <ChatList
                records={filteredRecords}
                hasMore={false}
                loading={false}
                onLoadMore={() => undefined}
                onOpenSourceConversation={onOpenSourceConversation}
                onOpenRecordDetail={onOpenRecordDetail}
                onOpenRecordSnapshot={onOpenRecordSnapshot}
              />
            ) : (
              <SearchEmptyState
                imageSrc={emptyImageSrc}
                keyword={searchQuery || quickSearchLabel(activeQuickType, t)}
              />
            )
          ) : topicGroups.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {topicGroups.map((topic) => (
                  <button
                    key={topic.key}
                    type="button"
                    className="flex min-h-[62px] w-full items-center rounded-[12px] bg-surface px-3 text-left transition active:scale-[0.99]"
                    onClick={() => handleKeywordSelect(topic.searchKeyword)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">
                      {topic.icon}
                    </div>
                    <div className="ml-3 min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium leading-5 text-text">
                        {topic.title}
                      </p>
                      <p className="mt-1 truncate text-xs leading-4 text-text-tertiary">
                        {formatTemplate(t("search.topicCount"), {
                          count: String(topic.count),
                        })}
                      </p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-disabled" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <SearchEmptyState imageSrc={emptyImageSrc} keyword={searchQuery} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchLanding({
  searchHistory,
  searchTags,
  onKeywordSelect,
  onQuickSearch,
}: {
  searchHistory: string[];
  searchTags: string[];
  onKeywordSelect: (value: string) => void;
  onQuickSearch: (type: QuickSearchType) => void;
}) {
  const { t } = usePreferences();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-[22px]">
      {searchHistory.length > 0 && (
        <section className="pb-[22px]">
          <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
            {t("search.recent")}
          </p>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {searchHistory.map((keyword) => (
              <SearchChip
                key={keyword}
                label={keyword}
                textClassName="text-text"
                onClick={() => onKeywordSelect(keyword)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
          {t("search.quickSearch")}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {quickSearchTypes.map((type) => (
            <SearchChip
              key={type}
              label={quickSearchLabel(type, t)}
              textClassName="text-link"
              onClick={() => onQuickSearch(type)}
            />
          ))}
        </div>
      </section>

      {searchTags.length > 0 && (
        <section className="mt-[30px]">
          <p className="mb-2 px-3 text-[12px] leading-4 text-text-tertiary">
            {t("search.tags")}
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
            {searchTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="px-2 py-[3px] text-[14px] leading-5 text-link transition active:scale-[0.97]"
                onClick={() => onKeywordSelect(tag.replace(/^#/, ""))}
              >
                {tag.startsWith("#") ? tag : `#${tag}`}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SearchTabs({
  activeTab,
  activeQuickType,
  onChangeTab,
  onClearQuickType,
}: {
  activeTab: "records" | "topics";
  activeQuickType: QuickSearchType | null;
  onChangeTab: (tab: "records" | "topics") => void;
  onClearQuickType: () => void;
}) {
  const { t } = usePreferences();
  const tabs: Array<{ key: "records" | "topics"; label: string }> = [
    { key: "records", label: t("search.tabRecords") },
    { key: "topics", label: t("search.tabTopics") },
  ];

  return (
    <div className="flex h-[30px] shrink-0 items-center bg-gray-8">
      <div className="ml-[18px] flex min-w-0 flex-1 items-center gap-[30px]">
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={cn(
                "relative h-[30px] px-0 pb-1 text-[14px] leading-[24px] transition",
                selected ? "font-semibold text-primary" : "font-normal text-text"
              )}
              onClick={() => onChangeTab(tab.key)}
            >
              {tab.label}
              {selected && (
                <span className="absolute bottom-0 left-1/2 h-0.5 w-2.5 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
      {activeQuickType && (
        <button
          type="button"
          className="mr-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-[12px] leading-5 text-primary transition active:scale-[0.96]"
          onClick={onClearQuickType}
        >
          {quickSearchLabel(activeQuickType, t)}
        </button>
      )}
      <button
        type="button"
        className="mr-[18px] flex h-[21px] w-[23px] items-center justify-center text-text-muted transition active:scale-[0.96]"
        aria-label={t("search.filter")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function SearchChip({
  label,
  textClassName,
  onClick,
}: {
  label: string;
  textClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "shrink-0 rounded-full border border-[var(--record-topic-border)] px-3 py-[3px] text-[14px] leading-5 transition active:scale-[0.97]",
        textClassName
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SearchEmptyState({ imageSrc, keyword }: { imageSrc: string; keyword: string }) {
  const { t } = usePreferences();
  const label = keyword.trim() || t("search.label");

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center px-4 pt-20 text-center">
      <div>
        <img src={imageSrc} alt="" className="mx-auto w-[140px]" aria-hidden="true" />
        <p className="mt-2.5 whitespace-pre-line text-[14px] leading-5 text-text-tertiary">
          {formatTemplate(t("search.noResult"), { keyword: label })}
        </p>
      </div>
    </div>
  );
}

function quickSearchLabel(type: QuickSearchType | null, t: (key: string) => string) {
  if (!type) return "";
  return t(`search.quick.${type}`);
}

function recordMatchesQuickType(record: RecordItem, type: QuickSearchType) {
  const content = record.text_content.toLowerCase();
  const sourceLabel = record.sourceConversation?.label.toLowerCase() ?? "";
  const combined = `${content} ${sourceLabel}`;

  switch (type) {
    case "image":
      return /鍥剧墖|鐓х墖|瑙嗛|image|photo|video/.test(combined);
    case "audio":
      return /璇煶|闊抽|褰曢煶|voice|audio|recording/.test(combined);
    case "link":
      return /閾炬帴|http|link|url/.test(combined);
    case "file":
      return /鏂囦欢|鏂囨。|file|document/.test(combined);
    case "longArticle":
      return Array.from(record.text_content).length >= 80;
    case "contact":
      return /鑱旂郴浜簗鍚屼簨|鍊欓€変汉|鐢ㄦ埛|ai|contact|user/.test(combined);
    default:
      return true;
  }
}

function buildSearchTopicGroups(records: RecordItem[], t: (key: string) => string) {
  const quickNotes = records.filter((record) => !record.sourceConversation);
  const selfNotes = records.filter((record) => record.sourceConversation?.type === "self");
  const aiNotes = records.filter((record) => record.sourceConversation?.type === "ai");

  return [
    {
      key: "quick",
      icon: t("search.topicQuickIcon"),
      title: t("records.title"),
      description: t("recordDetail.quickNoteSource"),
      count: quickNotes.length,
      searchKeyword: t("records.title"),
    },
    {
      key: "self",
      icon: t("sendToSelf.icon"),
      title: t("sendToSelf.title"),
      description: t("sendToSelf.privateTag"),
      count: selfNotes.length,
      searchKeyword: t("sendToSelf.title"),
    },
    {
      key: "ai",
      icon: "AI",
      title: t("ai.title"),
      description: t("ai.rounds"),
      count: aiNotes.length,
      searchKeyword: "AI",
    },
  ];
}

function MobileHeader({
  onMenuClick,
  onSearchClick,
  unreadCount,
}: {
  onMenuClick: () => void;
  onSearchClick: () => void;
  unreadCount: number;
}) {
  const { appIcon, resolvedTheme, t } = usePreferences();
  const logoSrc = getJiwoLogoSrc(appIcon, resolvedTheme);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-bg px-4">
      <button
        type="button"
        className="flex h-9 items-center gap-[2px] text-text transition active:scale-[0.96]"
        onClick={onMenuClick}
        aria-label={t("common.openMenu")}
      >
        <span className="flex h-9 w-5 items-center justify-center">
          <svg
            className="h-6 w-5"
            viewBox="0 0 20 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M5 6.25C5 5.55964 5.55964 5 6.25 5H12.75C13.4404 5 14 5.55964 14 6.25C14 6.94036 13.4404 7.5 12.75 7.5H6.25C5.55964 7.5 5 6.94036 5 6.25ZM5 12.25C5 11.5596 5.55964 11 6.25 11H15.75C16.4404 11 17 11.5596 17 12.25C17 12.9404 16.4404 13.5 15.75 13.5H6.25C5.55964 13.5 5 12.9404 5 12.25ZM6.25 17C5.55964 17 5 17.5596 5 18.25C5 18.9404 5.55964 19.5 6.25 19.5H9.75C10.4404 19.5 11 18.9404 11 18.25C11 17.5596 10.4404 17 9.75 17H6.25Z"
              fill="currentColor"
            />
          </svg>
        </span>
        {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        <img src={logoSrc} alt="" className="h-8 w-8" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onSearchClick}
          aria-label={t("search.label")}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 25 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.0969 19.0453C14.9754 19.0453 18.1196 15.9012 18.1196 12.0227C18.1196 8.14416 14.9754 5 11.0969 5C7.21838 5 4.07422 8.14416 4.07422 12.0227C4.07422 15.9012 7.21838 19.0453 11.0969 19.0453ZM11.0969 21.0453C16.08 21.0453 20.1196 17.0058 20.1196 12.0227C20.1196 7.03959 16.08 3 11.0969 3C6.11381 3 2.07422 7.03959 2.07422 12.0227C2.07422 17.0058 6.11381 21.0453 11.0969 21.0453Z"
              fill="currentColor"
            />
            <path
              d="M16.8203 17.8184L19.7295 20.7282"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

function HomeNewMessagePreview({
  preview,
  onOpen,
}: {
  preview: HomeMessagePreview;
  onOpen: () => void;
}) {
  const { t } = usePreferences();
  const unreadLabel = formatUnreadCount(preview.unreadCount);

  return (
    <button
      type="button"
      className="flex w-full items-center rounded-[16px] border border-border-light bg-surface px-3 py-2.5 text-left shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition hover:bg-[var(--record-card-hover-bg)] active:scale-[0.99] dark:shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
      onClick={onOpen}
      aria-label={`${t("homeMessagePreview.label")}，${preview.summary.title}`}
    >
      <AvatarUnreadWrap unreadCount={preview.unreadCount}>
        <TestConversationAvatar summary={preview.summary} className="h-[34px] w-[34px]" />
      </AvatarUnreadWrap>
      <div className="ml-3 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[14px] font-medium leading-5 text-text">
              {preview.summary.title}
            </p>
            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-[2px] text-[10px] font-medium leading-3 text-primary">
              {t("homeMessagePreview.label")}
            </span>
          </div>
          <span className="shrink-0 text-[11px] leading-4 text-text-tertiary">
            {formatBubbleTime(preview.message.sentAt)}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs leading-4 text-text-muted">
            {preview.message.text}
          </p>
          <span className="shrink-0 text-[11px] leading-4 text-primary">
            {unreadLabel}
            {t("common.unreadCount")}
          </span>
        </div>
      </div>
      <svg
        className="ml-2 h-4 w-4 shrink-0 text-text-tertiary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

function getLatestRecord(records: RecordItem[]) {
  return records.reduce<RecordItem | null>((latest, record) => {
    if (!latest || record.send_at > latest.send_at) return record;
    return latest;
  }, null);
}

function MobileSideDrawer({
  open,
  onClose,
  onOpenAnswerGuide,
  onOpenAiConversation,
  onOpenSendToSelf,
  onOpenTestConversation,
  unreadAiConversationCount,
  selfRecords,
  testConversations,
}: {
  open: boolean;
  onClose: () => void;
  onOpenAnswerGuide: () => void;
  onOpenAiConversation: () => void;
  onOpenSendToSelf: () => void;
  onOpenTestConversation: (conversationId: string) => void;
  unreadAiConversationCount: number;
  selfRecords: RecordItem[];
  testConversations: TestConversationSummary[];
}) {
  const { t } = usePreferences();
  const latestSelfRecord = React.useMemo(
    () => getLatestRecord(selfRecords),
    [selfRecords]
  );
  const latestAiEntry = aiConversationLogEntries.at(-1);
  const latestAiTime = latestAiEntry
    ? parseAiConversationTimestamp(latestAiEntry.timestamp, 0)
    : 0;
  const conversationItems = React.useMemo(
    () =>
      [
        {
          key: "self",
          latestAt: latestSelfRecord?.send_at ?? 0,
          node: (
            <SendToSelfDrawerItem
              records={selfRecords}
              latestRecord={latestSelfRecord}
              onClick={onOpenSendToSelf}
            />
          ),
        },
        {
          key: "ai",
          latestAt: latestAiTime,
          node: (
            <AiToolConversationItem
              onClick={onOpenAiConversation}
              unreadCount={unreadAiConversationCount}
              latestAt={latestAiTime}
            />
          ),
        },
        ...testConversations.map((summary) => ({
          key: `test-${summary.conversationId}`,
          latestAt: summary.latestMessage.sentAt,
          node: (
            <TestConversationDrawerItem
              summary={summary}
              onClick={() => onOpenTestConversation(summary.conversationId)}
            />
          ),
        })),
      ].sort((a, b) => b.latestAt - a.latestAt),
    [
      latestAiTime,
      latestSelfRecord,
      onOpenAiConversation,
      onOpenSendToSelf,
      onOpenTestConversation,
      selfRecords,
      testConversations,
      unreadAiConversationCount,
    ]
  );

  return (
    <div
      className={cn(
        "absolute inset-x-0 -top-9 z-50 h-[calc(100%+36px)] transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 bg-overlay-light transition-opacity duration-150 ease-out",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-label={t("drawer.closeMask")}
      />
      <aside
        className={cn(
          "absolute left-0 top-0 flex h-full w-[296px] max-w-[82%] flex-col bg-surface px-4 pb-4 pt-[52px] shadow-[8px_0_32px_rgba(0,0,0,0.12)] transition-transform duration-[180ms] ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-label={t("drawer.label")}
      >
        <h2 className="-mx-1 px-3 pb-[5px] pt-[3px] text-xl font-semibold leading-[1.2] text-text">
          {t("drawer.title")}
        </h2>

        <nav className="-mx-4 mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-3">
          <GuideConversationItem onClick={onOpenAnswerGuide} />
          {conversationItems.map((item) => (
            <React.Fragment key={item.key}>{item.node}</React.Fragment>
          ))}
        </nav>

        <div className="mt-auto rounded-[12px] bg-bg px-3 py-3">
          <p className="text-xs font-semibold text-text">{t("drawer.footerTitle")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
            {t("drawer.footerDesc")}
          </p>
        </div>
      </aside>
    </div>
  );
}

function SendToSelfDrawerItem({
  records,
  latestRecord,
  onClick,
}: {
  records: RecordItem[];
  latestRecord: RecordItem | null;
  onClick: () => void;
}) {
  const { t } = usePreferences();

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <SendToSelfIcon className="h-[30px] w-[30px] shrink-0" />
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center">
            <p className="truncate text-[16px] font-normal leading-6 text-text">
              {t("sendToSelf.title")}
            </p>
            <OverviewEntryTag label={t("sendToSelf.privateTag")} />
          </div>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {latestRecord
              ? formatBubbleTime(latestRecord.send_at)
              : formatRoundCount(records.length, t("sendToSelf.recordCount"))}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {latestRecord?.text_content ?? t("sendToSelf.emptyPreview")}
        </p>
      </div>
    </button>
  );
}

function GuideConversationItem({ onClick }: { onClick: () => void }) {
  const { t } = usePreferences();

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-[11px] font-semibold text-primary">
        {t("guide.avatar")}
      </div>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {t("guide.title")}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {t("guide.pinned")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {t("guide.subtitle")}
        </p>
      </div>
    </button>
  );
}

function AvatarUnreadWrap({
  unreadCount,
  children,
}: {
  unreadCount: number;
  children: React.ReactNode;
}) {
  const label = formatUnreadCount(unreadCount);

  return (
    <span className="relative shrink-0">
      {children}
      {unreadCount > 0 && (
        <span
          className={cn(
            "absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-primary text-[10px] font-normal leading-none text-on-primary",
            label.length > 1 ? "px-[4px]" : "px-0"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

function AiToolConversationItem({
  onClick,
  unreadCount,
  latestAt,
}: {
  onClick: () => void;
  unreadCount: number;
  latestAt: number;
}) {
  const { t } = usePreferences();
  const latestEntry = aiConversationLogEntries.at(-1);

  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <AvatarUnreadWrap unreadCount={unreadCount}>
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
          AI
        </div>
      </AvatarUnreadWrap>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {t("ai.title")}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {latestAt > 0
              ? formatBubbleTime(latestAt)
              : `${aiConversationLogEntries.length}${t("ai.rounds")}`}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {latestEntry?.userInput ?? t("ai.emptyTitle")}
        </p>
      </div>
    </button>
  );
}

function TestConversationDrawerItem({
  summary,
  onClick,
}: {
  summary: TestConversationSummary;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center px-4 py-2.5 text-left transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <AvatarUnreadWrap unreadCount={summary.unreadCount}>
        <TestConversationAvatar summary={summary} className="h-[30px] w-[30px]" />
      </AvatarUnreadWrap>
      <div className="ml-[7px] min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[15px] font-medium leading-5 text-text">
            {summary.title}
          </p>
          <span className="shrink-0 text-[11px] text-text-tertiary">
            {formatBubbleTime(summary.latestMessage.sentAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs leading-4 text-text-muted">
          {summary.conversationType === "group" &&
          summary.latestMessage.sender === "identity"
            ? `${summary.memberIdentities.find((identity) => identity.id === summary.latestMessage.identityId)?.name ?? "成员"}：${summary.latestMessage.text}`
            : summary.latestMessage.text}
        </p>
      </div>
    </button>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const { t } = usePreferences();
  const label = formatUnreadCount(count);

  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-normal leading-[14px] text-on-primary",
        label.length > 1 ? "px-[5px]" : "px-0"
      )}
      aria-label={`${label}${t("common.unreadCount")}`}
    >
      {label}
    </span>
  );
}

function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function AiToolConversationChat({
  onBack,
  targetIndex,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
}: {
  onBack: () => void;
  targetIndex?: number | null;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
}) {
  const { t } = usePreferences();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const entryRefs = React.useRef<Array<HTMLElement | null>>([]);
  const fallbackBaseTime = React.useMemo(() => Date.now(), []);

  const makeUserInputRecord = React.useCallback(
    (entry: (typeof aiConversationLogEntries)[number], index: number): RecordItem => {
      const timestamp = parseAiConversationTimestamp(
        entry.timestamp,
        fallbackBaseTime + index
      );
      return {
        uid: `ai-conversation-user-${index}`,
        text_content: entry.userInput,
        send_at: timestamp,
        create_at: timestamp,
        update_at: timestamp,
        sourceConversation: {
          type: "ai",
          label: t("ai.title"),
          actionLabel: t("records.openSource"),
          iconLabel: "AI",
          entryIndex: index,
        },
      };
    },
    [fallbackBaseTime, t]
  );

  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (targetIndex !== null && targetIndex !== undefined) {
      entryRefs.current[targetIndex]?.scrollIntoView({
        block: "center",
      });
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [targetIndex]);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
            AI
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {t("ai.title")}
            </h1>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {formatRoundCount(aiConversationLogEntries.length, t("ai.rounds"))}
            </p>
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-5 pt-4"
      >
        {aiConversationLogEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-sm font-semibold text-primary">
                AI
              </div>
              <p className="mt-4 text-sm font-semibold text-text">
                {t("ai.emptyTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {t("ai.emptyDesc")}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-6">
            {aiConversationLogEntries.map((entry, index) => (
              <section
                key={`${entry.timestamp}-${index}`}
                ref={(node) => {
                  entryRefs.current[index] = node;
                }}
                className={cn(
                  "min-w-0 scroll-mt-4 space-y-3 transition-colors duration-300",
                  targetIndex === index && "-m-1 rounded-[18px] bg-primary-soft/70 p-1"
                )}
              >
                <div className="flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
                    {entry.timestamp}
                  </span>
                </div>

                <div className="flex min-w-0 justify-end gap-2">
                  <div className="-mx-4 min-w-0 flex-1">
                    {(() => {
                      const userInputRecord = makeUserInputRecord(entry, index);
                      return (
                        <ChatBubble
                          textContent={userInputRecord.text_content}
                          disableAnimation
                          variant="primary"
                          onOpenDetail={() => onOpenRecordDetail(userInputRecord)}
                          onOpenMemorySnapshot={() =>
                            onOpenRecordSnapshot(userInputRecord)
                          }
                        />
                      );
                    })()}
                  </div>
                </div>

                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
                    AI
                  </div>
                  <div className="min-w-0 max-w-[82%]">
                    <p className="mb-1 px-1 text-[11px] leading-4 text-text-tertiary">
                      {t("ai.output")}
                    </p>
                    <div className="max-w-full rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                      <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55] text-text [overflow-wrap:anywhere]">
                        {entry.aiFinalOutput}
                      </p>
                    </div>

                    <div className="mt-2 min-w-0 max-w-full rounded-[10px] bg-surface-muted px-3 py-2">
                      <p className="text-[11px] font-semibold leading-4 text-text">
                        {t("ai.changedFiles")}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {entry.changedFiles.map((file) => (
                          <li key={file} className="break-words text-[11px] leading-4 text-text-muted [overflow-wrap:anywhere]">
                            {file}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] font-semibold leading-4 text-text">
                        {t("ai.verification")}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {entry.verification.map((item) => (
                          <li key={item} className="break-words text-[11px] leading-4 text-text-muted [overflow-wrap:anywhere]">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SendToSelfConversationChat({
  records,
  targetUid,
  onBack,
  onCreateRecord,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
  pendingArrangementDraft,
  arrangementMessage,
  recognizingArrangementUid,
  onRecognizeRecord,
  onConfirmArrangement,
  onCancelArrangement,
  onEditArrangement,
}: {
  records: RecordItem[];
  targetUid?: string | null;
  onBack: () => void;
  onCreateRecord: (content: string) => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
  pendingArrangementDraft: AiArrangementDraft | null;
  arrangementMessage: string;
  recognizingArrangementUid: string | null;
  onRecognizeRecord: (record: RecordItem) => void;
  onConfirmArrangement: () => void;
  onCancelArrangement: () => void;
  onEditArrangement: () => void;
}) {
  const { t } = usePreferences();
  const recordsWithoutSource = React.useMemo(
    () => records.map(({ sourceConversation: _sourceConversation, ...record }) => record),
    [records]
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <SendToSelfIcon className="h-[30px] w-[30px] shrink-0" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center">
              <h1 className="truncate text-[18px] font-normal leading-6 text-text">
                {t("sendToSelf.title")}
              </h1>
              <OverviewEntryTag label={t("sendToSelf.privateTag")} />
            </div>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {formatRoundCount(records.length, t("sendToSelf.recordCount"))}
            </p>
          </div>
        </div>
      </header>

      <ChatList
        records={recordsWithoutSource}
        hasMore={false}
        loading={false}
        onLoadMore={() => undefined}
        targetRecordUid={targetUid}
        onOpenRecordDetail={onOpenRecordDetail}
        onOpenRecordSnapshot={onOpenRecordSnapshot}
        getRecordMenuActions={(record) => {
          const isRecognizing = recognizingArrangementUid === record.uid;
          return [
            {
              label: isRecognizing
                ? t("arrangements.recognizing")
                : t("arrangements.recognizeSelf"),
              icon: "calendar",
              disabled: Boolean(recognizingArrangementUid),
              onClick: () => onRecognizeRecord(record),
            },
          ];
        }}
      />
      {(pendingArrangementDraft || arrangementMessage) && (
        <div className="shrink-0 border-t border-border-light bg-bg px-4 py-2">
          {pendingArrangementDraft && (
            <ArrangementConfirmationCard
              draft={pendingArrangementDraft}
              onConfirm={onConfirmArrangement}
              onCancel={onCancelArrangement}
              onEdit={onEditArrangement}
              canConfirm={Boolean(pendingArrangementDraft.scheduledDate)}
            />
          )}
          {arrangementMessage && (
            <p className="mb-2 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-4 text-primary">
              {arrangementMessage}
            </p>
          )}
        </div>
      )}
      <ChatInput
        onSubmit={onCreateRecord}
        onVoiceSubmit={() => onCreateRecord(t("records.voiceRecord"))}
      />
    </div>
  );
}

function TestIdentityConversationChat({
  summary,
  targetUid,
  onBack,
  onOpenRecordDetail,
  onOpenRecordSnapshot,
  onCreateReply,
  pendingArrangementDraft,
  arrangementMessage,
  recognizingArrangementUid,
  onRecognizeRecord,
  onConfirmArrangement,
  onCancelArrangement,
  onEditArrangement,
}: {
  summary: TestConversationSummary;
  targetUid?: string | null;
  onBack: () => void;
  onOpenRecordDetail: (record: RecordItem) => void;
  onOpenRecordSnapshot: (record: RecordItem) => void;
  onCreateReply: (content: string) => void;
  pendingArrangementDraft: AiArrangementDraft | null;
  arrangementMessage: string;
  recognizingArrangementUid: string | null;
  onRecognizeRecord: (record: TestConversationRecord) => void;
  onConfirmArrangement: () => void;
  onCancelArrangement: () => void;
  onEditArrangement: () => void;
}) {
  const { resolvedLocale, t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const selfDisplayName = candidateProfile?.name || t("recordDetail.me");
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const recordRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const sortedRecords = React.useMemo(
    () => [...summary.records].sort((a, b) => a.send_at - b.send_at),
    [summary.records]
  );
  const canRecognizeArrangement = summary.conversationType === "private";

  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (targetUid) {
      recordRefs.current.get(targetUid)?.scrollIntoView({ block: "center" });
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [sortedRecords.length, targetUid]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <TestConversationAvatar summary={summary} className="h-8 w-8" />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {summary.title}
            </h1>
            <p className="mt-0.5 truncate text-[11px] leading-3 text-text-tertiary">
              {summary.subtitle}
            </p>
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4"
      >
        <div className="space-y-3">
          {sortedRecords.map((record, index) => {
            const prevRecord = sortedRecords[index - 1];
            const showTime =
              index === 0 || shouldShowConversationTime(prevRecord.send_at, record.send_at);

            return (
              <div
                key={record.uid}
                ref={(node) => {
                  if (node) {
                    recordRefs.current.set(record.uid, node);
                  } else {
                    recordRefs.current.delete(record.uid);
                  }
                }}
                className={cn(
                  "scroll-mt-4",
                  targetUid === record.uid && "rounded-[18px] bg-primary-soft/70 py-1"
                )}
              >
                {showTime && (
                  <div className="mb-3 flex justify-center">
                    <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
                      {formatTimeLabel(record.send_at, {
                        locale: resolvedLocale,
                        today: t("time.today"),
                        yesterday: t("time.yesterday"),
                        dayBeforeYesterday: t("time.dayBeforeYesterday"),
                      })}{" "}
                      {formatBubbleTime(record.send_at)}
                    </span>
                  </div>
                )}
                {record.sender === "demo" ? (
                  <div className="-mx-4">
                    <ChatBubble
                      textContent={record.text_content}
                      disableAnimation
                      variant="primary"
                      topLabel={
                        summary.conversationType === "group" ? selfDisplayName : undefined
                      }
                      onOpenDetail={() => onOpenRecordDetail(record)}
                      onOpenMemorySnapshot={() => onOpenRecordSnapshot(record)}
                      menuActions={
                        canRecognizeArrangement
                          ? [
                              {
                                label:
                                  recognizingArrangementUid === record.uid
                                    ? t("arrangements.recognizing")
                                    : t("arrangements.recognizeSelf"),
                                icon: "calendar",
                                disabled: Boolean(recognizingArrangementUid),
                                onClick: () => onRecognizeRecord(record),
                              },
                            ]
                          : []
                      }
                    />
                    {canRecognizeArrangement && (
                      <div className="flex justify-end px-4 pt-1.5">
                        <button
                          type="button"
                          className="h-7 rounded-full border border-border bg-bg px-2.5 text-[11px] font-semibold text-text-tertiary transition hover:text-text active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onRecognizeRecord(record)}
                          disabled={Boolean(recognizingArrangementUid)}
                        >
                          {recognizingArrangementUid === record.uid
                            ? t("arrangements.recognizing")
                            : t("arrangements.recognizeSelf")}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <TestMessageIdentityAvatar
                      identityId={record.identityId}
                      summary={summary}
                    />
                    <div className="min-w-0 max-w-[82%]">
                      {summary.conversationType === "group" && (
                        <p className="mb-1 px-1 text-[11px] leading-4 text-text-tertiary">
                          {summary.memberIdentities.find(
                            (identity) => identity.id === record.identityId
                          )?.name ?? "群成员"}
                        </p>
                      )}
                      <button
                        type="button"
                        className="max-w-full rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 text-left text-text shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-[var(--record-card-hover-bg)] active:scale-[0.99]"
                        onClick={() => onOpenRecordDetail(record)}
                      >
                        <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
                          {record.text_content}
                        </p>
                      </button>
                      {canRecognizeArrangement && (
                        <button
                          type="button"
                          className="mt-1.5 h-7 rounded-full border border-border bg-bg px-2.5 text-[11px] font-semibold text-text-tertiary transition hover:text-text active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onRecognizeRecord(record)}
                          disabled={Boolean(recognizingArrangementUid)}
                        >
                          {recognizingArrangementUid === record.uid
                            ? t("arrangements.recognizing")
                            : t("arrangements.recognizeSelf")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(pendingArrangementDraft || arrangementMessage) && canRecognizeArrangement && (
            <div className="pt-1">
              {pendingArrangementDraft && (
                <ArrangementConfirmationCard
                  draft={pendingArrangementDraft}
                  onConfirm={onConfirmArrangement}
                  onCancel={onCancelArrangement}
                  onEdit={onEditArrangement}
                  canConfirm={Boolean(pendingArrangementDraft.scheduledDate)}
                />
              )}
              {arrangementMessage && (
                <p className="mt-2 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-4 text-primary">
                  {arrangementMessage}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <ChatInput
        onSubmit={onCreateReply}
        onVoiceSubmit={() => onCreateReply(t("records.voiceRecord"))}
      />
    </div>
  );
}

function shouldShowConversationTime(prevSendAt: number, currentSendAt: number) {
  return Math.abs(currentSendAt - prevSendAt) > 1000 * 60 * 5;
}

function TestIdentityAvatar({
  identity,
  className,
}: {
  identity: TestIdentity;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white",
        className
      )}
      style={{ backgroundColor: identity.color }}
      aria-hidden="true"
    >
      {identity.avatarLabel}
    </div>
  );
}

function TestConversationAvatar({
  summary,
  className,
}: {
  summary: TestConversationSummary;
  className?: string;
}) {
  if (summary.identity) {
    return <TestIdentityAvatar identity={summary.identity} className={className} />;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none text-white",
        className
      )}
      style={{ backgroundColor: summary.color }}
      aria-hidden="true"
    >
      {summary.avatarLabel}
    </div>
  );
}

function TestMessageIdentityAvatar({
  identityId,
  summary,
}: {
  identityId: string;
  summary: TestConversationSummary;
}) {
  const identity =
    summary.memberIdentities.find((item) => item.id === identityId) ?? summary.identity;

  if (identity) {
    return <TestIdentityAvatar identity={identity} className="mt-0.5 h-8 w-8" />;
  }

  return <TestConversationAvatar summary={summary} className="mt-0.5 h-8 w-8" />;
}

function AnswerGuideChat({ onBack }: { onBack: () => void }) {
  const { resolvedLocale, t } = usePreferences();
  const guideTime = React.useMemo(() => Date.now(), []);
  const answerGuideMessages = [
    t("guide.message1"),
    t("guide.message2"),
    t("guide.message3"),
    t("guide.message4"),
    t("guide.message5"),
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
          onClick={onBack}
          aria-label={t("common.back")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-xs font-semibold text-primary">
            {t("guide.avatar")}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold leading-5 text-text">
              {t("guide.title")}
            </h1>
            <p className="mt-0.5 text-[11px] leading-3 text-text-tertiary">
              {t("guide.scope")}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4">
        <div className="mb-4 flex justify-center">
          <span className="rounded-full bg-surface px-3 py-1 text-[11px] text-text-tertiary">
            {formatTimeLabel(guideTime, {
              locale: resolvedLocale,
              today: t("time.today"),
              yesterday: t("time.yesterday"),
              dayBeforeYesterday: t("time.dayBeforeYesterday"),
            })}{" "}
            {formatBubbleTime(guideTime)}
          </span>
        </div>
        <div className="space-y-3">
          {answerGuideMessages.map((message, index) => (
            <div key={message} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E9F6F1] text-xs font-semibold text-primary">
                {t("guide.avatar")}
              </div>
              <div className="max-w-[78%]">
                <div className="rounded-[14px] rounded-tl-[4px] bg-surface px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <p className="whitespace-pre-wrap text-[14px] leading-[1.55] text-text">
                    {message}
                  </p>
                </div>
                {index === 0 && (
                  <p className="mt-1 px-1 text-[11px] leading-4 text-text-tertiary">
                    {t("guide.title")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileBottomNavigation({
  currentPage,
  onNavigate,
}: {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}) {
  const { t } = usePreferences();

  return (
    <nav className="shrink-0 bg-bg px-2 pb-3 pt-1">
      <div className="flex h-12 items-center">
        {tabs.map((tab) => {
          const active = tab.key === currentPage;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              className={cn(
                "flex h-full flex-1 items-center justify-center rounded-[10px] text-base transition active:scale-[0.98]",
                active
                  ? "font-semibold text-text"
                  : "font-normal text-text-tertiary"
              )}
            >
              {getTabLabel(tab.key, t)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ArrangementsScreen({
  arrangements,
  aiConfig,
  contextRefs,
  dailyReviewSuggestion,
  dailyReviewMessage,
  isDailyReviewing,
  openArrangementId,
  onOpenedArrangement,
  onAddArrangement,
  onUpdateArrangement,
  onOpenContext,
  onConfirmDailyReviewSuggestion,
  onCancelDailyReviewSuggestion,
}: {
  arrangements: ArrangementItem[];
  aiConfig: AiArrangementConfig;
  contextRefs: ArrangementContextRef[];
  dailyReviewSuggestion: ArrangementDailyReviewSuggestion | null;
  dailyReviewMessage: string;
  isDailyReviewing: boolean;
  openArrangementId?: string | null;
  onOpenedArrangement?: () => void;
  onAddArrangement: (arrangement: ArrangementItem) => void;
  onUpdateArrangement: (arrangement: ArrangementItem) => void;
  onOpenContext: (ref: ArrangementContextRef) => void;
  onConfirmDailyReviewSuggestion: () => void;
  onCancelDailyReviewSuggestion: () => void;
}) {
  const { resolvedLocale, t } = usePreferences();
  const [peopleFilter, setPeopleFilter] = React.useState("all");
  const [timeFilter, setTimeFilter] = React.useState("all");
  const [placeFilter, setPlaceFilter] = React.useState("all");
  const [selectedArrangement, setSelectedArrangement] =
    React.useState<ArrangementItem | null>(null);
  const [showPendingBox, setShowPendingBox] = React.useState(false);
  const [showCreateArrangement, setShowCreateArrangement] = React.useState(false);
  const [naturalInput, setNaturalInput] = React.useState("");
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualDescription, setManualDescription] = React.useState("");
  const [manualPeople, setManualPeople] = React.useState("");
  const [manualTime, setManualTime] = React.useState("");
  const [manualScheduledDate, setManualScheduledDate] = React.useState("");
  const [manualScheduledTime, setManualScheduledTime] = React.useState("");
  const [manualPlace, setManualPlace] = React.useState("");
  const [manualImportance, setManualImportance] =
    React.useState<ArrangementImportance>(2);
  const [pendingDraft, setPendingDraft] = React.useState<AiArrangementDraft | null>(
    null
  );
  const [editingPendingDraft, setEditingPendingDraft] =
    React.useState<AiArrangementDraft | null>(null);
  const [recognitionMessage, setRecognitionMessage] = React.useState("");
  const [isRecognizing, setIsRecognizing] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    if (!openArrangementId) return;
    const arrangement = arrangements.find((item) => item.id === openArrangementId);
    if (!arrangement) {
      onOpenedArrangement?.();
      return;
    }
    setShowPendingBox(false);
    setShowCreateArrangement(false);
    setEditingPendingDraft(null);
    setSelectedArrangement(arrangement);
    onOpenedArrangement?.();
  }, [arrangements, onOpenedArrangement, openArrangementId]);

  const pendingBoxArrangements = React.useMemo(
    () => arrangements.filter((arrangement) => arrangement.status === "later"),
    [arrangements]
  );

  const activeArrangements = React.useMemo(
    () => arrangements.filter((arrangement) => arrangement.status !== "later"),
    [arrangements]
  );

  const filterOptions = React.useMemo(() => {
    const people = new Set<string>();
    const places = new Set<string>();
    activeArrangements.forEach((arrangement) => {
      arrangement.people.forEach((person) => people.add(person));
      if (arrangement.place) places.add(arrangement.place);
    });
    return {
      people: Array.from(people),
      places: Array.from(places),
    };
  }, [activeArrangements]);

  const calendarDates = React.useMemo(
    () => getCurrentMonthDateOptions(currentTime),
    [currentTime]
  );

  const arrangementCountByDate = React.useMemo(() => {
    const countByDate = new Map<string, number>();
    activeArrangements.forEach((arrangement) => {
      const dateValue = getArrangementDateValue(arrangement);
      if (!dateValue) return;
      countByDate.set(dateValue, (countByDate.get(dateValue) ?? 0) + 1);
    });
    return countByDate;
  }, [activeArrangements]);

  React.useEffect(() => {
    if (timeFilter === "all") return;
    if (calendarDates.some((date) => date.value === timeFilter)) return;
    setTimeFilter("all");
  }, [calendarDates, timeFilter]);

  const sortedArrangements = React.useMemo(
    () =>
      sortArrangementsByStatusImportanceDate(
        activeArrangements
        .filter((arrangement) => {
          const matchesPeople =
            peopleFilter === "all" || arrangement.people.includes(peopleFilter);
          const matchesTime =
            timeFilter === "all" ||
            getArrangementDateValue(arrangement) === timeFilter;
          const matchesPlace = placeFilter === "all" || arrangement.place === placeFilter;
          return matchesPeople && matchesTime && matchesPlace;
        })
      ),
    [
      activeArrangements,
      peopleFilter,
      placeFilter,
      timeFilter,
    ]
  );

  const sortedPendingBoxArrangements = React.useMemo(
    () => sortArrangementsByStatusImportanceDate(pendingBoxArrangements),
    [pendingBoxArrangements]
  );
  const dailyReviewArrangement = React.useMemo(
    () =>
      dailyReviewSuggestion
        ? arrangements.find((arrangement) => arrangement.id === dailyReviewSuggestion.arrangementId) ??
          null
        : null,
    [arrangements, dailyReviewSuggestion]
  );

  const resetManualForm = () => {
    setManualTitle("");
    setManualDescription("");
    setManualPeople("");
    setManualTime("");
    setManualScheduledDate("");
    setManualScheduledTime("");
    setManualPlace("");
    setManualImportance(2);
  };

  const fillFormFromDraft = (draft: AiArrangementDraft) => {
    setManualTitle(draft.title);
    setManualDescription(draft.description);
    setManualPeople(draft.people.join("、"));
    setManualTime(draft.timeText);
    setManualScheduledDate(draft.scheduledDate ?? "");
    setManualScheduledTime(formatTimeInput(draft.scheduledAt));
    setManualPlace(draft.place);
    setManualImportance(draft.importance);
  };

  const recognizeNaturalInput = async () => {
    setRecognitionMessage("");
    setIsRecognizing(true);
    try {
      const now = new Date();
      const draft = await recognizeArrangement(
        aiConfig,
        [
          `Current ISO time: ${now.toISOString()}`,
          `Current local time: ${now.toLocaleString("zh-CN", { hour12: false })}`,
          `Content: ${naturalInput}`,
        ].join("\n"),
        "ai-manual-input",
        []
      );
      setPendingDraft(draft);
      fillFormFromDraft(draft);
    } catch (error) {
      setRecognitionMessage(error instanceof Error ? error.message : t("arrangements.aiFailed"));
    } finally {
      setIsRecognizing(false);
    }
  };

  const recognizeMessages = async () => {
    setRecognitionMessage("");
    setIsRecognizing(true);
    try {
      const latestContextRefs = contextRefs
        .slice()
        .sort((left, right) => right.sentAt - left.sentAt)
        .slice(0, 12)
        .reverse();
      if (latestContextRefs.length === 0) {
        setRecognitionMessage(t("arrangements.noMessageContext"));
        return;
      }
      const messageContent = latestContextRefs
        .map(
          (ref) =>
            `[${ref.conversationTitle}] ${ref.senderName} at ${new Date(
              ref.sentAt
            ).toISOString()}: ${ref.text}`
        )
        .join("\n");
      const draft = await recognizeArrangement(
        aiConfig,
        messageContent,
        "ai-message",
        latestContextRefs
      );
      setPendingDraft(draft);
      fillFormFromDraft(draft);
    } catch (error) {
      setRecognitionMessage(error instanceof Error ? error.message : t("arrangements.aiFailed"));
    } finally {
      setIsRecognizing(false);
    }
  };

  const confirmDraft = () => {
    if (!pendingDraft) return;
    if (!pendingDraft.scheduledDate) {
      setRecognitionMessage(t("arrangements.timeRequired"));
      return;
    }
    onAddArrangement(createArrangementFromDraft(pendingDraft));
    setPendingDraft(null);
    setNaturalInput("");
    setRecognitionMessage(t("arrangements.confirmed"));
    setShowCreateArrangement(false);
  };

  const saveEditingPendingDraft = (nextDraft: ArrangementDraftInput) => {
    if (!editingPendingDraft) return;
    const updatedDraft = {
      ...editingPendingDraft,
      ...nextDraft,
      source: editingPendingDraft.source,
    };
    setPendingDraft(updatedDraft);
    fillFormFromDraft(updatedDraft);
    setEditingPendingDraft(null);
    setRecognitionMessage("");
  };

  const cancelDraft = () => {
    setPendingDraft(null);
    setRecognitionMessage(t("arrangements.cancelled"));
  };

  const createManualArrangement = () => {
    const title = manualTitle.trim();
    if (!title) {
      setRecognitionMessage(t("arrangements.titleRequired"));
      return;
    }
    const scheduledDate = parseDateInput(manualScheduledDate);
    if (!scheduledDate) {
      setRecognitionMessage(t("arrangements.timeRequired"));
      return;
    }
    const scheduledAt = combineDateAndTime(scheduledDate, manualScheduledTime);

    onAddArrangement(
      createArrangementFromDraft({
        title,
        description: manualDescription,
        people: splitInlineList(manualPeople),
        timeText: manualTime,
        scheduledDate,
        scheduledAt,
        place: manualPlace,
        importance: manualImportance,
        contextRefs: pendingDraft?.contextRefs ?? [],
        source: pendingDraft ? pendingDraft.source : "manual",
      })
    );
    resetManualForm();
    setPendingDraft(null);
    setNaturalInput("");
    setRecognitionMessage(t("arrangements.created"));
    setShowCreateArrangement(false);
  };

  const updateSelectedArrangement = (nextArrangement: ArrangementItem) => {
    setSelectedArrangement(nextArrangement);
    onUpdateArrangement(nextArrangement);
  };

  if (selectedArrangement) {
    return (
      <ArrangementDetailScreen
        arrangement={selectedArrangement}
        onBack={() => setSelectedArrangement(null)}
        onUpdateArrangement={updateSelectedArrangement}
        onOpenContext={onOpenContext}
      />
    );
  }

  if (editingPendingDraft) {
    return (
      <ArrangementDraftEditScreen
        title={t("arrangements.editTitle")}
        initialDraft={editingPendingDraft}
        onBack={() => setEditingPendingDraft(null)}
        onSave={saveEditingPendingDraft}
      />
    );
  }

  if (showCreateArrangement) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <MobilePageHeader
          title={t("arrangements.createTitle")}
          onBack={() => setShowCreateArrangement(false)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
          <section className="rounded-[14px] bg-surface px-3 pb-3 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold leading-5 text-text">
                  {t("arrangements.createTitle")}
                </h2>
                <p className="mt-1 text-xs leading-4 text-text-tertiary">
                  {t("arrangements.createDesc")}
                </p>
              </div>
              <button
                type="button"
                className="h-9 shrink-0 rounded-full border border-border bg-bg px-3 text-xs font-semibold text-text transition active:scale-[0.98]"
                onClick={recognizeMessages}
                disabled={isRecognizing}
              >
                {isRecognizing
                  ? t("arrangements.recognizing")
                  : t("arrangements.scanMessages")}
              </button>
            </div>
            <textarea
              value={naturalInput}
              onChange={(event) => setNaturalInput(event.target.value)}
              placeholder={t("arrangements.naturalPlaceholder")}
              className="mt-3 min-h-[72px] w-full resize-none rounded-[12px] border border-border bg-bg px-3 py-2 text-sm leading-5 text-text outline-none placeholder:text-text-disabled focus:border-primary"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-10 rounded-[10px] border border-border bg-bg text-sm font-semibold text-text transition active:scale-[0.98]"
                onClick={recognizeNaturalInput}
                disabled={isRecognizing}
              >
                {isRecognizing ? t("arrangements.recognizing") : t("arrangements.aiBreakdown")}
              </button>
              <button
                type="button"
                className="h-10 rounded-[10px] bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98]"
                onClick={createManualArrangement}
              >
                {t("arrangements.createManual")}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FormInput
                label={t("arrangements.fieldTitle")}
                value={manualTitle}
                onChange={setManualTitle}
              />
              <FormInput
                label={t("arrangements.fieldPeople")}
                value={manualPeople}
                onChange={setManualPeople}
              />
              <FormInput
                label={t("arrangements.fieldTime")}
                value={manualTime}
                onChange={setManualTime}
              />
              <FormInput
                label={t("arrangements.fieldScheduledDate")}
                value={manualScheduledDate}
                onChange={setManualScheduledDate}
                type="date"
              />
              <FormInput
                label={t("arrangements.fieldScheduledTime")}
                value={manualScheduledTime}
                onChange={setManualScheduledTime}
                type="time"
              />
              <FormInput
                label={t("arrangements.fieldPlace")}
                value={manualPlace}
                onChange={setManualPlace}
              />
            </div>
            <label className="mt-2 block">
              <span className="text-xs font-medium leading-4 text-text-tertiary">
                {t("arrangements.fieldDescription")}
              </span>
              <input
                value={manualDescription}
                onChange={(event) => setManualDescription(event.target.value)}
                className="mt-1 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none focus:border-primary"
              />
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-text-tertiary">
                {t("arrangements.importance")}
              </span>
              {([1, 2, 3, 4, 5] as ArrangementImportance[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={cn(
                    "h-8 flex-1 rounded-[9px] border text-xs font-semibold transition active:scale-[0.98]",
                    manualImportance === level
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-bg text-text-tertiary"
                  )}
                  onClick={() => setManualImportance(level as ArrangementImportance)}
                >
                  {t(`arrangements.importance${level}`)}
                </button>
              ))}
            </div>
            {pendingDraft && (
              <ArrangementConfirmationCard
                draft={pendingDraft}
                onConfirm={confirmDraft}
                onCancel={cancelDraft}
                onEdit={() => setEditingPendingDraft(pendingDraft)}
                canConfirm={Boolean(pendingDraft.scheduledDate)}
              />
            )}
            {recognitionMessage && (
              <p className="mt-2 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-4 text-primary">
                {recognitionMessage}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 bg-bg px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "h-10 min-w-0 rounded-[12px] border px-3 text-[16px] font-semibold leading-5 transition active:scale-[0.98]",
                !showPendingBox
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-text"
              )}
              onClick={() => setShowPendingBox(false)}
            >
              <span className="block truncate">
                {t("arrangements.title")}
              </span>
            </button>
            <button
              type="button"
              className={cn(
                "h-10 min-w-0 rounded-[12px] border px-3 text-[16px] font-semibold leading-5 transition active:scale-[0.98]",
                showPendingBox
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-text"
              )}
              onClick={() => setShowPendingBox(true)}
            >
              <span className="block truncate">
                {t("arrangements.pendingBox")}
              </span>
            </button>
          </div>
          <button
            type="button"
            className="ml-3 h-10 shrink-0 rounded-[12px] border border-border bg-surface px-3 text-xs font-semibold text-text transition active:scale-[0.98]"
            onClick={() => {
              setShowPendingBox(false);
              setShowCreateArrangement(true);
            }}
          >
            {t("arrangements.add")}
          </button>
        </div>
        {!showPendingBox && (
          <>
            <CalendarDateFilter
              dates={calendarDates}
              countByDate={arrangementCountByDate}
              value={timeFilter}
              onChange={setTimeFilter}
            />
            <p className="mt-1 text-xs leading-4 text-text-tertiary">
              {t("arrangements.subtitle")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FilterSelect
                label={t("arrangements.filterPeople")}
                value={peopleFilter}
                options={filterOptions.people}
                onChange={setPeopleFilter}
              />
              <FilterSelect
                label={t("arrangements.filterPlace")}
                value={placeFilter}
                options={filterOptions.places}
                onChange={setPlaceFilter}
              />
            </div>
          </>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        <section className="space-y-3">
          {!showPendingBox && isDailyReviewing && (
            <p className="rounded-[14px] bg-primary-soft px-4 py-3 text-xs leading-4 text-primary">
              正在复盘聊天，寻找可更新的安排...
            </p>
          )}
          {!showPendingBox && dailyReviewSuggestion && dailyReviewArrangement && (
            <ArrangementDailyReviewCard
              arrangement={dailyReviewArrangement}
              suggestion={dailyReviewSuggestion}
              onConfirm={onConfirmDailyReviewSuggestion}
              onCancel={onCancelDailyReviewSuggestion}
            />
          )}
          {!showPendingBox && dailyReviewMessage && !dailyReviewSuggestion && (
            <p className="rounded-[14px] bg-primary-soft px-4 py-3 text-xs leading-4 text-primary">
              {dailyReviewMessage}
            </p>
          )}
          {(showPendingBox
            ? sortedPendingBoxArrangements
            : sortedArrangements
          ).length > 0 ? (
            (showPendingBox
              ? sortedPendingBoxArrangements
              : sortedArrangements
            ).map((arrangement) => (
              <ArrangementCard
                key={arrangement.id}
                arrangement={arrangement}
                locale={resolvedLocale}
                onClick={() => setSelectedArrangement(arrangement)}
              />
            ))
          ) : (
            <div className="rounded-[14px] bg-surface px-4 py-8 text-center">
              <p className="text-sm font-semibold text-text">
                {showPendingBox
                  ? t("arrangements.pendingBoxEmptyTitle")
                  : t("arrangements.emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {showPendingBox
                  ? t("arrangements.pendingBoxEmptyDesc")
                  : t("arrangements.emptyDesc")}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const { t } = usePreferences();
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-[10px] border border-border bg-surface px-2 text-xs font-medium text-text outline-none"
      >
        <option value="all">
          {label} · {t("arrangements.all")}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type CalendarDateOption = {
  value: string;
  day: number;
  weekday: string;
  isToday: boolean;
};

type CalendarDateFilterMode = "compact" | "horizontal" | "expanded";

function CalendarDateFilter({
  dates,
  countByDate,
  value,
  onChange,
}: {
  dates: CalendarDateOption[];
  countByDate: Map<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  const { resolvedLocale, t } = usePreferences();
  const [mode, setMode] = React.useState<CalendarDateFilterMode>("compact");
  const gestureStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = React.useRef(false);
  const compactDates = React.useMemo(
    () =>
      dates.filter((date) => {
        const relation = getRelativeDateIndex(date.value);
        return relation >= 0 && relation <= 2;
      }),
    [dates]
  );
  const expandedDates = React.useMemo(() => {
    const compactDateValues = new Set(compactDates.map((date) => date.value));
    return [
      ...compactDates,
      ...dates.filter((date) => !compactDateValues.has(date.value)),
    ];
  }, [compactDates, dates]);
  const visibleDates = mode === "compact" ? compactDates : expandedDates;
  const compactMode = mode === "compact";
  const expandedMode = mode === "expanded";

  const startGesture = (x: number, y: number) => {
    gestureStartRef.current = { x, y };
    didSwipeRef.current = false;
  };

  const finishGesture = (x: number, y: number) => {
    if (!gestureStartRef.current) return;
    const deltaX = x - gestureStartRef.current.x;
    const deltaY = y - gestureStartRef.current.y;
    gestureStartRef.current = null;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absY > 28 && absY > absX && deltaY > 0) {
      didSwipeRef.current = true;
      setMode("expanded");
      return;
    }
    if (absX > 28 && absX > absY) {
      didSwipeRef.current = true;
      setMode("horizontal");
    }
  };

  const updateGesture = (x: number, y: number) => {
    if (!gestureStartRef.current) return;
    const deltaX = x - gestureStartRef.current.x;
    const deltaY = y - gestureStartRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absY > 28 && absY > absX && deltaY > 0) {
      didSwipeRef.current = true;
      gestureStartRef.current = null;
      setMode("expanded");
      return;
    }
    if (absX > 28 && absX > absY) {
      didSwipeRef.current = true;
      gestureStartRef.current = null;
      setMode("horizontal");
    }
  };

  const handleDateClick = (dateValue: string) => {
    didSwipeRef.current = false;
    onChange(dateValue);
  };

  const handleAllClick = () => {
    didSwipeRef.current = false;
    onChange("all");
  };

  return (
    <section
      aria-label={t("arrangements.filterTime")}
      className="mt-3"
      onPointerDown={(event) => {
        startGesture(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => updateGesture(event.clientX, event.clientY)}
      onPointerUp={(event) => finishGesture(event.clientX, event.clientY)}
      onPointerCancel={() => {
        gestureStartRef.current = null;
      }}
    >
      <div className="flex items-start gap-2 pb-1">
        <button
          type="button"
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border text-xs font-semibold transition active:scale-[0.98]",
            value === "all"
              ? "border-primary bg-primary text-on-primary"
              : "border-border bg-surface text-text"
          )}
          onClick={handleAllClick}
          aria-label={t("arrangements.all")}
        >
          {t("arrangements.all")}
        </button>
        <div
          className={cn(
            "min-w-0 flex-1 gap-2",
            compactMode && "grid grid-cols-3",
            mode === "horizontal" &&
              "flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            expandedMode && "grid grid-cols-6"
          )}
        >
          {visibleDates.map((date) => {
            const count = countByDate.get(date.value) ?? 0;
            const selected = value === date.value;
            const relation = getRelativeDateIndex(date.value);
            const relativeLabel =
              relation === 0
                ? t("arrangements.today")
                : relation === 1
                  ? t("arrangements.tomorrow")
                  : relation === 2
                    ? t("arrangements.dayAfterTomorrow")
                    : null;
            return (
              <button
                key={date.value}
                type="button"
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-[12px] border text-xs transition active:scale-[0.98]",
                  compactMode ? "min-w-0 px-2" : "w-12 min-w-[48px] shrink-0 px-1",
                  getCalendarHeatClass(count),
                  date.isToday && "border-primary text-primary",
                  selected && "border-primary bg-primary text-on-primary"
                )}
                onClick={() => handleDateClick(date.value)}
                aria-label={`${date.value} ${count}`}
              >
                <span className="text-[11px] leading-3 opacity-80">
                  {compactMode && relativeLabel
                    ? relativeLabel
                    : relativeLabel ??
                      (new Intl.DateTimeFormat(resolvedLocale, {
                        weekday: "narrow",
                      }).format(new Date(`${date.value}T00:00:00`)) ||
                        date.weekday)}
                </span>
                <span className="mt-0.5 text-[15px] font-semibold leading-4">
                  {date.day}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getRelativeDateIndex(value: string) {
  const target = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(target.getTime())) return Number.NaN;
  const todayStart = getDayStart(new Date());
  const targetStart = getDayStart(target);
  return Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24));
}

function getCalendarHeatClass(count: number) {
  if (count >= 4) {
    return "border-primary/50 bg-primary text-on-primary";
  }
  if (count >= 2) {
    return "border-primary/35 bg-primary-soft text-primary";
  }
  if (count === 1) {
    return "border-primary/20 bg-primary-soft/60 text-text";
  }
  return "border-border bg-surface text-text-tertiary";
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium leading-4 text-text-tertiary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none focus:border-primary"
      />
    </label>
  );
}

function DueArrangementBanner({
  arrangement,
  locale,
  onOpen,
  onMoveLater,
  onDone,
}: {
  arrangement: ArrangementItem;
  locale: string;
  onOpen: () => void;
  onMoveLater: () => void;
  onDone: () => void;
}) {
  const { t } = usePreferences();
  const [dragX, setDragX] = React.useState(0);
  const startXRef = React.useRef<number | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const maxDragRef = React.useRef(96);
  const handleSize = 40;

  const resetDrag = () => {
    startXRef.current = null;
    setDragX(0);
  };

  const getMaxDrag = () => {
    const trackWidth = trackRef.current?.getBoundingClientRect().width ?? 0;
    const nextMaxDrag = Math.max(96, trackWidth / 2 - handleSize / 2 - 8);
    maxDragRef.current = nextMaxDrag;
    return nextMaxDrag;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    getMaxDrag();
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (startXRef.current === null) return;
    event.stopPropagation();
    const maxDrag = getMaxDrag();
    const nextDragX = Math.max(-maxDrag, Math.min(maxDrag, event.clientX - startXRef.current));
    setDragX(nextDragX);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (startXRef.current === null) return;
    event.stopPropagation();
    const maxDrag = getMaxDrag();
    const finalDragX = Math.max(
      -maxDrag,
      Math.min(maxDrag, event.clientX - startXRef.current)
    );
    if (finalDragX <= -maxDrag) {
      resetDrag();
      onMoveLater();
      return;
    }
    if (finalDragX >= maxDrag) {
      resetDrag();
      onDone();
      return;
    }
    resetDrag();
  };

  return (
    <section
      className="mb-3 rounded-[16px] border border-primary/25 bg-primary-soft px-3 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.16)]"
      aria-label={t("arrangements.dueNotice")}
    >
      <button
        type="button"
        className="block w-full text-left transition active:scale-[0.99]"
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold leading-4 text-primary">
              {t("arrangements.dueNotice")}
            </p>
            <h2 className="mt-1 line-clamp-2 text-[16px] font-semibold leading-5 text-text">
              {arrangement.title}
            </h2>
            <p className="mt-1 text-xs leading-4 text-text-tertiary">
              {formatArrangementMeta(arrangement, t, locale)}
            </p>
          </div>
          <ArrangementChip
            label={`${t("arrangements.importanceLevel")}：${t(
              `arrangements.importance${arrangement.importance}`
            )}`}
          />
        </div>
      </button>
      <div
        ref={trackRef}
        className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 overflow-hidden rounded-full bg-bg px-2 py-2"
      >
        <span className="pointer-events-none text-center text-[11px] font-medium text-text-tertiary">
          {t("arrangements.swipeToPendingBox")}
        </span>
        <button
          type="button"
          className="relative z-10 h-10 w-10 rounded-full bg-primary text-[11px] font-semibold text-on-primary shadow-[0_6px_18px_rgba(9,184,62,0.28)] transition-transform"
          style={{ transform: `translateX(${dragX}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClick={(event) => event.stopPropagation()}
          aria-label={t("arrangements.swipeHandle")}
        >
          {t("arrangements.swipeHandle")}
        </button>
        <span className="pointer-events-none text-center text-[11px] font-medium text-text-tertiary">
          {t("arrangements.swipeToDone")}
        </span>
      </div>
    </section>
  );
}

function ArrangementCard({
  arrangement,
  locale,
  onClick,
}: {
  arrangement: ArrangementItem;
  locale: string;
  onClick: () => void;
}) {
  const { t } = usePreferences();
  const important = arrangement.importance === 5;
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[14px] px-4 py-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition active:scale-[0.99]",
        important ? "bg-[rgba(148,163,184,0.18)]" : "bg-surface"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-[16px] font-semibold leading-5 text-text">
            {arrangement.title}
          </h2>
          <p className="mt-1 text-xs leading-4 text-text-tertiary">
            {formatArrangementMeta(arrangement, t, locale)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-bg px-2 py-1 text-[11px] font-medium text-text-tertiary">
          {t(`arrangements.status.${arrangement.status}`)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ArrangementChip
          label={`${t("arrangements.importanceLevel")}：${t(
            `arrangements.importance${arrangement.importance}`
          )}`}
        />
        <ArrangementChip
          label={t("arrangements.contextCount").replace(
            "{count}",
            String(arrangement.contextRefs.length)
          )}
        />
      </div>
    </button>
  );
}

function ArrangementChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-bg px-2 py-1 text-[11px] leading-4 text-text-tertiary">
      {label}
    </span>
  );
}

function ArrangementDailyReviewCard({
  arrangement,
  suggestion,
  onConfirm,
  onCancel,
}: {
  arrangement: ArrangementItem;
  suggestion: ArrangementDailyReviewSuggestion;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded-[14px] border border-primary/25 bg-primary-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-4 text-primary">
            AI 发现可更新的安排
          </p>
          <h2 className="mt-1 line-clamp-1 text-[15px] font-semibold leading-5 text-text">
            {arrangement.title}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-bg px-2 py-1 text-[11px] text-text-tertiary">
          {Math.round(suggestion.confidence * 100)}%
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text">
        {suggestion.appendDescription}
      </p>
      {suggestion.reason && (
        <p className="mt-1 text-[11px] leading-4 text-text-tertiary">
          {suggestion.reason}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="h-9 rounded-[10px] bg-primary text-xs font-semibold text-on-primary transition active:scale-[0.98]"
          onClick={onConfirm}
        >
          确认更新
        </button>
        <button
          type="button"
          className="h-9 rounded-[10px] border border-border bg-bg text-xs font-semibold text-text transition active:scale-[0.98]"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </section>
  );
}

function ArrangementConfirmationCard({
  draft,
  onConfirm,
  onCancel,
  onEdit,
  canConfirm = true,
}: {
  draft: AiArrangementDraft;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  canConfirm?: boolean;
}) {
  const { resolvedLocale, t } = usePreferences();
  return (
    <div className="mt-3 rounded-[12px] border border-primary/30 bg-primary-soft px-3 py-3">
      <button
        type="button"
        className="block w-full rounded-[10px] text-left transition active:scale-[0.99]"
        onClick={onEdit}
      >
        <h3 className="text-[15px] font-semibold leading-5 text-text">
          {draft.title}
        </h3>
        <p className="mt-1 text-xs leading-4 text-text-tertiary">
          {formatDraftMeta(draft, t, resolvedLocale)}
        </p>
        {onEdit && (
          <p className="mt-2 text-[11px] font-medium leading-4 text-primary">
            {t("arrangements.tapToEdit")}
          </p>
        )}
      </button>
      {!canConfirm && (
        <p className="mt-2 rounded-[10px] bg-bg px-3 py-2 text-xs leading-4 text-primary">
          {t("arrangements.timeRequired")}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="h-9 rounded-[10px] bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          {t("arrangements.confirm")}
        </button>
        <button
          type="button"
          className="h-9 rounded-[10px] border border-border bg-bg text-sm font-semibold text-text transition active:scale-[0.98]"
          onClick={onCancel}
        >
          {t("arrangements.cancel")}
        </button>
      </div>
    </div>
  );
}

function ArrangementDraftEditScreen({
  title,
  initialDraft,
  onBack,
  onSave,
}: {
  title: string;
  initialDraft: ArrangementDraftInput;
  onBack: () => void;
  onSave: (draft: ArrangementDraftInput) => void;
}) {
  const { t } = usePreferences();
  const [draftTitle, setDraftTitle] = React.useState(initialDraft.title);
  const [description, setDescription] = React.useState(initialDraft.description);
  const [people, setPeople] = React.useState(initialDraft.people.join("、"));
  const [timeText, setTimeText] = React.useState(initialDraft.timeText);
  const [scheduledDate, setScheduledDate] = React.useState(
    initialDraft.scheduledDate ?? ""
  );
  const [scheduledTime, setScheduledTime] = React.useState(
    formatTimeInput(initialDraft.scheduledAt)
  );
  const [place, setPlace] = React.useState(initialDraft.place);
  const [importance, setImportance] = React.useState<ArrangementImportance>(
    initialDraft.importance
  );
  const [message, setMessage] = React.useState("");

  const saveDraft = () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setMessage(t("arrangements.titleRequired"));
      return;
    }
    const nextScheduledDate = parseDateInput(scheduledDate);
    if (!nextScheduledDate) {
      setMessage(t("arrangements.timeRequired"));
      return;
    }
    onSave({
      ...initialDraft,
      title: nextTitle,
      description,
      people: splitInlineList(people),
      timeText,
      scheduledDate: nextScheduledDate,
      scheduledAt: combineDateAndTime(nextScheduledDate, scheduledTime),
      place,
      importance,
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader title={title} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
        <section className="rounded-[14px] bg-surface px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <FormInput
              label={t("arrangements.fieldTitle")}
              value={draftTitle}
              onChange={setDraftTitle}
            />
            <FormInput
              label={t("arrangements.fieldPeople")}
              value={people}
              onChange={setPeople}
            />
            <FormInput
              label={t("arrangements.fieldTime")}
              value={timeText}
              onChange={setTimeText}
            />
            <FormInput
              label={t("arrangements.fieldScheduledDate")}
              value={scheduledDate}
              onChange={setScheduledDate}
              type="date"
            />
            <FormInput
              label={t("arrangements.fieldScheduledTime")}
              value={scheduledTime}
              onChange={setScheduledTime}
              type="time"
            />
            <FormInput
              label={t("arrangements.fieldPlace")}
              value={place}
              onChange={setPlace}
            />
          </div>
          <label className="mt-2 block">
            <span className="text-xs font-medium leading-4 text-text-tertiary">
              {t("arrangements.fieldDescription")}
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none focus:border-primary"
            />
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-text-tertiary">
              {t("arrangements.importance")}
            </span>
            {([1, 2, 3, 4, 5] as ArrangementImportance[]).map((level) => (
              <button
                key={level}
                type="button"
                className={cn(
                  "h-8 flex-1 rounded-[9px] border text-xs font-semibold transition active:scale-[0.98]",
                  importance === level
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-bg text-text-tertiary"
                )}
                onClick={() => setImportance(level as ArrangementImportance)}
              >
                {t(`arrangements.importance${level}`)}
              </button>
            ))}
          </div>
          {message && (
            <p className="mt-3 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-4 text-primary">
              {message}
            </p>
          )}
          <button
            type="button"
            className="mt-3 h-10 w-full rounded-[10px] bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98]"
            onClick={saveDraft}
          >
            {t("arrangements.saveEdit")}
          </button>
        </section>
      </div>
    </div>
  );
}

function ArrangementDetailScreen({
  arrangement,
  onBack,
  onUpdateArrangement,
  onOpenContext,
}: {
  arrangement: ArrangementItem;
  onBack: () => void;
  onUpdateArrangement: (arrangement: ArrangementItem) => void;
  onOpenContext: (ref: ArrangementContextRef) => void;
}) {
  const { resolvedLocale, t } = usePreferences();
  const [isEditing, setIsEditing] = React.useState(false);

  const updateStatus = (status: ArrangementStatus) => {
    onUpdateArrangement({ ...arrangement, status, updatedAt: Date.now() });
  };

  const updateImportance = (importance: ArrangementImportance) => {
    onUpdateArrangement({ ...arrangement, importance, updatedAt: Date.now() });
  };

  const saveArrangementEdit = (draft: ArrangementDraftInput) => {
    onUpdateArrangement({
      ...arrangement,
      title: draft.title,
      description: draft.description,
      people: draft.people,
      timeText: draft.timeText,
      scheduledDate: draft.scheduledDate,
      scheduledAt: draft.scheduledAt,
      place: draft.place,
      importance: draft.importance,
      updatedAt: Date.now(),
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <ArrangementDraftEditScreen
        title={t("arrangements.editTitle")}
        initialDraft={arrangement}
        onBack={() => setIsEditing(false)}
        onSave={saveArrangementEdit}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader
        title={t("arrangements.detailTitle")}
        actionLabel={t("arrangements.edit")}
        onAction={() => setIsEditing(true)}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
        <section className="rounded-[14px] bg-surface px-4 py-4">
          <h1 className="text-[20px] font-bold leading-7 text-text">
            {arrangement.title}
          </h1>
          {arrangement.description && (
            <p className="mt-2 text-sm leading-5 text-text-muted">
              {arrangement.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ArrangementChip
              label={formatArrangementMeta(arrangement, t, resolvedLocale)}
            />
            <ArrangementChip
              label={t("arrangements.contextCount").replace(
                "{count}",
                String(arrangement.contextRefs.length)
              )}
            />
          </div>
        </section>

        <section className="mt-3 rounded-[14px] bg-surface px-4 py-4">
          <h2 className="text-sm font-semibold text-text">
            {t("arrangements.statusTitle")}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["pending", "done", "later"] as ArrangementStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                className={cn(
                  "h-9 rounded-[10px] border text-xs font-semibold transition active:scale-[0.98]",
                  arrangement.status === status
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-bg text-text-tertiary"
                )}
                onClick={() => updateStatus(status)}
              >
                {t(`arrangements.status.${status}`)}
              </button>
            ))}
          </div>
          <h2 className="mt-4 text-sm font-semibold text-text">
            {t("arrangements.importance")}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([1, 2, 3, 4, 5] as ArrangementImportance[]).map((level) => (
              <button
                key={level}
                type="button"
                className={cn(
                  "h-9 rounded-[10px] border text-xs font-semibold transition active:scale-[0.98]",
                  arrangement.importance === level
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-bg text-text-tertiary"
                )}
                onClick={() => updateImportance(level)}
              >
                {t(`arrangements.importance${level}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[14px] bg-surface px-4 py-4">
          <h2 className="text-sm font-semibold text-text">
            {t("arrangements.contextTitle")}
          </h2>
          <div className="mt-3 space-y-2">
            {arrangement.contextRefs.length > 0 ? (
              arrangement.contextRefs.map((ref) => (
                <button
                  key={`${ref.conversationId}-${ref.messageId}`}
                  type="button"
                  className="w-full rounded-[12px] bg-bg px-3 py-2 text-left transition active:scale-[0.99]"
                  onClick={() => onOpenContext(ref)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-text">
                      {ref.conversationTitle} · {ref.senderName}
                    </p>
                    <span className="shrink-0 text-[11px] text-text-disabled">
                      {new Intl.DateTimeFormat(resolvedLocale, {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(ref.sentAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-4 text-text-muted">
                    {ref.text}
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-[12px] bg-bg px-3 py-4 text-center text-xs text-text-tertiary">
                {t("arrangements.noContext")}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function splitInlineList(value: string) {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsedTime = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsedTime) ? value : null;
}

function formatDateInput(value: number | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeInput(value: number | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineDateAndTime(dateValue: string, timeValue: string) {
  const scheduledDate = parseDateInput(dateValue);
  if (!scheduledDate || !timeValue) return null;
  const parsedTime = new Date(`${scheduledDate}T${timeValue}`).getTime();
  return Number.isFinite(parsedTime) ? parsedTime : null;
}

function getDayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function formatLocalDateValue(value: Date) {
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate()
  )}`;
}

function getCurrentMonthDateOptions(now: number): CalendarDateOption[] {
  const currentDate = new Date(now);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayValue = formatLocalDateValue(currentDate);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dateByValue = new Map<string, CalendarDateOption>();
  Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const value = formatLocalDateValue(date);
    dateByValue.set(value, {
      value,
      day: index + 1,
      weekday: "",
      isToday: value === todayValue,
    });
  });
  for (const offset of [0, 1, 2]) {
    const date = new Date(year, month, currentDate.getDate() + offset);
    const value = formatLocalDateValue(date);
    dateByValue.set(value, {
      value,
      day: date.getDate(),
      weekday: "",
      isToday: value === todayValue,
    });
  }
  return Array.from(dateByValue.values()).sort((left, right) =>
    left.value.localeCompare(right.value)
  );
}

function getArrangementDateValue(
  arrangement: Pick<ArrangementItem, "scheduledDate" | "scheduledAt">
) {
  return arrangement.scheduledDate ?? (formatDateInput(arrangement.scheduledAt) || null);
}

function getArrangementSortDate(
  arrangement: Pick<ArrangementItem, "scheduledDate" | "scheduledAt">
) {
  const scheduledDateText = getArrangementDateValue(arrangement);
  if (!scheduledDateText) return Number.POSITIVE_INFINITY;
  const parsedTime = new Date(`${scheduledDateText}T00:00:00`).getTime();
  return Number.isFinite(parsedTime) ? parsedTime : Number.POSITIVE_INFINITY;
}

function getArrangementPreciseSortTime(
  arrangement: Pick<ArrangementItem, "scheduledAt">
) {
  return typeof arrangement.scheduledAt === "number" &&
    Number.isFinite(arrangement.scheduledAt)
    ? arrangement.scheduledAt
    : Number.POSITIVE_INFINITY;
}

function sortArrangementsByStatusImportanceDate(items: ArrangementItem[]) {
  return [...items].sort((left, right) => {
    const leftPreciseTime = getArrangementPreciseSortTime(left);
    const rightPreciseTime = getArrangementPreciseSortTime(right);
    const leftHasPreciseTime = leftPreciseTime !== Number.POSITIVE_INFINITY;
    const rightHasPreciseTime = rightPreciseTime !== Number.POSITIVE_INFINITY;
    if (leftHasPreciseTime !== rightHasPreciseTime) {
      return leftHasPreciseTime ? -1 : 1;
    }
    if (leftHasPreciseTime && rightHasPreciseTime) {
      if (leftPreciseTime !== rightPreciseTime) {
        return leftPreciseTime - rightPreciseTime;
      }
      if (right.importance !== left.importance) {
        return right.importance - left.importance;
      }
      return right.updatedAt - left.updatedAt;
    }
    const leftDate = getArrangementSortDate(left);
    const rightDate = getArrangementSortDate(right);
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    if (right.importance !== left.importance) {
      return right.importance - left.importance;
    }
    return right.updatedAt - left.updatedAt;
  });
}

function formatArrangementTime(
  arrangement: Pick<ArrangementItem, "scheduledDate" | "scheduledAt" | "timeText">,
  t: ReturnType<typeof usePreferences>["t"],
  _locale: string
) {
  const scheduledDateText = getArrangementDateValue(arrangement);
  if (!scheduledDateText) return t("arrangements.timePending");

  const scheduledDate = new Date(`${scheduledDateText}T00:00:00`);
  const todayStart = getDayStart(new Date());
  const scheduledStart = getDayStart(scheduledDate);
  const dayDiff = Math.round((scheduledStart - todayStart) / (1000 * 60 * 60 * 24));

  let dayLabel: string;
  if (dayDiff === 0) {
    dayLabel = t("arrangements.today");
  } else if (dayDiff === 1) {
    dayLabel = t("arrangements.tomorrow");
  } else if (dayDiff === 2) {
    dayLabel = t("arrangements.dayAfterTomorrow");
  } else {
    dayLabel = scheduledDateText.split("-").join("/");
  }

  return dayLabel;
}

function formatArrangementMeta(
  arrangement: Pick<
    ArrangementItem,
    "people" | "timeText" | "scheduledDate" | "scheduledAt" | "place"
  >,
  t: ReturnType<typeof usePreferences>["t"],
  locale: string
) {
  const scheduledLabel = formatArrangementTime(arrangement, t, locale);
  return [
    arrangement.people.length > 0 ? arrangement.people.join("、") : "",
    scheduledLabel,
    arrangement.place,
  ]
    .filter(Boolean)
    .join(" · ") || t("arrangements.noMeta");
}

function formatDraftMeta(
  draft: Pick<
    AiArrangementDraft,
    "people" | "timeText" | "scheduledDate" | "scheduledAt" | "place"
  >,
  t: ReturnType<typeof usePreferences>["t"],
  locale: string
) {
  return formatArrangementMeta(draft, t, locale);
}

function InsightPreview() {
  const { t } = usePreferences();

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center bg-bg px-4">
        <h1 className="text-lg font-semibold text-text">{t("insight.title")}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface text-text">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-semibold text-text">
            {t("insight.emptyTitle")}
          </p>
          <p className="mt-1 text-xs text-text-muted">{t("insight.emptyDesc")}</p>
        </div>
      </div>
    </div>
  );
}

function MinePreview({
  records,
  onOpenSettings,
  onOpenAbout,
}: {
  records: RecordItem[];
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}) {
  const { resolvedLocale, resolvedTheme, t } = usePreferences();
  const candidateProfile = useCandidateProfile();
  const mineImagePrefix = resolvedTheme === "dark" ? "/images/mine/theme_dark/" : "/images/mine/";
  const mineUserName = candidateProfile?.name || t("mine.user");
  const mineAvatarLabel =
    candidateProfile?.avatarLabel || t("recordDetail.me").slice(0, 1);
  const quickNoteCount = records.length;
  const wordCount = records.reduce(
    (total, record) => total + countRecordTextLength(record.text_content),
    0
  );
  const quickNoteCountText = formatNumberForLocale(quickNoteCount, resolvedLocale);
  const wordCountText = formatNumberForLocale(wordCount, resolvedLocale);
  const mineStats = [
    t("mine.stat1"),
    formatStatTemplate(t("mine.stat2"), {
      count: quickNoteCountText,
      places: "0",
    }),
    t("mine.stat3"),
    formatStatTemplate(t("mine.stat4"), {
      words: wordCountText,
    }),
  ];
  const mineDataTags = [
    t("mine.tagImportExport"),
    t("mine.tagDataSecurity"),
    t("mine.tagPrivacy"),
  ];

  return (
    <div className="h-full overflow-y-auto bg-bg pb-4">
      <section className="relative overflow-hidden pb-5 pt-10">
        <img
          src="/images/mine/image_mine_page_background.png"
          alt=""
          className="pointer-events-none absolute -right-[52px] -top-11 h-[273px] w-[375px] max-w-none object-cover"
          aria-hidden="true"
        />

        <button
          type="button"
          className="absolute right-0 top-14 z-10 flex w-[98px] items-center rounded-l-[10px] bg-[var(--mine-world-bg)] py-[7px] pl-3 pr-1.5 text-[14px] leading-4 text-text transition active:scale-[0.98]"
        >
          {t("mine.world")}
          <ChevronRightIcon className="ml-0.5 h-4 w-4 shrink-0 text-text" />
        </button>

        <div className="relative z-10 flex items-center pl-4 pr-[112px]">
          <div
            className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full border border-border-strong/80 bg-primary text-[23px] font-semibold leading-none text-on-primary shadow-[var(--mine-card-shadow)]"
            aria-label={t("mine.avatarAlt")}
          >
            {mineAvatarLabel}
          </div>
          <div className="ml-3 min-w-0">
            <div className="flex items-center">
              <p className="truncate text-xl leading-5 text-text">{mineUserName}</p>
              <ChevronRightIcon className="ml-1.5 h-4 w-4 shrink-0 text-text-disabled" />
            </div>
            <div className="mt-3 flex h-4 items-center">
              <div className="h-[3px] w-[83px] overflow-hidden rounded-full bg-[rgba(136,136,136,0.2)]">
                <div className="h-full w-[18%] rounded-full bg-primary" />
              </div>
              <p className="ml-2 text-xs leading-4 text-text-tertiary">
                {t("mine.storage")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-2.5 pt-[50px]">
        <button
          type="button"
          className="absolute left-2.5 right-2.5 top-2.5 z-0 flex min-h-[70px] items-start rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-member-bg)] px-2.5 pb-3 pt-3 text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center">
              <p className="shrink-0 text-sm font-bold leading-4 text-text">
                {t("mine.memberTitle")}
              </p>
              <p className="ml-1.5 truncate text-xs leading-4 text-text-tertiary">
                {t("mine.memberDesc")}
              </p>
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center text-sm leading-4 text-primary">
            {t("mine.memberAction")}
            <ChevronRightIcon className="h-4 w-4" />
          </div>
        </button>

        <div className="relative z-10 overflow-hidden rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] shadow-[var(--mine-card-shadow)]">
          <img
            src={`${mineImagePrefix}image_mine_page_migong_background.png`}
            alt=""
            className="pointer-events-none absolute -right-px bottom-0 h-[179px] w-[179px]"
            aria-hidden="true"
          />
          <div className="relative px-3 pb-2.5 pt-2.5">
            <div className="flex items-center justify-between">
              <p className="truncate text-sm leading-[22px] text-text-tertiary">
                {t("mine.statsTitle")}
              </p>
              <button
                type="button"
                className="ml-3 flex shrink-0 items-center text-sm leading-[22px] text-text-tertiary transition active:scale-[0.98]"
              >
                {t("mine.statsButton")}
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {mineStats.map((line) => (
                <p key={line} className="text-base leading-7 text-text">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-2.5 px-2.5">
        <button
          type="button"
          className="relative w-full overflow-hidden rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
        >
          <img
            src={`${mineImagePrefix}image_mine_page_datamanager_protect_background.png`}
            alt=""
            className="pointer-events-none absolute -right-px bottom-0 h-24 w-[106px]"
            aria-hidden="true"
          />
          <div className="relative px-3 pb-2.5 pt-2.5">
            <h2 className="text-base font-bold leading-6 text-text">
              {t("mine.dataTitle")}
            </h2>
            <p className="mt-px text-sm leading-5 text-text-tertiary">
              {t("mine.dataDesc")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {mineDataTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[8px] bg-[rgba(136,136,136,0.12)] px-2 py-1 text-xs leading-4 text-text-tertiary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </button>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <MineActionCard
            title={t("mine.settings")}
            description={t("mine.settingsDesc")}
            onClick={onOpenSettings}
          />
          <MineActionCard
            title={t("mine.about")}
            description={t("mine.aboutDesc")}
            onClick={onOpenAbout}
          />
        </div>
      </section>
    </div>
  );
}

function AboutScreen({ onBack }: { onBack: () => void }) {
  const { t } = usePreferences();
  const legalLinks = [
    {
      title: t("about.userAgreement"),
      url: "https://www.jiwo.cc/article/user-aggrement-v1.html",
    },
    {
      title: t("about.privacyTerms"),
      url: "https://www.jiwo.cc/article/privacy-aggrement-v1.html",
    },
    {
      title: t("about.privacyStatement"),
      url: "https://www.jiwo.cc/article/privacy-protect-v1.html?canReset=true",
    },
  ];
  const runLinks = [
    {
      title: t("about.wechatOfficial"),
      icon: "/images/about/icon_run_weixin_gongzhonghao.svg",
      url: "/images/about/image_wxgongzhonghao_qrcode.png",
    },
    {
      title: t("about.xiaohongshu"),
      icon: "/images/about/icon_run_xiaohongshu.svg",
      url: "https://www.xiaohongshu.com/user/profile/645464ff00000000290168b1?xhsshare=CopyLink&appuid=645464ff00000000290168b1&apptime=1716282708",
    },
    {
      title: t("about.douyin"),
      icon: "/images/about/icon_run_douyin.png",
      url: "https://www.douyin.com/user/MS4wLjABAAAACyK_g4xd0gUVN4ViU4FigeAYc2RFPO-sEp9RjXc6C4OWmDF9cJx9nzXBSEDw2J-C",
    },
    {
      title: t("about.jike"),
      icon: "/images/about/icon_run_jike.svg",
      url: "https://okjk.co/tHwXUq",
    },
    {
      title: t("about.weibo"),
      icon: "/images/about/icon_run_weibo.svg",
      url: "https://weibo.com/u/7960184078",
    },
  ];
  const footerRecords = [
    "ICP备案号：鄂ICP备2024037215号",
    "澧炲€肩數淇′笟鍔＄粡钀ヨ鍙瘉锛氶剛B2-20240478",
    "妯″瀷鍚嶇О锛欴eepSeek-R1",
    "互联网信息服务算法备案号：网信算备330110507206401230035号",
    "软著：软著登字第14519261号",
    "森奇思(武汉)科技有限公司",
  ];

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("mine.about")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col px-2.5">
          <section className="flex flex-col items-center pt-[35px]">
            <img
              src="/images/about/icon_logo_jiwo.png"
              alt={t("about.appName")}
              className="h-[72px] w-[72px] rounded-[12px] object-cover"
            />
            <h1 className="mt-[5px] text-[24px] font-medium leading-[34px] text-text">
              {t("about.appName")}
            </h1>
            <p className="text-[14px] leading-[14px] text-text-muted">v0.1.0</p>
          </section>

          <section className="mt-[22px] overflow-hidden rounded-[12px] bg-surface shadow-[var(--mine-card-shadow)]">
            {legalLinks.map((item) => (
              <AboutListItem
                key={item.title}
                title={item.title}
                onClick={() => openExternalLink(item.url)}
              />
            ))}
            <AboutListItem
              title={t("about.appReview")}
              rightLabel={t("about.appReviewTip")}
              onClick={() =>
                openExternalLink(
                  "https://apps.apple.com/app/id6480506979?action=write-review"
                )
              }
            />
            <AboutListItem
              title={t("about.contactAuthor")}
              description={t("about.contactAuthorDesc")}
              external
              onClick={() => openExternalLink("https://jiwo.cc/arkmets")}
            />
          </section>

          <footer className="mt-auto flex flex-col items-center pb-3 pt-10 text-center">
            <p className="text-[14px] leading-5 text-text-muted">
              {t("about.appName")}
            </p>
            <p className="text-[14px] leading-5 text-text-muted">
              {t("about.socialChannels")}
            </p>
            <div className="mt-[11px] flex items-center justify-center gap-2.5">
              {runLinks.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-[0.96]"
                  onClick={() => openExternalLink(item.url)}
                  aria-label={item.title}
                >
                  <img src={item.icon} alt="" className="h-9 w-9" aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className="mt-[42px] space-y-0.5">
              {footerRecords.map((record) => (
                <p
                  key={record}
                  className="px-2 text-[10px] leading-4 text-text-disabled"
                >
                  {record}
                </p>
              ))}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function AboutListItem({
  title,
  description,
  rightLabel,
  external,
  onClick,
}: {
  title: string;
  description?: string;
  rightLabel?: string;
  external?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[50px] w-full items-center border-b border-border-light px-3 text-left last:border-b-0 transition hover:bg-bg active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-5 text-text">{title}</p>
        {description && (
          <p className="mt-0.5 truncate text-xs leading-4 text-text-tertiary">
            {description}
          </p>
        )}
      </div>
      {rightLabel && (
        <span className="ml-2 max-w-[128px] truncate text-sm leading-5 text-text-tertiary">
          {rightLabel}
        </span>
      )}
      {external ? (
        <ExternalLinkIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
      ) : (
        <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
      )}
    </button>
  );
}

function MineActionCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[74px] rounded-[12px] border border-[var(--mine-card-border)] bg-[var(--mine-card-bg)] px-3 pb-2.5 pt-2.5 text-left shadow-[var(--mine-card-shadow)] transition active:scale-[0.99]"
    >
      <h2 className="text-base font-bold leading-6 text-text">{title}</h2>
      <p className="mt-px text-sm leading-5 text-text-tertiary">{description}</p>
    </button>
  );
}

function SettingsScreen({
  onBack,
  onOpenAppearance,
  arrangementAiConfig,
  onChangeArrangementAiConfig,
}: {
  onBack: () => void;
  onOpenAppearance: () => void;
  arrangementAiConfig: AiArrangementConfig;
  onChangeArrangementAiConfig: (config: AiArrangementConfig) => void;
}) {
  const { localeCode, resolvedLocale, t } = usePreferences();
  const [showLanguageSheet, setShowLanguageSheet] = React.useState(false);
  const [draftConfig, setDraftConfig] = React.useState(arrangementAiConfig);
  const [savedTip, setSavedTip] = React.useState("");

  React.useEffect(() => {
    setDraftConfig(arrangementAiConfig);
  }, [arrangementAiConfig]);

  const saveArrangementAiConfig = () => {
    onChangeArrangementAiConfig(draftConfig);
    setSavedTip(t("arrangements.aiConfigSaved"));
  };

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("settings.title")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
        <div className="overflow-hidden rounded-[12px] bg-surface">
          <SettingsListItem
            title={t("settings.appearance")}
            description={t("settings.appearanceDesc")}
            onClick={onOpenAppearance}
          />
          <SettingsListItem
            title={t("settings.language")}
            description={`${t("settings.current")}：${
              localeCode === ""
                ? t("settings.followSystem")
                : getLocaleDisplayName(localeCode, resolvedLocale)
            }`}
            onClick={() => setShowLanguageSheet(true)}
          />
        </div>

        <section className="mt-3 rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("arrangements.aiConfigTitle")}
          </h2>
          <p className="mt-1 text-xs leading-4 text-text-tertiary">
            {t("arrangements.aiConfigDesc")}
          </p>
          <div className="mt-3 space-y-2">
            <SettingsTextInput
              label={t("arrangements.baseUrl")}
              value={draftConfig.baseUrl}
              onChange={(value) =>
                setDraftConfig((prev) => ({ ...prev, baseUrl: value }))
              }
              placeholder="https://api.openai.com/v1"
            />
            <SettingsTextInput
              label={t("arrangements.apiKey")}
              value={draftConfig.apiKey}
              onChange={(value) =>
                setDraftConfig((prev) => ({ ...prev, apiKey: value }))
              }
              placeholder="sk-..."
            />
            <SettingsTextInput
              label={t("arrangements.model")}
              value={draftConfig.model}
              onChange={(value) =>
                setDraftConfig((prev) => ({ ...prev, model: value }))
              }
              placeholder="gpt-4o-mini"
            />
          </div>
          <button
            type="button"
            className="mt-3 h-10 w-full rounded-[10px] bg-primary text-sm font-semibold text-on-primary transition active:scale-[0.98]"
            onClick={saveArrangementAiConfig}
          >
            {t("arrangements.saveAiConfig")}
          </button>
          {savedTip && (
            <p className="mt-2 text-center text-xs leading-4 text-primary">{savedTip}</p>
          )}
        </section>
      </div>

      {showLanguageSheet && (
        <LanguageSheet onClose={() => setShowLanguageSheet(false)} />
      )}
    </div>
  );
}

function SettingsTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium leading-4 text-text-tertiary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-sm text-text outline-none transition placeholder:text-text-disabled focus:border-primary"
      />
    </label>
  );
}

function AppearanceStyleScreen({ onBack }: { onBack: () => void }) {
  const {
    accentColor,
    appIcon,
    isVip,
    resolvedTheme,
    setAccentColor,
    setAppIcon,
    setThemeMode,
    t,
    themeMode,
  } = usePreferences();
  const [limitMessage, setLimitMessage] = React.useState("");
  const themeOptions: Array<{ value: ThemeMode; label: string; preview: ResolvedTheme }> = [
    { value: "system", label: t("appearance.themeSystem"), preview: resolvedTheme },
    { value: "light", label: t("appearance.themeLight"), preview: "light" },
    { value: "dark", label: t("appearance.themeDark"), preview: "dark" },
  ];
  const iconOptions: Array<{ value: AppIcon; label: string; vip?: boolean }> = [
    { value: "classic", label: t("appearance.iconClassic") },
    { value: "bright", label: t("appearance.iconBright"), vip: true },
  ];

  const trySetAccentColor = (value: AccentColor) => {
    setLimitMessage("");
    setAccentColor(value);
  };

  const trySetAppIcon = (value: AppIcon, needsVip?: boolean) => {
    if (needsVip && !isVip) {
      setLimitMessage(t("appearance.freeLimit"));
      return;
    }
    setLimitMessage("");
    setAppIcon(value);
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <MobilePageHeader title={t("appearance.title")} onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-3">
        <section className="rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.theme")}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setThemeMode(option.value)}
                className={cn(
                  "rounded-[10px] border px-2 pb-2 pt-2 text-left transition active:scale-[0.98]",
                  themeMode === option.value
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface"
                )}
              >
                <ThemePreview mode={option.preview} />
                <p className="mt-2 truncate text-center text-xs font-medium text-text">
                  {option.label}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.accent")}
          </h2>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {accentColorOptions.map((option) => {
              const active = accentColor === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => trySetAccentColor(option.key)}
                  className={cn(
                    "relative flex min-h-[74px] flex-col items-center justify-center rounded-[10px] border bg-surface transition active:scale-[0.98]",
                    active ? "border-primary" : "border-border"
                  )}
                >
                  <span
                    className="h-7 w-7 rounded-full border-[3px]"
                    style={{
                      backgroundColor: option.color,
                      borderColor: active ? option.border : "transparent",
                    }}
                  />
                  <span className="mt-2 text-xs text-text">
                    {t(`accent.${option.key}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-3 rounded-[12px] bg-surface px-3 pb-3 pt-3">
          <h2 className="text-[15px] font-semibold leading-5 text-text">
            {t("appearance.icon")}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {iconOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => trySetAppIcon(option.value, option.vip)}
                className={cn(
                  "relative flex min-h-[74px] items-center rounded-[10px] border bg-surface px-3 text-left transition active:scale-[0.98]",
                  appIcon === option.value ? "border-primary" : "border-border"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary">
                  <img
                    src={getJiwoLogoSrc(option.value, resolvedTheme)}
                    alt=""
                    className="w-8"
                  />
                </div>
                <span className="ml-3 text-sm font-medium text-text">{option.label}</span>
                {option.vip && !isVip && (
                  <span className="absolute right-2 top-2 rounded-full bg-vip px-1.5 py-0.5 text-[9px] leading-3 text-white">
                    {t("common.vip")}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {limitMessage && (
          <p className="mt-3 rounded-[10px] bg-primary-soft px-3 py-2 text-xs leading-5 text-primary">
            {limitMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function LanguageSheet({ onClose }: { onClose: () => void }) {
  const { localeCode, setLocaleCode, t } = usePreferences();

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-light"
        onClick={onClose}
        aria-label={t("common.done")}
      />
      <div className="relative max-h-[76%] overflow-hidden rounded-t-[22px] bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div>
            <h2 className="text-lg font-semibold leading-6 text-text">
              {t("settings.language")}
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              {t("settings.languageSheetDesc")}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-primary transition hover:bg-hover-overlay active:scale-[0.98]"
            onClick={onClose}
          >
            {t("common.done")}
          </button>
        </div>

        <div className="max-h-[560px] overflow-y-auto px-2 pb-5">
          {supportedLocales.map((option) => {
            const active = option.code === localeCode;
            return (
              <button
                key={option.code || "system"}
                type="button"
                onClick={() => {
                  setLocaleCode(option.code as LocaleCode);
                  onClose();
                }}
                className="flex h-12 w-full items-center justify-between rounded-[10px] px-3 text-left transition hover:bg-bg active:scale-[0.99]"
              >
                <span className="text-[15px] leading-5 text-text">
                  {option.code === "" ? t("settings.followSystem") : option.displayName}
                </span>
                {active && (
                  <span className="text-sm font-semibold text-primary">
                    {t("common.selected")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SettingsListItem({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[62px] w-full items-center border-b border-border-light px-3 text-left last:border-b-0 transition hover:bg-bg active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium leading-5 text-text">{title}</p>
        <p className="mt-1 truncate text-xs leading-4 text-text-tertiary">
          {description}
        </p>
      </div>
      <ChevronRightIcon className="ml-2 h-4 w-4 shrink-0 text-text-disabled" />
    </button>
  );
}

function MobilePageHeader({
  title,
  actionLabel,
  onAction,
  onBack,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  onBack: () => void;
}) {
  const { t } = usePreferences();

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
        onClick={onBack}
        aria-label={t("common.back")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="ml-1 min-w-0 flex-1 truncate text-[17px] font-semibold leading-5 text-text">
        {title}
      </h1>
      {actionLabel && onAction && (
        <button
          type="button"
          className="mr-2 h-8 rounded-full bg-surface px-3 text-xs font-semibold text-text transition active:scale-[0.98]"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </header>
  );
}

function ThemePreview({ mode }: { mode: ResolvedTheme }) {
  const isDark = mode === "dark";

  return (
    <div
      className={cn(
        "h-[58px] overflow-hidden rounded-[8px] border p-1.5",
        isDark ? "border-[#333] bg-[#111]" : "border-[#e6e6e6] bg-[#f6f6f6]"
      )}
    >
      <div
        className={cn(
          "h-2.5 w-10 rounded-full",
          isDark ? "bg-[#2d2d2d]" : "bg-white"
        )}
      />
      <div className="mt-2 flex gap-1">
        <span className="h-7 flex-1 rounded-[5px] bg-primary" />
        <span
          className={cn(
            "h-7 flex-1 rounded-[5px]",
            isDark ? "bg-[#242424]" : "bg-white"
          )}
        />
      </div>
    </div>
  );
}

function getTabLabel(page: PageType, t: ReturnType<typeof usePreferences>["t"]) {
  if (page === "records") return t("tabs.records");
  if (page === "arrangements") return t("tabs.arrangements");
  if (page === "insight") return t("tabs.insight");
  return t("tabs.mine");
}

function getJiwoLogoSrc(appIcon: AppIcon, resolvedTheme: ResolvedTheme) {
  if (appIcon === "bright" || resolvedTheme === "dark") {
    return "/images/logo-jiwo-green.svg";
  }
  return "/images/logo-jiwo.svg";
}

function formatRoundCount(count: number, label: string) {
  return /^[a-zA-Z]/.test(label) ? `${count} ${label}` : `${count}${label}`;
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.5 4.5H4.25A1.75 1.75 0 0 0 2.5 6.25v5.5c0 .97.78 1.75 1.75 1.75h5.5c.97 0 1.75-.78 1.75-1.75V9.5M8.5 2.5h5m0 0v5m0-5-6.25 6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendToSelfIcon({ className }: { className?: string }) {
  const { resolvedTheme } = usePreferences();
  const src =
    resolvedTheme === "dark"
      ? "/images/icon_send_to_self_sidebar_dark.svg"
      : "/images/icon_send_to_self_sidebar.svg";

  return (
    <img src={src} alt="" className={className} aria-hidden="true" />
  );
}

function OverviewEntryTag({ label }: { label: string }) {
  return (
    <span className="ml-1.5 shrink-0 rounded-[10px] bg-[var(--overview-entry-tag-bg)] px-2 py-0.5 text-[10px] font-medium leading-[14px] text-text-tertiary">
      {label}
    </span>
  );
}
