import { useMemo } from "react";
import { useLocation } from "react-router-dom";

/**
 * Returns /admin, /secretary, or /accountant based on the current URL so shared
 * workspace pages can link within the same role area.
 */
export function useWorkspacePrefix() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const first = String(pathname || "").split("/").filter(Boolean)[0];
    if (first === "admin" || first === "secretary" || first === "accountant") {
      return `/${first}`;
    }
    return "/accountant";
  }, [pathname]);
}
