const UTF8_MOJIBAKE_PATTERN = /(?:Ã.|Â.|â.|Ã|Â|â)/;

export function repairUtf8Mojibake(value) {
  const text = String(value ?? "");

  if (!text || !UTF8_MOJIBAKE_PATTERN.test(text)) {
    return text;
  }

  try {
    if (typeof TextDecoder === "function") {
      const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
  } catch (_) {
    // Fall back to percent-decoding below when utf-8 decoding fails.
  }

  try {
    return decodeURIComponent(
      text
        .split("")
        .map((char) => `%${(char.charCodeAt(0) & 0xff).toString(16).padStart(2, "0")}`)
        .join("")
    );
  } catch (_) {
    return text;
  }
}
