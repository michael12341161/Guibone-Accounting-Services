const SERVICE_DURATION_ITEMS = [
  { aliases: ["tax filing"], duration: "1 day", autoDueDays: 1 },
  { aliases: ["audit", "auditing"], duration: "3-7 days", autoDueDays: 7 },
  { aliases: ["bookkeeping", "book keeping", "booking"], duration: "1-2 weeks", autoDueDays: 14 },
  { aliases: ["processing", "process"], duration: "3 weeks to 1 month", autoDueDays: 30 },
];

function normalizeServiceDurationValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findServiceDurationItem(value) {
  const normalized = normalizeServiceDurationValue(value);
  if (!normalized) return null;

  return (
    SERVICE_DURATION_ITEMS.find(({ aliases }) =>
      aliases.some((alias) => normalized === alias || normalized.includes(alias))
    ) || null
  );
}

export function getEstimatedServiceDuration(value) {
  const match = findServiceDurationItem(value);
  return match ? match.duration : "";
}

export function getAutoDueDateForService(value, baseDate = new Date()) {
  const match = findServiceDurationItem(value);
  const dueDays = Number(match?.autoDueDays || 0);
  if (!dueDays) return "";

  const dueDate = new Date(baseDate);
  dueDate.setHours(12, 0, 0, 0);
  dueDate.setDate(dueDate.getDate() + dueDays);

  const year = dueDate.getFullYear();
  const month = String(dueDate.getMonth() + 1).padStart(2, "0");
  const day = String(dueDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
