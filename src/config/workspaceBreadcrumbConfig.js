import { adminBreadcrumbConfig } from "./adminBreadcrumbConfig";

function remapAdminPath(value, basePath = "/workspace") {
  if (typeof value === "string") {
    return value.startsWith("/admin") ? value.replace(/^\/admin/, basePath) : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => remapAdminPath(entry, basePath));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        typeof key === "string" && key.startsWith("/admin") ? key.replace(/^\/admin/, basePath) : key,
        remapAdminPath(entryValue, basePath),
      ])
    );
  }

  return value;
}

export function createWorkspaceBreadcrumbConfig(basePath = "/workspace") {
  return remapAdminPath(adminBreadcrumbConfig, basePath);
}

export const workspaceBreadcrumbConfig = createWorkspaceBreadcrumbConfig();

export default workspaceBreadcrumbConfig;
