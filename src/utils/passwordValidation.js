export const MIN_PASSWORD_LENGTH = 12;

function hasUppercase(value) {
  return /[A-Z]/.test(value);
}

function hasLowercase(value) {
  return /[a-z]/.test(value);
}

function hasNumber(value) {
  return /\d/.test(value);
}

function hasSpecialCharacter(value) {
  return /[^A-Za-z0-9\s]/.test(value);
}

export function getPasswordComplexityErrors(password) {
  const value = String(password || "");
  const errors = [];

  if (!hasUppercase(value)) {
    errors.push("At least one uppercase letter");
  }

  if (!hasLowercase(value)) {
    errors.push("At least one lowercase letter");
  }

  if (!hasNumber(value)) {
    errors.push("At least one number");
  }

  if (!hasSpecialCharacter(value)) {
    errors.push("At least one special character");
  }

  return errors;
}

export function formatPasswordComplexityError(password) {
  const errors = getPasswordComplexityErrors(password);
  if (!errors.length) {
    return "";
  }

  return ["Password must contain:", ...errors].join("\n");
}

export function validatePasswordValue(password, { maxPasswordLength, required = true } = {}) {
  const value = String(password || "");

  if (!value) {
    return required ? "Password is required." : "";
  }

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (Number.isFinite(maxPasswordLength) && maxPasswordLength > 0 && value.length > maxPasswordLength) {
    return `Password must not exceed ${maxPasswordLength} characters.`;
  }

  return formatPasswordComplexityError(value);
}

export function buildPasswordRequirementItems(
  password,
  { confirmPassword = "", maxPasswordLength, requireConfirmation = false } = {}
) {
  const value = String(password || "");
  const confirmationValue = String(confirmPassword || "");
  const requirements = [
    {
      id: "min-length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: value.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: "uppercase",
      label: "At least one uppercase letter",
      met: hasUppercase(value),
    },
    {
      id: "lowercase",
      label: "At least one lowercase letter",
      met: hasLowercase(value),
    },
    {
      id: "number",
      label: "At least one number",
      met: hasNumber(value),
    },
    {
      id: "special-character",
      label: "At least one special character",
      met: hasSpecialCharacter(value),
    },
  ];

  if (Number.isFinite(maxPasswordLength) && maxPasswordLength > 0) {
    requirements.push({
      id: "max-length",
      label: `No more than ${maxPasswordLength} characters`,
      met: value.length > 0 && value.length <= maxPasswordLength,
    });
  }

  if (requireConfirmation) {
    requirements.push({
      id: "confirmation",
      label: "Password and confirmation match",
      met: value.length > 0 && confirmationValue.length > 0 && value === confirmationValue,
    });
  }

  return requirements;
}
