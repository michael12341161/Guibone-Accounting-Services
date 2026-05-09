import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { useModulePermissionRealtimeToasts } from "../../hooks/useModulePermissionRealtimeToasts";
import { useNotification } from "../../hooks/useNotification";
import { showSuccessToast } from "../../utils/feedback";
import {
  MODULE_PERMISSION_GRANTED_TYPE,
  parseModulePermissionAlertMessage,
  resolveNotificationIds,
} from "../../utils/module_permission_notifications";

export default function ModulePermissionGrantAlertObserver() {
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
    moduleType: MODULE_PERMISSION_GRANTED_TYPE,
    showAlertForNotification: (notification, currentUserKey) => {
      const notificationId = resolveNotificationIds(notification)[0] || "notification";
      const { title, description } = parseModulePermissionAlertMessage(
        notification?.message,
        "Module Access Granted",
        "Admin granted you access to a module."
      );

      showSuccessToast({
        title,
        description,
        duration: 3200,
        id: `module-permission-granted:${currentUserKey}:${notificationId}`,
      });
    },
  });

  return null;
}
