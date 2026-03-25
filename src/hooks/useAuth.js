import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { getUserRole } from "../utils/helpers";

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return {
    user: context.user,
    role: getUserRole(context.user),
    login: context.login,
    logout: context.logout,
  };
}
