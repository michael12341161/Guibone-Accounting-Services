import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { useModulePermissionRealtimeToasts } from "../../hooks/useModulePermissionRealtimeToasts";
import { useNotification } from "../../hooks/useNotification";
import { showErrorToast } from "../../utils/feedback";
import {
  MODULE_PERMISSION_REVOKED_TYPE,
  parseModulePermissionAlertMessage,
  resolveNotificationIds,
} from "../../utils/module_permission_notifications";

export default function ModulePermissionRevokeAlertObserver() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId, hasLoadedNotifications } = useNotification();
  const { refreshPermissions } = useModulePermissions();

  useModulePermissionRealtimeToasts({
    isAuthReady,
    role,
    hasLoadedNotifications,
    notifications,
    userId,
    refreshPermissions,
    moduleType: MODULE_PERMISSION_REVOKED_TYPE,
    showAlertForNotification: (notification, currentUserKey) => {
      const notificationId = resolveNotificationIds(notification)[0] || "notification";
      const { title, description } = parseModulePermissionAlertMessage(
        notification?.message,
        "Module Access Removed",
        "Admin removed your access to a module."
      );

      showErrorToast({
        title,
        description,
        duration: 3600,
        id: `module-permission-revoked:${currentUserKey}:${notificationId}`,
      });
    },
  });

  return null;
}
