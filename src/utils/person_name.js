function trimValue(value) {
  return String(value ?? "").trim();
}

export function normalizePersonName(value) {
  const raw = trimValue(value);
  if (!raw) return "";

  return raw
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s-'])[a-z]/g, (match) => match.toUpperCase());
}

export function normalizeMiddleName(value) {
  const raw = trimValue(value);
  if (!raw) return "";

  const collapsed = raw.replace(/\s+/g, " ");
  const singleInitialMatch = collapsed.match(/^([A-Za-z])\.?$/);

  if (singleInitialMatch) {
    return `${singleInitialMatch[1].toUpperCase()}.`;
  }

  return normalizePersonName(collapsed);
}

export function normalizeMiddleNameOrNull(value) {
  return normalizeMiddleName(value) || null;
}

export function joinPersonName(parts = []) {
  return (Array.isArray(parts) ? parts : [])
    .map((part, index) => {
      const raw = trimValue(part);
      if (!raw) return "";
      return index === 1 ? normalizeMiddleName(raw) : normalizePersonName(raw);
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function normalizeNameForComparison(value) {
  return trimValue(value)
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
