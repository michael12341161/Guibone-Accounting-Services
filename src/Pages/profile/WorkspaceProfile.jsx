import React from "react";
import AdminProfile from "./AdminProfile";

const WORKSPACE_PROFILE_COPY = Object.freeze({
  fallbackName: "User",
  fallbackInitials: "US",
  missingProfileMessage: "No linked profile was found for this account.",
  notFoundMessage: "Profile not found.",
  loadErrorMessage: "Unable to load your profile right now.",
  description: "View and manage your role-based workspace account details.",
  roleInfoLabel: "Assigned Role",
  defaultRoleLabel: "Assigned Role",
});

export default function WorkspaceProfile(props) {
  return <AdminProfile {...props} copy={WORKSPACE_PROFILE_COPY} />;
}
