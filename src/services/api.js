import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { mergePermissions } from "../utils/module_permissions";
import { DEFAULT_TASK_WORKLOAD_SETTINGS, normalizeTaskWorkloadSettings } from "../utils/task_workload";

const DEFAULT_API_ORIGIN = "http://localhost:8000";
const DEFAULT_API_PATH = "/backend/api";
const DEFAULT_API_TIMEOUT_MS = 30000;
const AUTH_TOKEN_KEY = "token";

function parsePositiveInteger(value, fallback, minimum = 0) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function withTrailingSlash(value) {
  const normalized = String(value || "").trim();
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeApiPath(value) {
  const normalized = String(value || DEFAULT_API_PATH).trim() || DEFAULT_API_PATH;
  const prefixed = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return prefixed.replace(/\/+$/, "");
}

function normalizeApiBaseUrl(rawUrl, rawPath = DEFAULT_API_PATH) {
  const fallbackPath = normalizeApiPath(rawPath);
  const candidate = String(rawUrl || DEFAULT_API_ORIGIN).trim();
  if (!candidate) {
    return withTrailingSlash(`${DEFAULT_API_ORIGIN}${fallbackPath}`);
  }

  if (candidate.startsWith("/")) {
    return withTrailingSlash(candidate.replace(/\/+$/, ""));
  }

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(candidate)
    ? candidate
    : `http://${candidate}`;

  try {
    const url = new URL(withProtocol);
    let pathname = url.pathname.replace(/\/+$/, "");

    if (!pathname || pathname === "/") {
      pathname = fallbackPath;
    } else if (/\/backend$/i.test(pathname)) {
      pathname = `${pathname}/api`;
    } else if (!/\/api$/i.test(pathname) && !/\/api\//i.test(pathname)) {
      pathname = `${pathname}${fallbackPath}`;
    }

    url.pathname = withTrailingSlash(pathname);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return withTrailingSlash(`${DEFAULT_API_ORIGIN}${fallbackPath}`);
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || DEFAULT_API_ORIGIN,
  process.env.REACT_APP_API_PATH || DEFAULT_API_PATH
);
export const API_REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.REACT_APP_API_TIMEOUT_MS,
  DEFAULT_API_TIMEOUT_MS,
  1000
);
const API_RETRY_ATTEMPTS = parsePositiveInteger(process.env.REACT_APP_API_RETRY_ATTEMPTS, 1, 0);
const baseURL = API_BASE_URL;
const JWT_REFRESH_HEADER = "x-monitoring-jwt";
const SESSION_ACTIVITY_HEADER = "X-Monitoring-Activity";
// Keep this short so background polling does not extend inactivity timeouts.
const RECENT_ACTIVITY_WINDOW_MS = 5 * 1000;
const PASSIVE_METHODS = new Set(["get", "head", "options"]);
const RATE_LIMIT_RETRY_BUFFER_MS = 1500;
const RATE_LIMIT_FALLBACK_RETRY_MS = 60 * 1000;
const RATE_LIMIT_MAX_RETRY_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_RETRY_ATTEMPTS = 3;
const IDEMPOTENT_METHODS = new Set(["get", "head", "options"]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 500, 502, 503, 504]);
export const MONITORING_AUTH_INVALID_EVENT = "monitoring:auth-invalid";
export const MONITORING_AUTH_USER_SYNC_EVENT = "monitoring:auth-user-sync";
export const MONITORING_SYSTEM_CONFIG_UPDATED_EVENT = "monitoring:system-config-updated";
export const MONITORING_SCHEDULED_BACKUP_EVENT = "monitoring:scheduled-backup";
export const MONITORING_AUTH_REQUIRED_MESSAGE = "Authentication is required.";
export const MONITORING_SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";
export const MONITORING_RATE_LIMITED_MESSAGE = "Too many requests. Please wait a moment and try again.";

let lastUserInteractionAt = 0;
let rateLimitCooldownUntil = 0;
const pendingRateLimitRetries = new Map();

function dispatchAuthInvalidEvent() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(MONITORING_AUTH_INVALID_EVENT));
}

function dispatchAuthUserSyncEvent(user) {
  if (typeof window === "undefined" || !user || typeof user !== "object") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(MONITORING_AUTH_USER_SYNC_EVENT, {
      detail: { user },
    })
  );
}

function syncUserFromResponse(response) {
  const token = String(response?.headers?.[JWT_REFRESH_HEADER] || response?.data?.token || "").trim();
  if (!token) {
    return;
  }

  storeAuthToken(token);

  try {
    const decoded = jwtDecode(token);
    const nextUser = decoded?.user;
    if (nextUser && typeof nextUser === "object") {
      dispatchAuthUserSyncEvent(nextUser);
    }
  } catch (_) {}
}

export function recordUserInteraction(timestamp = Date.now()) {
  if (!Number.isFinite(timestamp)) {
    lastUserInteractionAt = Date.now();
    return;
  }

  lastUserInteractionAt = Math.max(lastUserInteractionAt, Math.trunc(timestamp));
}

function resolveMonitoringActivityMode(config = {}) {
  const explicitMode = String(config?.monitoringActivity || "").trim().toLowerCase();
  if (explicitMode === "active" || explicitMode === "passive") {
    return explicitMode;
  }

  if (Date.now() - lastUserInteractionAt <= RECENT_ACTIVITY_WINDOW_MS) {
    return "active";
  }

  const method = String(config?.method || "get").trim().toLowerCase();
  if (PASSIVE_METHODS.has(method)) {
    return "passive";
  }

  return "passive";
}

function attachMonitoringActivity(config) {
  const nextConfig = { ...config };
  const headers = { ...(nextConfig.headers || {}) };
  headers[SESSION_ACTIVITY_HEADER] = resolveMonitoringActivityMode(nextConfig);
  nextConfig.headers = headers;
  delete nextConfig.monitoringActivity;
  return nextConfig;
}

function hasAuthorizationHeader(headers = {}) {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === "authorization" && String(headers[key] || "").trim() !== ""
  );
}

function isExpiredStoredToken(token) {
  try {
    const decoded = jwtDecode(token);
    const expiresAt = Number(decoded?.exp || 0);
    return expiresAt > 0 && expiresAt * 1000 <= Date.now() + 5000;
  } catch (_) {
    return true;
  }
}

function attachStoredAuthToken(config) {
  const nextConfig = { ...config };
  const headers = { ...(nextConfig.headers || {}) };
  if (!hasAuthorizationHeader(headers)) {
    const token = getStoredAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  nextConfig.headers = headers;
  return nextConfig;
}

export function isAuthenticationRequiredMessage(message) {
  return (
    String(message ?? "").trim().toLowerCase() === MONITORING_AUTH_REQUIRED_MESSAGE.toLowerCase()
  );
}

export function isAuthenticationError(error) {
  if (error?.response?.status === 401) {
    return true;
  }

  return isAuthenticationRequiredMessage(error?.response?.data?.message || error?.message);
}

function normalizeAuthenticationError(error) {
  if (!isAuthenticationError(error)) {
    return error;
  }

  const nextMessage = MONITORING_SESSION_EXPIRED_MESSAGE;

  if (error?.response?.data && typeof error.response.data === "object") {
    error.response.data = {
      ...error.response.data,
      auth_invalid: true,
      message: nextMessage,
    };
  }

  error.monitoringAuthInvalid = true;
  error.monitoringUserMessage = nextMessage;
  error.message = nextMessage;
  return error;
}

export function isRateLimitError(error) {
  return error?.response?.status === 429;
}

export function isRateLimitResponse(response) {
  return response?.status === 429;
}

function parseRetryAfterMs(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return 0;
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) {
    return numericValue > 0 ? numericValue * 1000 : 0;
  }

  const retryAt = Date.parse(normalized);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
}

function parseUnixResetMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  const resetAtMs = numericValue > 9999999999 ? numericValue : numericValue * 1000;
  return Math.max(0, resetAtMs - Date.now());
}

export function getRateLimitRetryDelayMs(response) {
  if (!isRateLimitResponse(response)) {
    return 0;
  }

  const headers = response?.headers || {};
  const retryAfterMs = parseRetryAfterMs(headers["retry-after"] ?? headers["Retry-After"]);
  const resetMs = parseUnixResetMs(headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"]);
  const payloadRetryMs = parseRetryAfterMs(response?.data?.retry_after);
  const payloadWindowMs = parseRetryAfterMs(response?.data?.window_seconds);
  const relativeRetryMs = [retryAfterMs, payloadRetryMs]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left)[0];
  const candidateMs = relativeRetryMs || resetMs || payloadWindowMs;
  const delayMs = candidateMs || RATE_LIMIT_FALLBACK_RETRY_MS;
  return Math.min(RATE_LIMIT_MAX_RETRY_MS, Math.max(1000, delayMs + RATE_LIMIT_RETRY_BUFFER_MS));
}

function rememberRateLimitCooldown(response) {
  const retryDelayMs = getRateLimitRetryDelayMs(response);
  rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + retryDelayMs);
  return retryDelayMs;
}

function clearRateLimitCooldown() {
  rateLimitCooldownUntil = 0;
  pendingRateLimitRetries.clear();
}

function makeCanceledError(message = "Request canceled during rate-limit cooldown.") {
  if (typeof axios.CanceledError === "function") {
    return new axios.CanceledError(message);
  }

  const error = new Error(message);
  error.code = "ERR_CANCELED";
  return error;
}

function wait(ms, signal) {
  if (signal?.aborted) {
    return Promise.reject(makeCanceledError());
  }

  const delayMs = Math.max(0, Number(ms) || 0);
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    const abort = () => {
      if (timeoutId !== null) {
        if (typeof window !== "undefined") {
          window.clearTimeout(timeoutId);
        } else {
          clearTimeout(timeoutId);
        }
      }
      if (signal) {
        signal.removeEventListener("abort", abort);
      }
      reject(makeCanceledError());
    };
    const complete = () => {
      if (signal) {
        signal.removeEventListener("abort", abort);
      }
      resolve();
    };

    if (signal) {
      signal.addEventListener("abort", abort, { once: true });
    }
    timeoutId = typeof window !== "undefined"
      ? window.setTimeout(complete, delayMs)
      : setTimeout(complete, delayMs);
  });
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (typeof FormData !== "undefined" && value instanceof FormData) {
    return "[form-data]";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function rateLimitRetryKey(config = {}) {
  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");
  const base = String(config.baseURL || "");
  return `${method}:${base}${url}:${stableStringify(config.params || {})}`;
}

function getRateLimitRetryCount(config = {}) {
  const retryCount = Number(config.__monitoringRateLimitRetryCount || 0);
  return Number.isFinite(retryCount) && retryCount > 0 ? Math.trunc(retryCount) : 0;
}

function getMonitoringActivityHeaderValue(config = {}) {
  const headers = config?.headers || {};
  return String(
    headers[SESSION_ACTIVITY_HEADER] ?? headers[SESSION_ACTIVITY_HEADER.toLowerCase()] ?? ""
  ).trim().toLowerCase();
}

function shouldRetryRateLimitedRequest(config = {}) {
  if (!config || config.monitoringRateLimitRetry === false) {
    return false;
  }

  if (getRateLimitRetryCount(config) >= RATE_LIMIT_MAX_RETRY_ATTEMPTS) {
    return false;
  }

  if (
    config.monitoringRateLimitRetry !== true &&
    getMonitoringActivityHeaderValue(config) === "active"
  ) {
    return false;
  }

  const method = String(config.method || "get").toLowerCase();
  return IDEMPOTENT_METHODS.has(method) || config.monitoringRateLimitRetry === true;
}

function shouldWaitForRateLimitCooldown(config = {}) {
  if (!config || config.monitoringRateLimitBypassCooldown === true) {
    return false;
  }

  if (config.monitoringRateLimitWaitForCooldown === true) {
    return true;
  }

  const activityMode = getMonitoringActivityHeaderValue(config);
  if (activityMode === "passive") {
    return false;
  }

  const method = String(config.method || "get").toLowerCase();
  return IDEMPOTENT_METHODS.has(method);
}

function prepareMonitoringRequest(config) {
  const nextConfig = attachStoredAuthToken(attachMonitoringActivity(config));
  if (!shouldWaitForRateLimitCooldown(nextConfig)) {
    return nextConfig;
  }

  const cooldownDelayMs = Math.max(0, rateLimitCooldownUntil - Date.now());
  if (cooldownDelayMs <= 0) {
    return nextConfig;
  }

  return wait(cooldownDelayMs, nextConfig.signal).then(() => nextConfig);
}

function retryRateLimitedRequest(instance, error) {
  normalizeRateLimitError(error);

  const originalConfig = error?.config || {};
  const retryDelayMs = rememberRateLimitCooldown(error.response);
  if (!shouldRetryRateLimitedRequest(originalConfig)) {
    return Promise.reject(error);
  }

  const method = String(originalConfig.method || "get").toLowerCase();
  const retryConfig = {
    ...originalConfig,
    __monitoringRateLimitRetryCount: getRateLimitRetryCount(originalConfig) + 1,
  };
  const cooldownDelayMs = Math.max(retryDelayMs, rateLimitCooldownUntil - Date.now());

  const runRetry = () =>
    wait(cooldownDelayMs, retryConfig.signal).then(() => instance.request(retryConfig));

  if (!IDEMPOTENT_METHODS.has(method)) {
    return runRetry();
  }

  const key = rateLimitRetryKey(originalConfig);
  if (pendingRateLimitRetries.has(key)) {
    return pendingRateLimitRetries.get(key);
  }

  const retryPromise = runRetry().finally(() => {
    pendingRateLimitRetries.delete(key);
  });
  pendingRateLimitRetries.set(key, retryPromise);
  return retryPromise;
}

function normalizeRateLimitError(error) {
  if (!isRateLimitError(error)) {
    return error;
  }

  const responseData = error?.response?.data;
  const nextMessage = String(responseData?.message || error?.message || MONITORING_RATE_LIMITED_MESSAGE).trim();

  if (error?.response) {
    error.response.data =
      responseData && typeof responseData === "object"
        ? {
            ...responseData,
            rate_limited: true,
            message: nextMessage,
          }
        : {
            success: false,
            rate_limited: true,
            message: nextMessage,
          };
  }

  error.monitoringRateLimited = true;
  error.monitoringUserMessage = nextMessage;
  error.message = nextMessage;
  return error;
}

function getNetworkRetryCount(config = {}) {
  const retryCount = Number(config.__monitoringNetworkRetryCount || 0);
  return Number.isFinite(retryCount) && retryCount > 0 ? Math.trunc(retryCount) : 0;
}

function normalizeTransportError(error) {
  if (!error || error.monitoringTransportNormalized) {
    return error;
  }

  const responseData = error?.response?.data;
  const responseMessage =
    responseData && typeof responseData === "object" ? String(responseData.message || "").trim() : "";
  const stringPayload = typeof responseData === "string" ? responseData.trim() : "";
  const status = Number(error?.response?.status || 0);
  let nextMessage = responseMessage || String(error?.message || "").trim();

  if (error?.code === "ECONNABORTED" || /timeout/i.test(nextMessage)) {
    nextMessage = `Request timed out. Check that the PHP backend is running and forwarded at ${API_BASE_URL}.`;
  } else if (!error?.response && /network error/i.test(nextMessage)) {
    nextMessage = `Network error. Check that the PHP backend is running at ${API_BASE_URL} and that CORS allows this frontend.`;
  } else if (status === 404) {
    nextMessage = `Requested resource not found. Check the API URL and endpoint path: ${API_BASE_URL}.`;
  } else if (stringPayload && /^</.test(stringPayload)) {
    nextMessage = `The backend returned HTML instead of JSON. Check that React is calling the PHP API at ${API_BASE_URL}.`;
  } else if (stringPayload && !responseMessage && status >= 400) {
    nextMessage = stringPayload.slice(0, 240);
  } else if (!nextMessage) {
    nextMessage = "Request failed. Check the backend connection.";
  }

  error.monitoringTransportNormalized = true;
  error.monitoringUserMessage = nextMessage;
  error.message = nextMessage;

  if (error?.response) {
    error.response.data =
      responseData && typeof responseData === "object"
        ? { ...responseData, message: nextMessage }
        : { success: false, message: nextMessage };
  }

  return error;
}

function shouldRetryTransientRequest(error) {
  const config = error?.config || {};
  if (config.monitoringRetry === false || API_RETRY_ATTEMPTS <= 0) {
    return false;
  }

  if (getNetworkRetryCount(config) >= API_RETRY_ATTEMPTS) {
    return false;
  }

  const method = String(config.method || "get").toLowerCase();
  if (!IDEMPOTENT_METHODS.has(method) && config.monitoringRetry !== true) {
    return false;
  }

  if (!error?.response) {
    return error?.code === "ECONNABORTED" || /network error/i.test(String(error?.message || ""));
  }

  return TRANSIENT_STATUS_CODES.has(Number(error.response.status || 0));
}

function retryTransientRequest(instance, error) {
  normalizeTransportError(error);
  if (!shouldRetryTransientRequest(error)) {
    return Promise.reject(error);
  }

  const originalConfig = error?.config || {};
  const retryCount = getNetworkRetryCount(originalConfig) + 1;
  const retryConfig = {
    ...originalConfig,
    __monitoringNetworkRetryCount: retryCount,
  };
  const retryDelayMs = Math.min(2500, 400 * retryCount);

  return wait(retryDelayMs, retryConfig.signal).then(() => instance.request(retryConfig));
}

function normalizeSuccessfulJsonResponse(response) {
  if (response?.config?.responseType && response.config.responseType !== "json") {
    return response;
  }

  const contentType = String(response?.headers?.["content-type"] || "").toLowerCase();
  const data = response?.data;
  if (typeof data !== "string" || !contentType.includes("application/json")) {
    return response;
  }

  const trimmed = data.trim();
  if (!trimmed) {
    response.data = {};
    return response;
  }

  try {
    response.data = JSON.parse(trimmed);
    return response;
  } catch (_) {
    const error = new Error("Invalid JSON response from the backend.");
    error.response = response;
    error.config = response.config;
    throw normalizeTransportError(error);
  }
}

export function resolveApiEndpointUrl(endpoint = "") {
  const value = String(endpoint || "").trim();
  if (!value) return API_BASE_URL;
  if (/^https?:\/\//i.test(value)) return value;

  const base = API_BASE_URL.replace(/\/+$/, "");
  const path = value.replace(/^\/+/, "");
  return `${base}/${path}`;
}

export function clearStoredAuthToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}

  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}
}

export function storeAuthToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken || isExpiredStoredToken(normalizedToken)) {
    clearStoredAuthToken();
    return;
  }

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, normalizedToken);
  } catch (_) {}

  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, normalizedToken);
  } catch (_) {}
}

export function getStoredAuthToken() {
  let token = "";

  try {
    token = String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  } catch (_) {}

  if (!token) {
    try {
      token = String(sessionStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
    } catch (_) {}
  }

  if (!token) {
    return "";
  }

  if (isExpiredStoredToken(token)) {
    clearStoredAuthToken();
    return "";
  }

  return token;
}

// Authenticated requests use PHP sessions/http-only cookies on backend.
export const api = axios.create({
  baseURL,
  timeout: API_REQUEST_TIMEOUT_MS,
  withCredentials: true,
});

// Session-aware API client (cookies enabled). Use ONLY for password reset flow.
export const apiSession = axios.create({
  baseURL,
  timeout: API_REQUEST_TIMEOUT_MS,
  withCredentials: true,
});

api.interceptors.request.use(prepareMonitoringRequest);
apiSession.interceptors.request.use(prepareMonitoringRequest);

api.interceptors.response.use(
  (response) => {
    response = normalizeSuccessfulJsonResponse(response);
    syncUserFromResponse(response);
    return response;
  },
  (error) => {
    syncUserFromResponse(error?.response);
    if (error?.response?.status === 429) {
      return retryRateLimitedRequest(api, error);
    }
    if (error?.response?.status === 401) {
      clearStoredAuthToken();
      normalizeAuthenticationError(error);
      dispatchAuthInvalidEvent();
    }
    return retryTransientRequest(api, error);
  }
);

apiSession.interceptors.response.use(
  (response) => {
    response = normalizeSuccessfulJsonResponse(response);
    syncUserFromResponse(response);
    return response;
  },
  (error) => {
    syncUserFromResponse(error?.response);
    if (error?.response?.status === 429) {
      return retryRateLimitedRequest(apiSession, error);
    }
    if (error?.response?.status === 401) {
      clearStoredAuthToken();
      normalizeAuthenticationError(error);
      dispatchAuthInvalidEvent();
    }
    return retryTransientRequest(apiSession, error);
  }
);

export function normalizeServiceOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalized = rows
    .map((entry) => {
      if (typeof entry === "string") {
        const name = String(entry).trim();
        return {
          id: "",
          name,
          service_label: name,
          display_name: name,
          service_name: name,
          raw_name: name,
          description: "",
          disabled: false,
          bundle_steps: [],
        };
      }

      const rawName = String(entry?.service_name ?? entry?.raw_name ?? entry?.Name ?? "").trim();
      const description = String(entry?.description ?? entry?.service_description ?? "").trim();
      const fallbackName = String(entry?.name || "").trim();
      const serviceLabel = String(entry?.service_label ?? entry?.display_name ?? "").trim();
      const name = serviceLabel || (rawName && description ? `${rawName} - ${description}` : rawName || fallbackName);
      const serviceName = rawName || fallbackName || name;
      if (!name || !serviceName) return null;

      return {
        ...entry,
        id: entry?.Services_type_Id ?? entry?.services_type_id ?? entry?.id ?? "",
        name,
        Name: name,
        service_label: name,
        display_name: name,
        service_name: serviceName,
        raw_name: serviceName,
        description,
        disabled: Boolean(entry?.disabled),
        bundle_steps: Array.isArray(entry?.bundle_steps) ? entry.bundle_steps : [],
      };
    })
    .filter(Boolean);

  const seen = new Set();
  return normalized.filter((service) => {
    const key = String(service?.id || "").trim() || String(service?.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function fetchAvailableServices(clientId, config = {}) {
  const trimmedClientId = String(clientId ?? "").trim();
  const response = await api.get("services_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      ...(trimmedClientId ? { client_id: trimmedClientId } : {}),
    },
  });

  return {
    ...response,
    data: {
      ...response?.data,
      services: normalizeServiceOptions(response?.data?.services || response?.data),
    },
  };
}

function normalizePaymentMethodOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seen = new Set();

  return rows
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const id = entry?.payment_type_ID ?? entry?.id ?? "";
      const name = String(entry?.type_name ?? entry?.name ?? "").trim();
      const description = String(entry?.description ?? "").trim();

      if (id === "" || !name) {
        return null;
      }

      return {
        ...entry,
        id,
        name,
        description,
        created_at: entry?.created_at ?? entry?.createdAt ?? null,
        disabled: Boolean(entry?.disabled),
      };
    })
    .filter(Boolean)
    .filter((method) => {
      const key = String(method?.id ?? "").trim() || String(method?.name ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export async function fetchPaymentMethods(config = {}) {
  const response = await api.get("payment_methods.php", config);

  return {
    ...response,
    data: {
      ...response?.data,
      payment_methods: normalizePaymentMethodOptions(response?.data?.payment_methods || response?.data),
    },
  };
}

export async function submitPaymentReceipt(formData, config = {}) {
  return api.post("payment_create.php", formData, config);
}

export async function updatePaymentStatus(payload, config = {}) {
  return api.post("payment_update_status.php", payload, config);
}

export async function createPaymentMethod(payload, config = {}) {
  return api.post("payment_method_create.php", payload, config);
}

export async function updatePaymentMethod(payload, config = {}) {
  return api.post("payment_method_update.php", payload, config);
}

export async function createServiceType(payload, config = {}) {
  return api.post(
    "services_create.php",
    payload,
    config
  );
}

export async function updateServiceType(payload, config = {}) {
  return api.post(
    "services_update.php",
    payload,
    config
  );
}

function normalizeRoleOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry) => {
      const name = String(entry?.Role_name || entry?.role_name || entry?.name || "").trim();
      const id = entry?.Role_id ?? entry?.role_id ?? entry?.id ?? "";
      if (!name || id === "") {
        return null;
      }

      const specializationTypeIds = Array.isArray(entry?.specialization_type_ids ?? entry?.allowed_specialization_type_ids)
        ? Array.from(
            new Set(
              (entry?.specialization_type_ids ?? entry?.allowed_specialization_type_ids)
                .map((value) => String(value ?? "").trim())
                .filter(Boolean)
            )
          )
        : [];
      const specializationTypeNames = Array.isArray(entry?.specialization_type_names)
        ? Array.from(new Set(entry.specialization_type_names.map((value) => String(value ?? "").trim()).filter(Boolean)))
        : [];

      return {
        ...entry,
        id,
        name,
        disabled: Boolean(entry?.disabled),
        permission_page_status_id: entry?.permission_page_status_id ?? entry?.Permission_page_status_id ?? null,
        permission_page_status_name: String(
          entry?.permission_page_status_name ?? entry?.Permission_page_status_name ?? ""
        ).trim(),
        editing_locked: Boolean(entry?.editing_locked),
        specialization_type_ids: specializationTypeIds,
        specialization_type_names: specializationTypeNames,
      };
    })
    .filter(Boolean);
}

function normalizeSpecializationOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry) => {
      const name = String(entry?.Name || entry?.specialization_name || entry?.name || "").trim();
      const id = entry?.specialization_type_ID ?? entry?.specialization_id ?? entry?.id ?? "";
      if (!name || id === "") {
        return null;
      }

      return {
        ...entry,
        id,
        name,
        disabled: Boolean(entry?.disabled),
        service_ids: Array.isArray(entry?.service_ids) ? entry.service_ids.map((value) => Number(value)).filter(Number.isFinite) : [],
        service_names: Array.isArray(entry?.service_names) ? entry.service_names.map((value) => String(value).trim()).filter(Boolean) : [],
      };
    })
    .filter(Boolean);
}

export async function fetchRoles(config = {}) {
  const response = await api.get("role_list.php", config);

  return {
    ...response,
    data: {
      ...response?.data,
      roles: normalizeRoleOptions(response?.data?.roles || response?.data),
    },
  };
}

export async function createRole(payload, config = {}) {
  return api.post("role_create.php", payload, config);
}

export async function updateRole(payload, config = {}) {
  return api.post("role_update.php", payload, config);
}

export async function fetchSpecializationTypes(config = {}) {
  const response = await api.get("specialization_type_list.php", config);

  return {
    ...response,
    data: {
      ...response?.data,
      specialization_types: normalizeSpecializationOptions(response?.data?.specialization_types || response?.data),
      services: normalizeServiceOptions(response?.data?.services || []),
    },
  };
}

export async function createSpecializationType(payload, config = {}) {
  return api.post("specialization_type_create.php", payload, config);
}

export async function updateSpecializationType(payload, config = {}) {
  return api.post("specialization_type_update.php", payload, config);
}

export const DEFAULT_SECURITY_SETTINGS = Object.freeze({
  maxPasswordLength: 64,
  passwordExpiryDays: 90,
  sessionTimeoutMinutes: 30,
  lockoutAttempts: 5,
  lockoutDurationMinutes: 15,
  loginVerificationEnabled: true,
});

export const DEFAULT_SYSTEM_CONFIGURATION = Object.freeze({
  companyName: "Guibone Accounting Services (GAS)",
  appBaseUrl: "",
  allowClientSelfSignup: true,
  allowClientAppointments: true,
  allowClientConsultations: true,
  supportEmail: "",
  systemNotice: "",
  taskReminderIntervalHours: 4,
  taskReminderIntervalMinutes: 0,
  sendClientStatusEmails: false,
  rateLimitEnabled: true,
  rateLimitMaxRequests: 100,
  rateLimitWindowSeconds: 60,
  rateLimitLoginMaxRequests: 5,
  rateLimitLoginWindowSeconds: 60,
  rateLimitMessage: MONITORING_RATE_LIMITED_MESSAGE,
  rateLimitLoginMessage: "Too many login attempts. Please wait a moment and try again.",
  featureOptions: [],
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUsername: "",
  smtpPassword: "",
});

export const DEFAULT_BACKUP_SCHEDULE = Object.freeze({
  enabled: false,
  frequency: "once",
  scheduled_for: "",
  last_attempt_at: "",
  last_attempt_status: "",
  last_attempt_message: "",
  last_backup_name: "",
});

const BACKUP_SCHEDULE_FREQUENCY_VALUES = new Set(["once", "daily", "weekly", "monthly"]);

function parseIntegerSetting(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const normalized = String(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return fallback;
  }

  return Number.parseInt(normalized, 10);
}

function parseStringSetting(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized !== "" ? normalized : fallback;
}

function parseBooleanSetting(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function humanizeFeatureOptionKey(key) {
  const normalized = String(key ?? "").trim().replace(/[_-]+/g, " ");
  return normalized
    ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Feature option";
}

export function normalizeFeatureOptions(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.entries(input).map(([key, value]) =>
          value && typeof value === "object"
            ? { key, ...value }
            : { key, enabled: value }
        )
      : Array.isArray(input)
        ? input
        : [];
  const seen = new Set();

  return source.reduce((options, item) => {
    if (!item || typeof item !== "object") {
      return options;
    }

    const key = String(item.key ?? "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key) || seen.has(key)) {
      return options;
    }

    seen.add(key);
    options.push({
      key,
      label: parseStringSetting(item.label, humanizeFeatureOptionKey(key)).slice(0, 80),
      description: String(item.description ?? "").trim().slice(0, 200),
      enabled: parseBooleanSetting(item.enabled, false),
    });
    return options;
  }, []);
}

function parseBackupScheduleFrequency(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return BACKUP_SCHEDULE_FREQUENCY_VALUES.has(normalized)
    ? normalized
    : DEFAULT_BACKUP_SCHEDULE.frequency;
}

export function normalizeSecuritySettings(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    maxPasswordLength: parseIntegerSetting(source.maxPasswordLength, DEFAULT_SECURITY_SETTINGS.maxPasswordLength),
    passwordExpiryDays: parseIntegerSetting(source.passwordExpiryDays, DEFAULT_SECURITY_SETTINGS.passwordExpiryDays),
    sessionTimeoutMinutes: parseIntegerSetting(
      source.sessionTimeoutMinutes,
      DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes
    ),
    lockoutAttempts: parseIntegerSetting(source.lockoutAttempts, DEFAULT_SECURITY_SETTINGS.lockoutAttempts),
    lockoutDurationMinutes: parseIntegerSetting(
      source.lockoutDurationMinutes,
      DEFAULT_SECURITY_SETTINGS.lockoutDurationMinutes
    ),
    loginVerificationEnabled: parseBooleanSetting(
      source.loginVerificationEnabled,
      DEFAULT_SECURITY_SETTINGS.loginVerificationEnabled
    ),
  };
}

export function normalizeSystemConfiguration(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    companyName: parseStringSetting(source.companyName, DEFAULT_SYSTEM_CONFIGURATION.companyName),
    appBaseUrl: String(source.appBaseUrl ?? "").trim(),
    allowClientSelfSignup: parseBooleanSetting(
      source.allowClientSelfSignup,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientSelfSignup
    ),
    allowClientAppointments: parseBooleanSetting(
      source.allowClientAppointments,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientAppointments
    ),
    allowClientConsultations: parseBooleanSetting(
      source.allowClientConsultations,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientConsultations
    ),
    supportEmail: String(source.supportEmail ?? "").trim(),
    systemNotice: String(source.systemNotice ?? "").trim(),
    taskReminderIntervalHours: parseIntegerSetting(
      source.taskReminderIntervalHours,
      DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalHours
    ),
    taskReminderIntervalMinutes: parseIntegerSetting(
      source.taskReminderIntervalMinutes,
      DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalMinutes
    ),
    sendClientStatusEmails: parseBooleanSetting(
      source.sendClientStatusEmails,
      DEFAULT_SYSTEM_CONFIGURATION.sendClientStatusEmails
    ),
    rateLimitEnabled: parseBooleanSetting(
      source.rateLimitEnabled,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitEnabled
    ),
    rateLimitMaxRequests: parseIntegerSetting(
      source.rateLimitMaxRequests,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitMaxRequests
    ),
    rateLimitWindowSeconds: parseIntegerSetting(
      source.rateLimitWindowSeconds,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitWindowSeconds
    ),
    rateLimitLoginMaxRequests: parseIntegerSetting(
      source.rateLimitLoginMaxRequests,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginMaxRequests
    ),
    rateLimitLoginWindowSeconds: parseIntegerSetting(
      source.rateLimitLoginWindowSeconds,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginWindowSeconds
    ),
    rateLimitMessage: parseStringSetting(
      source.rateLimitMessage,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitMessage
    ),
    rateLimitLoginMessage: parseStringSetting(
      source.rateLimitLoginMessage,
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginMessage
    ),
    featureOptions: normalizeFeatureOptions(source.featureOptions),
    smtpHost: parseStringSetting(source.smtpHost, DEFAULT_SYSTEM_CONFIGURATION.smtpHost),
    smtpPort: parseIntegerSetting(source.smtpPort, DEFAULT_SYSTEM_CONFIGURATION.smtpPort),
    smtpUsername: String(source.smtpUsername ?? "").trim(),
    smtpPassword: String(source.smtpPassword ?? ""),
  };
}

export function normalizeBackupSchedule(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    enabled: parseBooleanSetting(source.enabled, DEFAULT_BACKUP_SCHEDULE.enabled),
    frequency: parseBackupScheduleFrequency(source.frequency),
    scheduled_for: String(source.scheduled_for ?? "").trim(),
    last_attempt_at: String(source.last_attempt_at ?? "").trim(),
    last_attempt_status: parseStringSetting(
      source.last_attempt_status,
      DEFAULT_BACKUP_SCHEDULE.last_attempt_status
    ),
    last_attempt_message: String(source.last_attempt_message ?? "").trim(),
    last_backup_name: String(source.last_backup_name ?? "").trim(),
  };
}

export { DEFAULT_TASK_WORKLOAD_SETTINGS, normalizeTaskWorkloadSettings };

export async function fetchSecuritySettings(config = {}) {
  const response = await api.get("user_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      scope: "security_settings",
    },
  });

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSecuritySettings(response?.data?.settings),
    },
  };
}

export async function saveSecuritySettings(settings, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "save_security_settings",
      settings,
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSecuritySettings(response?.data?.settings),
    },
  };
}

export async function fetchSystemConfiguration(config = {}) {
  const response = await api.get("user_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      scope: "system_configuration",
    },
  });

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

export async function fetchPublicSystemConfiguration(config = {}) {
  const response = await api.get("user_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      scope: "system_configuration",
    },
  });

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

export async function saveSystemConfiguration(settings, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "save_system_configuration",
      settings,
    },
    {
      monitoringRateLimitRetry: true,
      monitoringRateLimitBypassCooldown: true,
      ...config,
    }
  );
  clearRateLimitCooldown();

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

export async function sendSystemTestEmail({ settings, recipientEmail }, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "send_system_test_email",
      settings,
      recipient_email: String(recipientEmail ?? "").trim(),
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

function normalizeTempMailBlockEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const value = String(entry.value || "").trim().toLowerCase();
      const id = String(entry.id || value).trim();
      const type = String(entry.type || "domain").trim().toLowerCase() === "email" ? "email" : "domain";
      if (!value || !id || seen.has(value)) {
        return null;
      }

      seen.add(value);
      return {
        id,
        value,
        type,
        created_at: entry.created_at || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.value.localeCompare(right.value));
}

export async function fetchTempMailBlocklist(config = {}) {
  const response = await api.get("temp_mail_blocker.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      entries: normalizeTempMailBlockEntries(response?.data?.entries),
    },
  };
}

export async function addTempMailBlockEntry(value, config = {}) {
  const response = await api.post(
    "temp_mail_blocker.php",
    {
      action: "add",
      value: String(value ?? "").trim(),
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      entries: normalizeTempMailBlockEntries(response?.data?.entries),
    },
  };
}

export async function removeTempMailBlockEntry(entryId, config = {}) {
  const response = await api.post(
    "temp_mail_blocker.php",
    {
      action: "remove",
      id: String(entryId ?? "").trim(),
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      entries: normalizeTempMailBlockEntries(response?.data?.entries),
    },
  };
}

export async function checkRegistrationEmailAvailability(email, config = {}) {
  return api.post(
    "client_create.php",
    {
      action: "check_email",
      email: String(email ?? "").trim().toLowerCase(),
    },
    config
  );
}

export async function fetchTaskWorkloadSettings(config = {}) {
  const response = await api.get("task_workload_settings.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeTaskWorkloadSettings(response?.data?.settings),
    },
  };
}

export async function saveTaskWorkloadSettings(settings, config = {}) {
  const response = await api.post("task_workload_settings.php", settings, config);

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeTaskWorkloadSettings(response?.data?.settings),
    },
  };
}

export async function fetchBackupDataOverview(config = {}) {
  return api.get("backup_data.php", config);
}

export async function createDatabaseBackup(config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "create_backup",
    },
    config
  );
}

export async function saveBackupSchedule(schedule, config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "save_schedule",
      ...schedule,
    },
    config
  );
}

export async function processScheduledDatabaseBackup(config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "process_scheduled_backup",
    },
    config
  );
}

export async function cleanupDatabaseBackups(payload = {}, config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "cleanup_backups",
      ...payload,
    },
    config
  );
}

export async function deleteDatabaseBackup(filename, config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "delete_backup",
      filename,
    },
    config
  );
}

export async function downloadDatabaseBackup(filename, config = {}) {
  return api.get("backup_data.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      download_backup: filename,
    },
    responseType: "blob",
  });
}

export async function exportDatabaseTable(tableName, format = "csv", config = {}) {
  return api.get("backup_data.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      export_table: tableName,
      format,
    },
    responseType: "blob",
  });
}

export async function fetchAuditLogs(config = {}) {
  const response = await api.get("audit_logs.php", {
    ...config,
    params: {
      range: "30d",
      page: 1,
      per_page: 25,
      ...(config?.params || {}),
    },
  });

  return response;
}

export async function fetchModulePermissions(config = {}) {
  const response = await api.get("module_permissions.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      permissions: mergePermissions(response?.data?.permissions),
    },
  };
}

export async function saveModulePermissions(permissions, config = {}) {
  const response = await api.post(
    "module_permissions.php",
    {
      action: "save_module_permissions",
      permissions,
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      permissions: mergePermissions(response?.data?.permissions),
    },
  };
}

export async function requestModuleAccess(moduleKey, moduleLabel, config = {}) {
  const response = await api.post(
    "module_access_request.php",
    {
      module_key: moduleKey,
      module_label: moduleLabel,
    },
    config
  );

  return response;
}

export async function switchToClientAccount(clientId, config = {}) {
  const response = await api.post(
    "account_switch.php",
    {
      action: "start_client_view",
      client_id: clientId,
    },
    config
  );

  return response;
}

export async function restoreOriginalAccount(config = {}) {
  const response = await api.post(
    "account_switch.php",
    {
      action: "restore_original",
    },
    config
  );

  return response;
}

export async function fetchCertificateTemplates(config = {}) {
  return api.get("certificate_templates.php", config);
}

export async function saveCertificateTemplate(payload, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "save_template",
      ...payload,
    },
    config
  );
}

export async function saveSelectedCertificateTemplates(selectedTemplateIds, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "save_selected_templates",
      selected_template_ids: Array.isArray(selectedTemplateIds) ? selectedTemplateIds : [],
    },
    config
  );
}

export async function deleteCertificateTemplate(templateId, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "delete_template",
      template_id: templateId,
    },
    config
  );
}

export async function fetchCertificateRecord(params = {}, config = {}) {
  return api.get("certificate_view.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      ...(params && typeof params === "object" ? params : {}),
    },
  });
}

export function resolveBackendAssetUrl(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const cleanPath = normalized.replace(/^\/+/, "");
  const base = String(baseURL).replace(/api\/?$/, "");
  return `${base}${cleanPath}`;
}
