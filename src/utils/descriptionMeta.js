function normalizeMetaText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readBracketMetaValue(text, key) {
  const source = String(text ?? "");
  const normalizedKey = String(key ?? "").trim();

  if (!source || !normalizedKey) {
    return "";
  }

  const escapedKey = escapeRegExp(normalizedKey);
  const pattern = new RegExp(`\\[${escapedKey}\\]\\s*([\\s\\S]*?)(?=\\s*\\[[A-Za-z0-9_]+\\]\\s*|$)`, "i");
  const match = source.match(pattern);

  return match ? normalizeMetaText(match[1]) : "";
}

export function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = normalizeMetaText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}
