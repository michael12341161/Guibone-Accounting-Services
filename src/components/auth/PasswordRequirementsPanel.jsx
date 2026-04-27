import React, { useMemo } from "react";
import PasswordRequirementsCard from "./PasswordRequirementsCard";
import { buildPasswordRequirementItems } from "../../utils/passwordValidation";

export default function PasswordRequirementsPanel({
  password,
  confirmPassword = "",
  maxPasswordLength,
  showConfirmation = false,
  active = false,
  title = "Your password must contain:",
}) {
  const hasPasswordInput = String(password || "").length > 0;
  const requirements = useMemo(
    () =>
      buildPasswordRequirementItems(password, {
        confirmPassword,
        maxPasswordLength,
        requireConfirmation: showConfirmation,
      }),
    [confirmPassword, maxPasswordLength, password, showConfirmation]
  );

  if (!hasPasswordInput) {
    return null;
  }

  return <PasswordRequirementsCard title={title} requirements={requirements} active={active} />;
}
