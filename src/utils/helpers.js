export const ROLE_IDS = Object.freeze({
  ADMIN: 1,
  SECRETARY: 2,
  ACCOUNTANT: 3,
  CLIENT: 4,
});

const DEFAULT_DATE_OPTIONS = Object.freeze({
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const DEFAULT_DATE_TIME_OPTIONS = Object.freeze({
  ...DEFAULT_DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
});

function toTrimmedString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeRoleId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const roleId = Number(value);
  return Number.isInteger(roleId) ? roleId : null;
}

function buildDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isEmpty(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return toTrimmedString(value) === "";
}

export function isRequired(value) {
  return !isEmpty(value);
}

export function hasMinLength(value, minLength = 0) {
  return toTrimmedString(value).length >= minLength;
}

export function matchesPattern(value, pattern) {
  if (!(pattern instanceof RegExp)) {
    return false;
  }

  const text = toTrimmedString(value);
  if (!text) {
    return false;
  }

  const safePattern = new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
  return safePattern.test(text);
}

export function isValidEmail(value) {
  return matchesPattern(value, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
}

export function isValidPhoneNumber(value) {
  return matchesPattern(value, /^\+?[\d\s()-]{7,20}$/);
}

export function parseDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = toTrimmedString(value);
  if (!text || text === "-") {
    return null;
  }

  const nativeDate = new Date(text);
  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  const parts = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!parts) {
    return null;
  }

  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const year = Number(parts[3]);

  const candidates =
    first > 12
      ? [[year, second - 1, first]]
      : [
          [year, first - 1, second],
          [year, second - 1, first],
        ];

  for (const [candidateYear, monthIndex, day] of candidates) {
    const parsed = buildDate(candidateYear, monthIndex, day);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function isValidDate(value) {
  return !!parseDate(value);
}

export function formatDate(value, options = DEFAULT_DATE_OPTIONS, fallback = "-") {
  const date = parseDate(value);
  return date ? date.toLocaleDateString(undefined, options) : fallback;
}

export function formatDateTime(value, options = DEFAULT_DATE_TIME_OPTIONS, fallback = "-") {
  const date = parseDate(value);
  return date ? date.toLocaleString(undefined, options) : fallback;
}

export function toIsoDate(value) {
  const date = parseDate(value);
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getUserRole(user) {
  return normalizeRoleId(user?.role_id ?? user?.role);
}

export function hasRole(user, expectedRoles) {
  const currentRole = getUserRole(user);
  if (currentRole === null) {
    return false;
  }

  const roles = Array.isArray(expectedRoles) ? expectedRoles : [expectedRoles];
  return roles
    .map(normalizeRoleId)
    .filter((roleId) => roleId !== null)
    .includes(currentRole);
}
