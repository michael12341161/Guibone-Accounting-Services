import { useMemo } from "react";
import { useLocation } from "react-router-dom";

/**
 * Returns the current internal workspace prefix based on the URL so shared
 * workspace pages can link within the same role area.
 */
export function useWorkspacePrefix() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const first = String(pathname || "").split("/").filter(Boolean)[0];
    if (first === "admin" || first === "secretary" || first === "accountant" || first === "workspace") {
      return `/${first}`;
    }
    return "/accountant";
  }, [pathname]);
}
