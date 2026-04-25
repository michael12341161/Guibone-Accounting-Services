import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { api } from "../services/api";
import { ROLE_IDS } from "../utils/helpers";
import { countOpenTasks } from "../utils/task_attention";

const TASK_ATTENTION_ROLES = [ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT];
const TASK_ATTENTION_REFRESH_MS = 60000;

export function usePendingTaskAttentionCount() {
  const location = useLocation();
  const { isAuthReady, role, user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthReady || !TASK_ATTENTION_ROLES.includes(role)) {
      setCount(0);
      return undefined;
    }

    let active = true;
    let activeController = null;

    const loadCount = async () => {
      if (activeController) {
        activeController.abort();
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await api.get("task_list.php", { signal: controller.signal });
        if (!active) return;

        const tasks = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        setCount(countOpenTasks(tasks));
      } catch (_) {
        if (!active || controller.signal.aborted) return;
        setCount(0);
      }
    };

    void loadCount();

    const handleWindowFocus = () => {
      void loadCount();
    };

    window.addEventListener("focus", handleWindowFocus);
    const intervalId = window.setInterval(() => {
      void loadCount();
    }, TASK_ATTENTION_REFRESH_MS);

    return () => {
      active = false;
      if (activeController) {
        activeController.abort();
      }
      window.removeEventListener("focus", handleWindowFocus);
      window.clearInterval(intervalId);
    };
  }, [isAuthReady, location.pathname, role, user?.id, user?.user_id, user?.User_ID]);

  return count;
}
