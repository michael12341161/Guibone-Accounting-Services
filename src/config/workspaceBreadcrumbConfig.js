import { adminBreadcrumbConfig } from "./adminBreadcrumbConfig";

function remapAdminPath(value) {
  if (typeof value === "string") {
    return value.startsWith("/admin") ? value.replace(/^\/admin/, "/workspace") : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => remapAdminPath(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        typeof key === "string" && key.startsWith("/admin") ? key.replace(/^\/admin/, "/workspace") : key,
        remapAdminPath(entryValue),
      ])
    );
  }

  return value;
}

export const workspaceBreadcrumbConfig = remapAdminPath(adminBreadcrumbConfig);

export default workspaceBreadcrumbConfig;
