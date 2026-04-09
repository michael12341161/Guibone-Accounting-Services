import React from "react";
import { Toaster } from "react-hot-toast";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import DeadlineAlertObserver from "./components/notification/DeadlineAlertObserver";
import { ModulePermissionsProvider } from "./context/ModulePermissionsContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeProvider } from "./context/ThemeContext";
import router from "./routes/AppRoutes";
import { APP_TOASTER_PROPS } from "./utils/feedback";

function AppWithAuth() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModulePermissionsProvider>
          <NotificationProvider>
            <DeadlineAlertObserver />
            <RouterProvider router={router} />
            <Toaster {...APP_TOASTER_PROPS} />
          </NotificationProvider>
        </ModulePermissionsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return <AppWithAuth />;
}
