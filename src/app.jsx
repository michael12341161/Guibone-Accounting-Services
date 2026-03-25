import React from "react";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ModulePermissionsProvider } from "./context/ModulePermissionsContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ThemeProvider } from "./context/ThemeContext";
import router from "./routes/AppRoutes";

function AppWithAuth() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModulePermissionsProvider>
          <NotificationProvider>
            <RouterProvider router={router} />
          </NotificationProvider>
        </ModulePermissionsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return <AppWithAuth />;
}
