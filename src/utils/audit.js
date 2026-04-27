import { UAParser } from "ua-parser-js";

const AUDIT_CONTEXT_CACHE_KEY = "monitoring:audit-context:v3";
const AUDIT_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;
const IP_LOOKUP_TIMEOUT_MS = 2500;

function normalizeAuditText(value, maxLength) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function toTitleCase(value) {
  const normalized = normalizeAuditText(value, 32);
  if (!normalized) {
    return null;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildBrowserLabel(browser) {
  return normalizeAuditText([browser?.name, browser?.version].filter(Boolean).join(" "), 100);
}

function buildOsLabel(os) {
  return normalizeAuditText([os?.name, os?.version].filter(Boolean).join(" "), 100);
}

function buildDeviceLabel(device) {
  const descriptor = normalizeAuditText([device?.vendor, device?.model].filter(Boolean).join(" "), 100);
  const deviceType = toTitleCase(device?.type);

  if (descriptor && deviceType && !descriptor.toLowerCase().includes(deviceType.toLowerCase())) {
    return normalizeAuditText(`${descriptor} (${deviceType})`, 100);
  }
  if (descriptor) {
    return descriptor;
  }
  if (deviceType) {
    return deviceType;
  }

  return "Desktop";
}

function buildLocationLabel(payload) {
  return normalizeAuditText([payload?.city, payload?.region, payload?.country_name].filter(Boolean).join(", "), 255);
}

function normalizeAuditContext(context) {
  return {
    ip_address: normalizeAuditText(context?.ip_address, 45),
    location: normalizeAuditText(context?.location, 255),
    device: normalizeAuditText(context?.device, 100),
    browser: normalizeAuditText(context?.browser, 100),
    os: normalizeAuditText(context?.os, 100),
  };
}

function hasNetworkContext(context) {
  return !!(context?.ip_address || context?.location);
}

function isPromiseLike(value) {
  return !!value && typeof value.then === "function";
}

function readCachedAuditContext() {
  try {
    const raw = sessionStorage.getItem(AUDIT_CONTEXT_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt ?? 0);
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > AUDIT_CONTEXT_CACHE_TTL_MS) {
      sessionStorage.removeItem(AUDIT_CONTEXT_CACHE_KEY);
      return null;
    }

    return normalizeAuditContext(parsed?.value || {});
  } catch (_) {
    return null;
  }
}

function writeCachedAuditContext(context) {
  try {
    sessionStorage.setItem(
      AUDIT_CONTEXT_CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        value: normalizeAuditContext(context),
      })
    );
  } catch (_) {}
}

async function fetchLocationContext() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch("https://ipapi.co/json/", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {};
    }

    const payload = await response.json();
    return {
      ip_address: normalizeAuditText(payload?.ip, 45),
      location: buildLocationLabel(payload),
    };
  } catch (_) {
    return {};
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function detectWindowsClientHintsOs() {
  try {
    const uaData =
      typeof navigator !== "undefined" && navigator && navigator.userAgentData ? navigator.userAgentData : null;
    if (!uaData || typeof uaData.getHighEntropyValues !== "function") {
      return null;
    }

    if (String(uaData.platform || "").toLowerCase() !== "windows") {
      return null;
    }

    const values = await uaData.getHighEntropyValues(["platformVersion"]);
    const majorPlatformVersion = Number.parseInt(String(values?.platformVersion || "").split(".")[0], 10);

    if (!Number.isFinite(majorPlatformVersion)) {
      return "Windows";
    }
    if (majorPlatformVersion >= 13) {
      return "Windows 11";
    }
    if (majorPlatformVersion > 0) {
      return "Windows 10";
    }

    return "Windows";
  } catch (_) {
    return null;
  }
}

async function resolveOsLabel(parser, result) {
  let osResult = result?.os;

  try {
    const parserOs = parser.getOS();
    if (parserOs && typeof parserOs.withClientHints === "function") {
      const hintedOs = parserOs.withClientHints();
      osResult = isPromiseLike(hintedOs) ? await hintedOs : hintedOs || osResult;
    }
  } catch (_) {}

  const hintedWindowsOs = await detectWindowsClientHintsOs();
  if (hintedWindowsOs) {
    return hintedWindowsOs;
  }

  return buildOsLabel(osResult);
}

export async function captureAuditContext() {
  const parser = new UAParser();
  const result = parser.getResult();
  const cached = readCachedAuditContext();
  const locationPromise = hasNetworkContext(cached) ? Promise.resolve(cached) : fetchLocationContext();
  const [locationContext, osLabel] = await Promise.all([locationPromise, resolveOsLabel(parser, result)]);

  const baseContext = normalizeAuditContext({
    device: buildDeviceLabel(result?.device),
    browser: buildBrowserLabel(result?.browser),
    os: osLabel,
  });

  const nextContext = normalizeAuditContext({
    ...baseContext,
    ...locationContext,
  });

  writeCachedAuditContext(nextContext);
  return nextContext;
}
