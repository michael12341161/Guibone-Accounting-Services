import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleMore, Search, SendHorizontal, X } from "lucide-react";
import { IconButton } from "../components/UI/buttons";
import { useLocation, useNavigate } from "react-router-dom";
import { getHomePathForRole } from "../context/AuthContext";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import { api, resolveBackendAssetUrl } from "../services/api";
import { useErrorToast } from "../utils/feedback";
import { hasModuleAccess } from "../utils/module_permissions";

const POLL_INTERVAL_MS = 15000;
const CHAT_REQUEST_TIMEOUT_MS = 12000;
const CHAT_USERS_CACHE_TTL_MS = 5000;
const CHAT_CONVERSATION_PAGE_SIZE = 80;
const DEFAULT_BUTTON_CLASS = "";
const DEFAULT_PANEL_CLASS = "absolute right-0 top-[3em] z-50 w-[24rem] max-w-[92vw]";
const PASSIVE_CHAT_REQUEST_CONFIG = Object.freeze({
  timeout: CHAT_REQUEST_TIMEOUT_MS,
  monitoringActivity: "passive",
});
const ACTIVE_CHAT_REQUEST_CONFIG = Object.freeze({
  timeout: CHAT_REQUEST_TIMEOUT_MS,
  monitoringActivity: "active",
});
let chatUsersRequestPromise = null;
let chatUsersCache = {
  owner: "",
  timestamp: 0,
  users: [],
};

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function resetChatUsersCache(owner = "") {
  chatUsersRequestPromise = null;
  chatUsersCache = {
    owner: String(owner || ""),
    timestamp: 0,
    users: [],
  };
}

function normalizePathname(pathname) {
  const raw = String(pathname || "").trim();
  if (!raw) {
    return "/";
  }

  return raw.replace(/\/+$/, "") || "/";
}

function getErrorMessage(error, fallback) {
  if (String(error?.code || "").trim().toUpperCase() === "ECONNABORTED") {
    return "Loading contacts took too long. Please try again.";
  }

  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeMessageId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parseApiDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMessageTime(value) {
  const date = parseApiDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getDisplayName(user) {
  return String(user?.full_name || user?.username || user?.role || "User").trim() || "User";
}

function getShortName(user) {
  return getDisplayName(user).split(/\s+/)[0] || "User";
}

function getConversationPreview(user) {
  const incomingPreview = String(user?.last_incoming_message || "")
    .replace(/\s+/g, " ")
    .trim();
  if (incomingPreview) {
    return incomingPreview;
  }

  const preview = String(user?.last_message || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!preview) {
    return "No messages yet";
  }

  return user?.last_message_is_own ? `You: ${preview}` : preview;
}

function getInitials(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}

function mergeMessages(currentMessages, nextMessages, mode = "replace") {
  if (mode === "replace") {
    return Array.isArray(nextMessages) ? nextMessages : [];
  }

  const base =
    mode === "prepend"
      ? [...(Array.isArray(nextMessages) ? nextMessages : []), ...(Array.isArray(currentMessages) ? currentMessages : [])]
      : [...(Array.isArray(currentMessages) ? currentMessages : []), ...(Array.isArray(nextMessages) ? nextMessages : [])];

  const seen = new Set();
  return base.filter((message) => {
    const stableId = normalizeMessageId(message?.id);
    const key =
      stableId !== null
        ? `id:${stableId}`
        : `${message?.created_at || ""}:${message?.sender_id || ""}:${message?.receiver_id || ""}:${message?.message || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function requestChatUsers(cacheOwner = "") {
  const normalizedOwner = String(cacheOwner || "");
  if (chatUsersCache.owner !== normalizedOwner) {
    resetChatUsersCache(normalizedOwner);
  }

  const now = Date.now();
  if (now - chatUsersCache.timestamp < CHAT_USERS_CACHE_TTL_MS) {
    return chatUsersCache.users;
  }

  if (chatUsersRequestPromise) {
    return chatUsersRequestPromise;
  }

  chatUsersRequestPromise = api
    .get("chat.php", {
      ...PASSIVE_CHAT_REQUEST_CONFIG,
      params: { action: "users" },
    })
    .then((response) => {
      const users = Array.isArray(response?.data?.users) ? response.data.users : [];
      chatUsersCache = {
        owner: normalizedOwner,
        timestamp: Date.now(),
        users,
      };
      return users;
    })
    .finally(() => {
      chatUsersRequestPromise = null;
    });

  return chatUsersRequestPromise;
}

async function requestConversation(partnerId, options = {}) {
  const limit = normalizeMessageId(options?.limit) || CHAT_CONVERSATION_PAGE_SIZE;
  const beforeMessageId = normalizeMessageId(options?.beforeMessageId);
  const afterMessageId = normalizeMessageId(options?.afterMessageId);
  const params = {
    action: "messages",
    partner_id: partnerId,
    limit,
  };

  if (beforeMessageId) {
    params.before_message_id = beforeMessageId;
  }

  if (afterMessageId) {
    params.after_message_id = afterMessageId;
  }

  const response = await api.get("chat.php", {
    ...PASSIVE_CHAT_REQUEST_CONFIG,
    params,
  });

  return {
    messages: Array.isArray(response?.data?.messages) ? response.data.messages : [],
    hasMoreBefore: Boolean(response?.data?.has_more_before),
    oldestMessageId: normalizeMessageId(response?.data?.oldest_message_id),
    latestMessageId: normalizeMessageId(response?.data?.latest_message_id),
  };
}

async function requestSendMessage(receiverId, message) {
  const response = await api.post(
    "chat.php",
    {
      action: "send",
      receiver_id: receiverId,
      message,
    },
    ACTIVE_CHAT_REQUEST_CONFIG
  );

  return response?.data?.message_item || null;
}

async function requestUnreadCount() {
  const response = await api.get("chat.php", {
    ...PASSIVE_CHAT_REQUEST_CONFIG,
    params: { action: "unread_count" },
  });

  const unreadCount = Number(response?.data?.unread_count);
  return Number.isFinite(unreadCount) ? Math.max(0, unreadCount) : 0;
}

async function requestHeartbeat() {
  await api.get("chat.php", {
    ...PASSIVE_CHAT_REQUEST_CONFIG,
    params: { action: "heartbeat" },
  });
}

function ChatAvatar({ user, className = "h-10 w-10", showOnlineStatus = false }) {
  const name = getDisplayName(user);
  const avatarSrc = resolveBackendAssetUrl(user?.profile_image);
  const initials = getInitials(name);

  return (
    <div className="relative shrink-0">
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={name}
          className={classNames("rounded-full object-cover ring-1 ring-white/70", className)}
        />
      ) : (
        <div
          className={classNames(
            "grid place-items-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 font-semibold text-white ring-1 ring-white/70",
            className
          )}
        >
          <span className="text-xs">{initials}</span>
        </div>
      )}

      {showOnlineStatus ? (
        <span
          className={classNames(
            "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white",
            user?.is_online ? "bg-sky-500" : "bg-slate-300"
          )}
        />
      ) : null}
    </div>
  );
}

function BubbleChatSurface({
  chatCacheKey = "",
  className,
  conversationHeightClassName = "h-72",
  initialPartnerId = null,
  layout = "stacked",
  showConversationPanel = true,
  onUserSelect,
  onClose,
}) {
  const { isDarkMode } = useTheme();
  const normalizedInitialPartnerId =
    Number.isFinite(Number(initialPartnerId)) && Number(initialPartnerId) > 0 ? Number(initialPartnerId) : null;
  const [users, setUsers] = useState([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState(normalizedInitialPartnerId);
  const [messages, setMessages] = useState([]);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [draft, setDraft] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);
  const messagesRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const selectedPartnerIdRef = useRef(normalizedInitialPartnerId);
  const oldestMessageIdRef = useRef(null);
  const latestMessageIdRef = useRef(null);
  const selectedPartner = users.find((user) => user.id === selectedPartnerId) || null;
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedUserSearch) {
      return true;
    }

    const displayName = getDisplayName(user).toLowerCase();
    const role = String(user?.role || "").toLowerCase();
    return displayName.includes(normalizedUserSearch) || role.includes(normalizedUserSearch);
  });

  const scrollToBottom = (behavior = "auto") => {
    if (!messagesRef.current) return;

    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior,
    });
  };

  const handleMessagesScroll = () => {
    if (!messagesRef.current) return;

    const { scrollHeight, scrollTop, clientHeight } = messagesRef.current;
    shouldStickToBottomRef.current = scrollHeight - scrollTop - clientHeight < 72;
  };

  const loadConversation = useCallback(
    async ({ quiet = false, beforeMessageId = null, afterMessageId = null, mode = "replace" } = {}) => {
      const partnerId = selectedPartnerIdRef.current;
      if (!partnerId) {
        setMessages([]);
        setHasMoreBefore(false);
        setLoadingMessages(false);
        setLoadingOlderMessages(false);
        return null;
      }

      if (mode === "prepend") {
        setLoadingOlderMessages(true);
      } else if (!quiet) {
        setLoadingMessages(true);
      }

      try {
        const result = await requestConversation(partnerId, {
          limit: CHAT_CONVERSATION_PAGE_SIZE,
          beforeMessageId,
          afterMessageId,
        });

        if (selectedPartnerIdRef.current !== partnerId) {
          return null;
        }

        setError("");
        if (mode === "replace" || mode === "prepend" || result.messages.length > 0) {
          setMessages((currentMessages) => mergeMessages(currentMessages, result.messages, mode));
        }
        if (mode === "replace" || mode === "prepend") {
          setHasMoreBefore(Boolean(result.hasMoreBefore));
        }

        return result;
      } catch (requestError) {
        if (selectedPartnerIdRef.current === partnerId) {
          setError(getErrorMessage(requestError, "Unable to load messages."));
        }
        return null;
      } finally {
        if (mode === "prepend") {
          setLoadingOlderMessages(false);
        } else if (!quiet) {
          setLoadingMessages(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async (quiet = false) => {
      if (!quiet) {
        setLoadingUsers(true);
      }

      try {
        const nextUsers = await requestChatUsers(chatCacheKey);
        if (cancelled) return;

        setUsers(nextUsers);
        setError("");
        setSelectedPartnerId((current) => {
          if (current && nextUsers.some((user) => user.id === current)) {
            return current;
          }

          if (normalizedInitialPartnerId && nextUsers.some((user) => user.id === normalizedInitialPartnerId)) {
            return normalizedInitialPartnerId;
          }

          return nextUsers[0]?.id ?? null;
        });
      } catch (requestError) {
        if (cancelled) return;
        setError(getErrorMessage(requestError, "Unable to load chat users."));
      } finally {
        if (!cancelled && !quiet) {
          setLoadingUsers(false);
        }
      }
    };

    void loadUsers(false);
    const intervalId = window.setInterval(() => {
      void loadUsers(true);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [chatCacheKey, normalizedInitialPartnerId]);

  useEffect(() => {
    selectedPartnerIdRef.current = selectedPartnerId;
    shouldStickToBottomRef.current = true;
    oldestMessageIdRef.current = null;
    latestMessageIdRef.current = null;
    setDraft("");
    setMessages([]);
    setHasMoreBefore(false);
    setLoadingOlderMessages(false);
  }, [selectedPartnerId]);

  useEffect(() => {
    oldestMessageIdRef.current = messages.length > 0 ? normalizeMessageId(messages[0]?.id) : null;
    latestMessageIdRef.current =
      messages.length > 0 ? normalizeMessageId(messages[messages.length - 1]?.id) : null;
  }, [messages]);

  useEffect(() => {
    if (!showConversationPanel) {
      setMessages([]);
      setHasMoreBefore(false);
      setLoadingMessages(false);
      setLoadingOlderMessages(false);
      return undefined;
    }

    let cancelled = false;

    const loadInitialConversation = async () => {
      await loadConversation({ mode: "replace" });
    };

    void loadInitialConversation();
    const intervalId = window.setInterval(() => {
      if (cancelled || !selectedPartnerIdRef.current) {
        return;
      }

      const latestMessageId = latestMessageIdRef.current;
      void loadConversation({
        quiet: true,
        mode: latestMessageId ? "append" : "replace",
        afterMessageId: latestMessageId,
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadConversation, selectedPartnerId, showConversationPanel]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current) {
        scrollToBottom("auto");
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages]);

  async function loadOlderMessages() {
    const oldestMessageId = oldestMessageIdRef.current;
    if (!selectedPartnerId || !oldestMessageId || loadingOlderMessages) {
      return;
    }

    await loadConversation({
      beforeMessageId: oldestMessageId,
      mode: "prepend",
    });
  }

  async function sendMessage() {
    const trimmedDraft = draft.trim();
    if (!trimmedDraft || !selectedPartnerId || sending) {
      return;
    }

    setSending(true);

    try {
      const sentMessage = await requestSendMessage(selectedPartnerId, trimmedDraft);
      setDraft("");
      setError("");
      shouldStickToBottomRef.current = true;

      if (sentMessage) {
        setMessages((currentMessages) => mergeMessages(currentMessages, [sentMessage], "append"));
      } else {
        await loadConversation({
          quiet: true,
          mode: latestMessageIdRef.current ? "append" : "replace",
          afterMessageId: latestMessageIdRef.current,
        });
      }

      window.requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to send message."));
    } finally {
      setSending(false);
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  };

  const partnerStatusLabel = selectedPartner
    ? selectedPartner.is_online
      ? "Active now"
      : selectedPartner.role || "Available"
    : loadingUsers
      ? "Loading conversations..."
      : "Select a contact to start chatting";
  const isSplitLayout = layout === "split";

  return (
    <div
      className={classNames(
        isSplitLayout ? "grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]" : "space-y-4",
        className
      )}
    >
      <section
        className={classNames(
          "overflow-hidden rounded-[1.35rem] border ring-1",
          isDarkMode
            ? "border-slate-200 bg-white shadow-[0_24px_50px_-30px_rgba(2,6,23,0.85)] ring-white/5"
            : "border-slate-200/80 bg-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)] ring-slate-950/5"
        )}
      >
        <div className={classNames("border-b px-4 py-4", isDarkMode ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/90")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">People</div>
              <div className="mt-1 text-xs text-slate-500">Choose who you want to chat with.</div>
            </div>
            {onClose && !showConversationPanel ? (
              <button
                type="button"
                onClick={onClose}
                className={classNames(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition",
                  isDarkMode
                    ? "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    : "border-slate-200 bg-white/80 text-slate-500 hover:bg-white hover:text-slate-700"
                )}
                aria-label="Close chat"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-2 shadow-sm focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100">
            <Search className="h-4 w-4 shrink-0 text-sky-500" strokeWidth={2} />
            <input
              type="text"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="Search people..."
              aria-label="Search people"
            />
          </label>
        </div>

        <div className={classNames("overflow-y-auto p-2", isSplitLayout ? conversationHeightClassName : "max-h-56")}>
          {loadingUsers ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center">
              <div className="text-center text-sm text-slate-500">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
                Loading contacts...
              </div>
            </div>
          ) : error && users.length === 0 ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-4 text-center">
              <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-5 text-xs text-rose-600">
                {error}
              </div>
            </div>
          ) : filteredUsers.length > 0 ? (
            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const isActive = user.id === selectedPartnerId;
                const nameClassName = isActive
                  ? "text-white"
                  : isDarkMode
                    ? "text-sky-50"
                    : "text-sky-900";
                const roleClassName = isActive
                  ? "text-white/80"
                  : isDarkMode
                    ? "text-sky-100/75"
                    : "text-sky-700";
                const previewClassName = isActive
                  ? "text-white/80"
                  : isDarkMode
                    ? "text-slate-300"
                    : "text-slate-500";
                const previewText = getConversationPreview(user);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedPartnerId(user.id);
                      if (!showConversationPanel && typeof onUserSelect === "function") {
                        onUserSelect(user.id);
                      }
                    }}
                    className={classNames(
                      "flex w-full items-center gap-3 rounded-[1.1rem] border px-3 py-3 text-left transition",
                      isActive
                        ? isDarkMode
                          ? "border-sky-400/35 bg-sky-600 text-white shadow-sm"
                          : "border-sky-300 bg-sky-500 text-white shadow-sm"
                        : isDarkMode
                          ? "border-sky-900/50 bg-sky-950/35 text-sky-100 hover:border-sky-700/60 hover:bg-sky-900/45"
                          : "border-sky-200 bg-sky-50/90 text-sky-700 hover:border-sky-300 hover:bg-sky-100/80"
                    )}
                  >
                    <ChatAvatar user={user} className="h-11 w-11" showOnlineStatus />
                    <div className="min-w-0 flex-1">
                      <div className={classNames("truncate text-sm font-semibold", nameClassName)}>{getDisplayName(user)}</div>
                      <div className={classNames("mt-0.5 truncate text-xs", roleClassName)}>{user.role || "User"}</div>
                      <div className={classNames("mt-1 truncate text-xs", previewClassName)}>{previewText}</div>
                    </div>
                    <span
                      className={classNames(
                        "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                        user.is_online
                          ? isActive
                            ? "bg-white/15 text-white"
                            : isDarkMode
                              ? "bg-sky-500/15 text-sky-100"
                              : "bg-sky-100 text-sky-700"
                          : isActive
                            ? "bg-slate-900/25 text-white/85"
                            : isDarkMode
                              ? "bg-slate-900/60 text-sky-100/80"
                              : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {user.is_online ? "Online" : "Offline"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : users.length > 0 ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-4 text-center">
              <div className="rounded-[1rem] border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-xs text-slate-500">
                No users match your search.
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-4 text-center">
              <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-500">
                No available teammates or clients to message right now.
              </div>
            </div>
          )}
        </div>
      </section>

      {showConversationPanel ? (
        <section
          className={classNames(
            "flex min-h-0 flex-col overflow-hidden rounded-[1.35rem] border ring-1",
            isDarkMode
              ? "border-slate-200 bg-white shadow-[0_24px_50px_-30px_rgba(2,6,23,0.85)] ring-white/5"
              : "border-slate-200/80 bg-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.45)] ring-slate-950/5"
          )}
        >
          <div className={classNames("border-b px-4 py-4", isDarkMode ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/90")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {selectedPartner ? getDisplayName(selectedPartner) : "Messages"}
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{partnerStatusLabel}</div>
              </div>

              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className={classNames(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition",
                    isDarkMode
                      ? "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      : "border-slate-200 bg-white/80 text-slate-500 hover:bg-white hover:text-slate-700"
                  )}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              ) : (
                <span
                  className={classNames(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm ring-1",
                    isDarkMode
                      ? "bg-slate-900/80 text-sky-300 ring-sky-500/20"
                      : "bg-white/80 text-sky-600 ring-sky-100"
                  )}
                >
                  <MessageCircleMore className="h-5 w-5" strokeWidth={1.8} />
                </span>
              )}
            </div>
          </div>

          <div className={classNames("px-3 py-3", isDarkMode ? "bg-slate-950/90" : "bg-slate-50/80")}>
            <div
              ref={messagesRef}
              onScroll={handleMessagesScroll}
              className={classNames("space-y-3 overflow-y-auto pr-1", conversationHeightClassName)}
            >
              {!loadingMessages && (hasMoreBefore || loadingOlderMessages) ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      void loadOlderMessages();
                    }}
                    disabled={loadingOlderMessages}
                    className={classNames(
                      "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                      loadingOlderMessages
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-sky-200 bg-white text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                    )}
                  >
                    {loadingOlderMessages ? "Loading earlier messages..." : "Load earlier messages"}
                  </button>
                </div>
              ) : null}

              {loadingMessages ? (
                <div className="flex h-full min-h-[11rem] items-center justify-center">
                  <div className="text-center text-sm text-slate-500">
                    <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
                    Loading conversation...
                  </div>
                </div>
              ) : messages.length > 0 ? (
                messages.map((message) => (
                  <div
                    key={message.id || `${message.created_at}-${message.sender_id}-${message.receiver_id}`}
                    className={classNames("flex", message.is_own ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={classNames(
                        "max-w-[85%] rounded-[1.3rem] px-3 py-2 shadow-sm ring-1",
                        message.is_own
                          ? "rounded-br-md bg-sky-600 text-white ring-sky-400/40"
                          : isDarkMode
                            ? "rounded-bl-md bg-slate-900/85 text-slate-200 ring-slate-700"
                            : "rounded-bl-md bg-white text-slate-700 ring-slate-200"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.message}</p>
                      <div
                        className={classNames(
                          "mt-1 text-[11px] font-medium",
                          message.is_own ? "text-white/70" : "text-slate-400"
                        )}
                      >
                        {formatMessageTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-full min-h-[11rem] items-center justify-center px-4 text-center">
                  <div>
                    <div
                      className={classNames(
                        "mx-auto flex h-12 w-12 items-center justify-center rounded-full shadow-sm ring-1",
                        isDarkMode
                          ? "bg-slate-900/85 text-sky-300 ring-sky-500/20"
                          : "bg-white text-sky-600 ring-sky-100"
                      )}
                    >
                      <MessageCircleMore className="h-6 w-6" strokeWidth={1.8} />
                    </div>
                    <div className="mt-3 text-sm font-semibold text-slate-700">No messages yet</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {selectedPartner
                        ? `Send the first message to ${getShortName(selectedPartner)}.`
                        : "Choose a contact to begin a conversation."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-600">
              {error}
            </div>
          ) : null}

          <div
            className={classNames(
              "border-t p-3",
              isDarkMode ? "border-slate-800 bg-slate-950/95" : "border-slate-100 bg-white"
            )}
          >
            {selectedPartner ? (
              <form
                className={classNames(
                  "rounded-[1rem] border p-2 shadow-inner transition focus-within:ring-2",
                  isDarkMode
                    ? "border-slate-700 bg-slate-900 shadow-black/20 focus-within:ring-sky-500/30"
                    : "border-slate-200 bg-slate-50 shadow-slate-100/70 focus-within:ring-sky-200"
                )}
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    className={classNames(
                      "flex-1 bg-transparent px-2 text-sm outline-none",
                      isDarkMode
                        ? "text-white caret-sky-400 placeholder:text-slate-400"
                        : "text-slate-700 caret-sky-600 placeholder:text-slate-400"
                    )}
                    placeholder={`Message ${getShortName(selectedPartner)}...`}
                    aria-label={`Message ${getDisplayName(selectedPartner)}`}
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className={classNames(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
                      sending || !draft.trim()
                        ? isDarkMode
                          ? "cursor-not-allowed bg-sky-500/15 text-sky-300"
                          : "cursor-not-allowed bg-sky-100 text-sky-600"
                        : "bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                    )}
                    aria-label="Send message"
                  >
                    <SendHorizontal className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </form>
            ) : (
              <div
                className={classNames(
                  "rounded-[1rem] border border-dashed px-3 py-4 text-center text-xs",
                  isDarkMode
                    ? "border-slate-700 bg-slate-900/80 text-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                )}
              >
                {loadingUsers ? "Loading contacts..." : "Select a user from the first card to start chatting."}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function BubbleChat({
  mode = "floating",
  className = "",
  buttonClass = DEFAULT_BUTTON_CLASS,
  panelClass = DEFAULT_PANEL_CLASS,
  conversationHeightClassName,
  initialPartnerId = null,
  layout,
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, isAuthReady } = useAuth();
  const { permissions, isLoading: isPermissionsLoading } = useModulePermissions();
  const rootRef = useRef(null);
  const isEmbedded = mode === "sidebar" || mode === "embedded";
  const resolvedLayout = layout || (isEmbedded ? "split" : "stacked");
  const unreadBadgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const messagingPath = `${getHomePathForRole(user || role)}/messaging`;
  const userId = Number(user?.id ?? user?.user_id ?? user?.User_ID ?? 0) || null;
  const canAccessMessaging = hasModuleAccess(user, "messaging", permissions);
  const suppressFloatingChat = !isEmbedded && normalizePathname(location.pathname) === normalizePathname(messagingPath);

  useEffect(() => {
    if (suppressFloatingChat || !isAuthReady || !userId) {
      return undefined;
    }

    let cancelled = false;

    const heartbeat = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      try {
        await requestHeartbeat();
      } catch (_) {
        // Presence updates are best-effort and should not disturb the UI.
      }
    };

    void heartbeat();

    const intervalId = window.setInterval(() => {
      void heartbeat();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void heartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthReady, suppressFloatingChat, userId]);

  useEffect(() => {
    if (!isAuthReady || !userId) {
      setUnreadCount(0);
      return undefined;
    }

    if (isEmbedded || suppressFloatingChat) {
      return undefined;
    }

    let cancelled = false;

    const loadUnreadCount = async () => {
      try {
        const nextCount = await requestUnreadCount();
        if (!cancelled) {
          setUnreadCount(nextCount);
        }
      } catch (_) {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    };

    void loadUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadUnreadCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthReady, isEmbedded, suppressFloatingChat, userId]);

  useEffect(() => {
    if (isEmbedded || !open) {
      return undefined;
    }

    const handleDocumentClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEmbedded, open]);

  useEffect(() => {
    if (isEmbedded || !open) {
      return undefined;
    }

    const handleResize = () => setOpen(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isEmbedded, open]);

  if (isAuthReady && !isPermissionsLoading && !canAccessMessaging) {
    return null;
  }

  if (suppressFloatingChat) {
    return null;
  }

  if (isEmbedded) {
    return (
      <BubbleChatSurface
        chatCacheKey={userId || ""}
        className={className}
        conversationHeightClassName={conversationHeightClassName || "h-64"}
        initialPartnerId={initialPartnerId}
        layout={resolvedLayout}
        showConversationPanel
      />
    );
  }

  return (
    <div ref={rootRef} className={classNames("relative", className)}>
      <IconButton
        variant="secondary"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Bubble Chat"
        className={classNames("relative", buttonClass)}
      >
        <MessageCircleMore className="h-5 w-5" strokeWidth={1.8} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-rose-400/70 animate-ping" />
            <span className="relative inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {unreadBadgeText}
            </span>
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className={panelClass} role="dialog" aria-label="Messenger chat">
          <BubbleChatSurface
            chatCacheKey={userId || ""}
            conversationHeightClassName={conversationHeightClassName || "h-80"}
            initialPartnerId={initialPartnerId}
            layout={resolvedLayout}
            showConversationPanel={false}
            onUserSelect={(partnerId) => {
              setOpen(false);
              navigate(messagingPath, {
                state: { initialPartnerId: partnerId },
              });
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
