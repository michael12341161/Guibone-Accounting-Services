const STEP_COMPLETED_AT_RE = /^\s*\[StepCompletedAt\s+(\d+)\]\s*([^\r\n]+)\s*$/i;
const STEP_REMARK_RE = /^\s*\[StepRemark\s+(\d+)\]\s*(.*)$/i;
const STEP_REMARK_AT_RE = /^\s*\[StepRemarkAt\s+(\d+)\]\s*([^\r\n]+)\s*$/i;
const STEP_READ_AT_RE = /^\s*\[StepReadAt\s+(\d+)\]\s*([^\r\n]+)\s*$/i;
const STEP_CONTINUE_AT_RE = /^\s*\[StepContinueAt\s+(\d+)\]\s*([^\r\n]+)\s*$/i;
const STEP_ACTIVITY_RE = /^\s*\[StepActivity\s+(\d+)\]\s*([^\r\n]+)\s*$/i;

const padNumber = (value) => String(Math.trunc(Math.abs(Number(value) || 0))).padStart(2, "0");

const isPositiveStepNumber = (value) => Number.isInteger(value) && value > 0;

const normalizeStepNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  return isPositiveStepNumber(parsed) ? parsed : null;
};

const buildIndexedMetaLabel = (tag, stepNumber, value) => `[${tag} ${stepNumber}] ${String(value ?? "").trim()}`;

const updateIndexedStepMeta = (descriptionRaw, tag, stepNumberRaw, valueRaw) => {
  const stepNumber = normalizeStepNumber(stepNumberRaw);
  if (!stepNumber) {
    return String(descriptionRaw || "").trim();
  }

  const value = String(valueRaw ?? "").trim();
  const matcher = new RegExp(`^\\s*\\[${tag}\\s+${stepNumber}\\]\\s*.*$`, "i");
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const nextLines = [];
  let inserted = false;

  for (const line of lines) {
    if (matcher.test(String(line || ""))) {
      if (!inserted && value !== "") {
        nextLines.push(buildIndexedMetaLabel(tag, stepNumber, value));
        inserted = true;
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!inserted && value !== "") {
    while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
      nextLines.pop();
    }
    nextLines.push(buildIndexedMetaLabel(tag, stepNumber, value));
  }

  return nextLines.join("\n").trim();
};

const parseIndexedStepMeta = (descriptionRaw, matcher) => {
  const values = {};

  for (const line of String(descriptionRaw || "").split(/\r?\n/)) {
    const match = String(line || "").match(matcher);
    if (!match) continue;

    const stepNumber = normalizeStepNumber(match[1]);
    if (!stepNumber) continue;

    const value = String(match[2] ?? "").trim();
    if (value === "") continue;

    values[stepNumber] = value;
  }

  return values;
};

export const isIndexedStepMetaLine = (line) =>
  STEP_COMPLETED_AT_RE.test(String(line || "")) ||
  STEP_REMARK_RE.test(String(line || "")) ||
  STEP_REMARK_AT_RE.test(String(line || "")) ||
  STEP_READ_AT_RE.test(String(line || "")) ||
  STEP_CONTINUE_AT_RE.test(String(line || "")) ||
  STEP_ACTIVITY_RE.test(String(line || ""));

export const parseStepCompletionTimestamps = (descriptionRaw) =>
  parseIndexedStepMeta(descriptionRaw, STEP_COMPLETED_AT_RE);

export const parseStepRemarks = (descriptionRaw) => parseIndexedStepMeta(descriptionRaw, STEP_REMARK_RE);
export const parseStepRemarkTimestamps = (descriptionRaw) => parseIndexedStepMeta(descriptionRaw, STEP_REMARK_AT_RE);
export const parseStepReadTimestamps = (descriptionRaw) => parseIndexedStepMeta(descriptionRaw, STEP_READ_AT_RE);
export const parseStepContinueTimestamps = (descriptionRaw) =>
  parseIndexedStepMeta(descriptionRaw, STEP_CONTINUE_AT_RE);

export const setStepCompletionTimestamp = (descriptionRaw, stepNumber, timestamp) =>
  updateIndexedStepMeta(descriptionRaw, "StepCompletedAt", stepNumber, timestamp);

export const setStepRemark = (descriptionRaw, stepNumber, remark) =>
  updateIndexedStepMeta(descriptionRaw, "StepRemark", stepNumber, remark);

export const setStepRemarkTimestamp = (descriptionRaw, stepNumber, timestamp) =>
  updateIndexedStepMeta(descriptionRaw, "StepRemarkAt", stepNumber, timestamp);
export const setStepReadTimestamp = (descriptionRaw, stepNumber, timestamp) =>
  updateIndexedStepMeta(descriptionRaw, "StepReadAt", stepNumber, timestamp);
export const setStepContinueTimestamp = (descriptionRaw, stepNumber, timestamp) =>
  updateIndexedStepMeta(descriptionRaw, "StepContinueAt", stepNumber, timestamp);

const encodeActivityPayload = (activity) => {
  try {
    const json = JSON.stringify(activity || {});
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch (_) {
    return "";
  }
};

const decodeActivityPayload = (value) => {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(decodeURIComponent(escape(atob(padded))));
  } catch (_) {
    return null;
  }
};

export const appendStepActivity = (descriptionRaw, stepNumberRaw, activity) => {
  const stepNumber = normalizeStepNumber(stepNumberRaw);
  const payload = encodeActivityPayload(activity);
  if (!stepNumber || !payload) {
    return String(descriptionRaw || "").trim();
  }

  const lines = String(descriptionRaw || "").split(/\r?\n/);
  while (lines.length && !String(lines[lines.length - 1] || "").trim()) {
    lines.pop();
  }
  lines.push(`[StepActivity ${stepNumber}] ${payload}`);
  return lines.join("\n").trim();
};

export const parseStepActivities = (descriptionRaw) => {
  const activities = {};

  for (const line of String(descriptionRaw || "").split(/\r?\n/)) {
    const match = String(line || "").match(STEP_ACTIVITY_RE);
    if (!match) continue;

    const stepNumber = normalizeStepNumber(match[1]);
    if (!stepNumber) continue;

    const activity = decodeActivityPayload(match[2]);
    if (!activity || typeof activity !== "object") continue;

    activities[stepNumber] = [...(activities[stepNumber] || []), activity];
  }

  return activities;
};

export const remapIndexedStepMeta = (descriptionRaw, mapStepNumber) => {
  if (typeof mapStepNumber !== "function") {
    return String(descriptionRaw || "").trim();
  }

  const nextLines = [];

  for (const line of String(descriptionRaw || "").split(/\r?\n/)) {
    const completedAtMatch = String(line || "").match(STEP_COMPLETED_AT_RE);
    if (completedAtMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(completedAtMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepCompletedAt", nextStepNumber, completedAtMatch[2]));
      }
      continue;
    }

    const remarkMatch = String(line || "").match(STEP_REMARK_RE);
    if (remarkMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(remarkMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepRemark", nextStepNumber, remarkMatch[2]));
      }
      continue;
    }

    const remarkAtMatch = String(line || "").match(STEP_REMARK_AT_RE);
    if (remarkAtMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(remarkAtMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepRemarkAt", nextStepNumber, remarkAtMatch[2]));
      }
      continue;
    }

    const readAtMatch = String(line || "").match(STEP_READ_AT_RE);
    if (readAtMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(readAtMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepReadAt", nextStepNumber, readAtMatch[2]));
      }
      continue;
    }

    const continueAtMatch = String(line || "").match(STEP_CONTINUE_AT_RE);
    if (continueAtMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(continueAtMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepContinueAt", nextStepNumber, continueAtMatch[2]));
      }
      continue;
    }

    const activityMatch = String(line || "").match(STEP_ACTIVITY_RE);
    if (activityMatch) {
      const nextStepNumber = normalizeStepNumber(mapStepNumber(normalizeStepNumber(activityMatch[1])));
      if (nextStepNumber) {
        nextLines.push(buildIndexedMetaLabel("StepActivity", nextStepNumber, activityMatch[2]));
      }
      continue;
    }

    nextLines.push(line);
  }

  return nextLines.join("\n").trim();
};

export const createLocalStepTimestamp = (input = new Date()) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;

  return [
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    `T${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`,
    `${sign}${padNumber(offsetHours)}:${padNumber(offsetRemainderMinutes)}`,
  ].join("");
};

export const formatStepDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};
