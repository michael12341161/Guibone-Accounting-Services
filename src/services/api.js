import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { mergePermissions } from "../utils/module_permissions";
import { DEFAULT_TASK_WORKLOAD_SETTINGS, normalizeTaskWorkloadSettings } from "../utils/task_workload";

// Configure to hit the PHP backend served by XAMPP.
// Set REACT_APP_API_BASE_URL in .env for production, or use the default for local dev.
const baseURL = process.env.REACT_APP_API_BASE_URL || "http://localhost/Monitoring/monitoring/backend/api/";
const JWT_REFRESH_HEADER = "x-monitoring-jwt";
const SESSION_ACTIVITY_HEADER = "X-Monitoring-Activity";
// Keep this short so background polling does not extend inactivity timeouts.
const RECENT_ACTIVITY_WINDOW_MS = 5 * 1000;
export const MONITORING_AUTH_INVALID_EVENT = "monitoring:auth-invalid";
export const MONITORING_AUTH_USER_SYNC_EVENT = "monitoring:auth-user-sync";
export const MONITORING_SYSTEM_CONFIG_UPDATED_EVENT = "monitoring:system-config-updated";
export const MONITORING_SCHEDULED_BACKUP_EVENT = "monitoring:scheduled-backup";
export const MONITORING_AUTH_REQUIRED_MESSAGE = "Authentication is required.";
export const MONITORING_SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";

let lastUserInteractionAt = 0;

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
  const token = String(response?.headers?.[JWT_REFRESH_HEADER] || "").trim();
  if (!token) {
    return;
  }

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

  return Date.now() - lastUserInteractionAt <= RECENT_ACTIVITY_WINDOW_MS ? "active" : "passive";
}

function attachMonitoringActivity(config) {
  const nextConfig = { ...config };
  const headers = { ...(nextConfig.headers || {}) };
  headers[SESSION_ACTIVITY_HEADER] = resolveMonitoringActivityMode(nextConfig);
  nextConfig.headers = headers;
  delete nextConfig.monitoringActivity;
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

export function clearStoredAuthToken() {
  // Handled by HTTP-only cookie
}

export function storeAuthToken(token) {
  // Handled by HTTP-only cookie  
}

export function getStoredAuthToken() {
  return "";
}

// Authenticated requests use PHP sessions/http-only cookies on backend.
export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Session-aware API client (cookies enabled). Use ONLY for password reset flow.
export const apiSession = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use(attachMonitoringActivity);
apiSession.interceptors.request.use(attachMonitoringActivity);

api.interceptors.response.use(
  (response) => {
    syncUserFromResponse(response);
    return response;
  },
  (error) => {
    syncUserFromResponse(error?.response);
    if (error?.response?.status === 401) {
      clearStoredAuthToken();
      normalizeAuthenticationError(error);
      dispatchAuthInvalidEvent();
    }
    return Promise.reject(error);
  }
);

apiSession.interceptors.response.use(
  (response) => {
    syncUserFromResponse(response);
    return response;
  },
  (error) => {
    syncUserFromResponse(error?.response);
    if (error?.response?.status === 401) {
      clearStoredAuthToken();
      normalizeAuthenticationError(error);
      dispatchAuthInvalidEvent();
    }
    return Promise.reject(error);
  }
);

export function normalizeServiceOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalized = rows
    .map((entry) => {
      if (typeof entry === "string") {
        return { id: "", name: String(entry).trim(), disabled: false, bundle_steps: [] };
      }

      const name = String(entry?.Name || entry?.name || "").trim();
      if (!name) return null;

      return {
        ...entry,
        id: entry?.Services_type_Id ?? entry?.services_type_id ?? entry?.id ?? "",
        name,
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
