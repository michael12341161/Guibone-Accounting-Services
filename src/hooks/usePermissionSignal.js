import { useEffect, useState } from "react";
import { MODULE_PERMISSION_CHANGE_EVENT, MODULE_PERMISSION_CHANGE_STORAGE_KEY } from "../utils/module_permissions";

export function usePermissionSignal() {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => {
      setVersion((current) => current + 1);
    };

    const handleStorage = (event) => {
      if (event?.key === MODULE_PERMISSION_CHANGE_STORAGE_KEY) {
        bump();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(MODULE_PERMISSION_CHANGE_EVENT, bump);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(MODULE_PERMISSION_CHANGE_EVENT, bump);
    };
  }, []);

  return version;
}
