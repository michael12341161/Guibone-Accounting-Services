const DEFAULT_SLOT_START_MINUTES = 8 * 60;
const DEFAULT_SLOT_END_MINUTES = 17 * 60;
const DEFAULT_SLOT_INTERVAL_MINUTES = 30;

function normalizeDateValue(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTimeValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const normalized = /^\d{2}:\d{2}:\d{2}$/.test(raw) ? raw.slice(0, 5) : raw;
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : "";
}

export function buildConsultationSlotKey(_dateValue, timeValue) {
  const time = normalizeTimeValue(timeValue);
  return time || "";
}

export function compareConsultationSlots(left, right) {
  const leftKey = buildConsultationSlotKey("", left?.time ?? left);
  const rightKey = buildConsultationSlotKey("", right?.time ?? right);
  return leftKey.localeCompare(rightKey);
}

export function normalizeConsultationSlot(slot) {
  if (typeof slot === "string") {
    const time = normalizeTimeValue(slot);
    return time ? { time } : null;
  }

  if (!slot || typeof slot !== "object") return null;

  const time = normalizeTimeValue(slot.time ?? slot.Time ?? slot.value);
  if (!time) return null;

  return { time };
}

export function normalizeConsultationSlots(input) {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();

  return source
    .map(normalizeConsultationSlot)
    .filter(Boolean)
    .filter((slot) => {
      const key = buildConsultationSlotKey("", slot.time);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareConsultationSlots);
}

export function hasConfiguredConsultationSlots(input) {
  return normalizeConsultationSlots(input).length > 0;
}

export function getConfiguredConsultationTimesForDate(input, dateValue) {
  const date = normalizeDateValue(dateValue);
  if (!date) return [];

  return normalizeConsultationSlots(input).map((slot) => slot.time);
}

export function buildDefaultConsultationTimeSlots({
  startMinutes = DEFAULT_SLOT_START_MINUTES,
  endMinutes = DEFAULT_SLOT_END_MINUTES,
  intervalMinutes = DEFAULT_SLOT_INTERVAL_MINUTES,
} = {}) {
  const slots = [];

  for (
    let minutes = startMinutes;
    minutes < endMinutes;
    minutes += intervalMinutes
  ) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    slots.push(`${hour}:${minute}`);
  }

  return slots;
}

export const DEFAULT_CONSULTATION_TIME_SLOTS = Object.freeze(
  buildDefaultConsultationTimeSlots()
);

export function toConsultationTimeLabel(value) {
  const time = normalizeTimeValue(value);
  if (!time) return "";

  const [hourValue, minuteValue] = time.split(":");
  const hour = Number(hourValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minuteValue} ${suffix}`;
}
