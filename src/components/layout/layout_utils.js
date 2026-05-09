import { joinPersonName, normalizePersonName } from "../../utils/person_name";

export function getUserFirstName(user) {
  const raw = (
    user?.first_name ||
    user?.employee_first_name ||
    user?.full_name ||
    user?.fullname ||
    user?.name ||
    user?.username ||
    ""
  )
    .toString()
    .trim();
  if (!raw) return "";
  return normalizePersonName(raw.split(/\s+/)[0] || "");
}

export function getUserDisplayName(user) {
  const joinedName = joinPersonName([
    user?.first_name ?? user?.employee_first_name,
    user?.middle_name ?? user?.employee_middle_name,
    user?.last_name ?? user?.employee_last_name,
  ]);

  if (joinedName) {
    return joinedName;
  }

  const fallback = (
    user?.full_name ||
    user?.fullname ||
    user?.name ||
    user?.email ||
    user?.username ||
    "User"
  )
    .toString()
    .trim();

  return fallback || "User";
}

export function getProfileMenuExpiryLabel(user) {
  const remainingDays = Number(user?.password_days_until_expiry);

  if (!Number.isFinite(remainingDays) || remainingDays < 0) {
    return "";
  }

  const normalizedRemainingDays = Math.max(0, Math.trunc(remainingDays));
  return `Expires in ${normalizedRemainingDays} Day${normalizedRemainingDays === 1 ? "" : "s"}`;
}

export function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "/") return "/";
  return raw.replace(/\/+$/, "");
}

export function findMatchingNavItem(pathname, items) {
  const currentPath = normalizePath(pathname);

  for (const item of items || []) {
    if (Array.isArray(item?.children) && item.children.length > 0) {
      const childMatch = findMatchingNavItem(currentPath, item.children);
      if (childMatch) {
        return childMatch;
      }
    }

    const targetPath = normalizePath(item?.to);
    if (!targetPath) {
      continue;
    }

    const isDashboardItem = item.key === "dashboard";
    const requiresExactMatch = Boolean(item?.end || item?.exact);
    const isExactMatch = currentPath === targetPath;
    const isNestedMatch = !isDashboardItem && !requiresExactMatch && currentPath.startsWith(`${targetPath}/`);

    if (isExactMatch || isNestedMatch) {
      return item;
    }
  }

  return null;
}

export function resolveNavKey(pathname, items, rootPath) {
  const currentPath = normalizePath(pathname);
  const homePath = normalizePath(rootPath || items?.[0]?.to || "/");

  if (currentPath === homePath) return "dashboard";

  const match = findMatchingNavItem(currentPath, items);

  return match?.key || "dashboard";
}
