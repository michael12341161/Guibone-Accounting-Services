import React, { useCallback, useEffect, useMemo, useState } from "react";
import PasswordRequirementsPanel from "../../components/auth/PasswordRequirementsPanel";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import {
  api,
  DEFAULT_SECURITY_SETTINGS,
  fetchRoles,
  fetchSecuritySettings,
  fetchSpecializationTypes,
} from "../../services/api";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { validatePasswordValue } from "../../utils/passwordValidation";
import {
  showConfirmDialog,
  showDangerConfirmDialog,
  showErrorToast,
  showSuccessToast,
} from "../../utils/feedback";
import {
  normalizeMiddleName,
  normalizeMiddleNameOrNull,
  normalizePersonName,
} from "../../utils/person_name";

const PAGE_SIZE = 10;
const ACCOUNT_TYPE_SSS = 1;
const ACCOUNT_TYPE_PAGIBIG = 2;
const ACCOUNT_TYPE_PHILHEALTH = 3;
const USER_MANAGEMENT_ERROR_TOAST_ID = "user-management-error";
const DEFAULT_SPECIALIZATION_TYPES = [
  { id: 1, name: "Tax Filing Operations" },
  { id: 2, name: "Auditing Operations" },
  { id: 3, name: "Book Keeping Operations" },
  { id: 4, name: "Accounting Operations" },
];

function normalizeSelectValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "";
}

function normalizeComparisonValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeRoleName(value) {
  return normalizeComparisonValue(value);
}

function resolveSpecializationName(user, specializationTypes = []) {
  const directNames = Array.isArray(user?.employee_specialization_type_names)
    ? user.employee_specialization_type_names.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (directNames.length > 0) {
    return directNames.join(", ");
  }

  const directName = String(user?.employee_specialization_type_name || "").trim();
  if (directName) return directName;

  const specializationIds = Array.isArray(user?.employee_specialization_type_ids)
    ? user.employee_specialization_type_ids.map(normalizeSelectValue).filter(Boolean)
    : [];
  const resolvedNames = specializationIds
    .map((specializationId) => {
      const matchedSpecialization = specializationTypes.find(
        (specialization) => String(specialization?.id ?? "") === specializationId
      );
      return String(matchedSpecialization?.name || "").trim();
    })
    .filter(Boolean);
  if (resolvedNames.length > 0) {
    return resolvedNames.join(", ");
  }

  const specializationId = normalizeSelectValue(user?.employee_specialization_type_id);
  if (!specializationId) return "";
  const matchedSpecialization = specializationTypes.find((specialization) => String(specialization?.id ?? "") === specializationId);
  return String(matchedSpecialization?.name || "").trim();
}

function resolveUserStatus(user) {
  const directStatus = String(user?.employee_status || user?.status || "").trim();
  if (directStatus) {
    return directStatus;
  }

  const statusId = Number(user?.employee_status_id ?? user?.status_id ?? 0);
  if (statusId === 1 || statusId === 3) {
    return "Active";
  }
  if (statusId === 2 || statusId === 4) {
    return "Inactive";
  }
  if (statusId === 5) {
    return "Resigned";
  }

  return user?.id ? "Active" : "-";
}

function matchesUserStatusFilter(user, statusFilter) {
  const normalizedFilter = String(statusFilter || "").trim().toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  const status = resolveUserStatus(user).trim().toLowerCase();
  if (normalizedFilter === "active") {
    return status === "active";
  }
  if (normalizedFilter === "inactive") {
    return status === "inactive";
  }

  return status === normalizedFilter;
}

function getUserStatusPageLabel(statusValue) {
  return String(statusValue || "").trim().toLowerCase() === "inactive"
    ? "Inactive User"
    : "User Management";
}

function getStatusPillClass(status) {
  const statusText = String(status || "-").trim().toLowerCase();
  if (statusText === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (statusText === "inactive") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (statusText === "-") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function createInitialForm() {
  return {
    username: "",
    email: "",
    password: "",
    role: "",
    employee: {
      first_name: "",
      middle_name: "",
      last_name: "",
      date_of_birth: "",
      phone_number: "",
      sss_account_number: "",
      pagibig_account_number: "",
      philhealth_account_number: "",
      specialization_type_id: "",
      specialization_type_ids: [],
    },
  };
}

function normalizeSpecializationSelections(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeSelectValue(entry))
        .filter(Boolean)
    )
  );
}

function isClientRoleName(value) {
  return normalizeRoleName(value) === "client";
}

function isAdminOrClientRoleName(value) {
  const normalizedRole = normalizeRoleName(value);
  return normalizedRole === "admin" || normalizedRole === "administrator" || normalizedRole === "client";
}

function findRoleChoiceByName(role, roleChoices = []) {
  const normalizedRole = normalizeRoleName(role);
  if (!normalizedRole) {
    return null;
  }

  return (Array.isArray(roleChoices) ? roleChoices : []).find(
    (roleChoice) => normalizeRoleName(roleChoice?.name) === normalizedRole
  ) || null;
}

function getRoleScopedSpecializationTypes(role, roleChoices = [], specializationTypes = []) {
  const matchedRole = findRoleChoiceByName(role, roleChoices);
  const allowedIds = normalizeSpecializationSelections(matchedRole?.specialization_type_ids);
  if (!allowedIds.length) {
    return [];
  }

  const allowedIdSet = new Set(allowedIds);
  return (Array.isArray(specializationTypes) ? specializationTypes : []).filter((specialization) =>
    allowedIdSet.has(normalizeSelectValue(specialization?.id))
  );
}

function syncEmployeeSpecializationForRole(employee, role, roleChoices = [], specializationTypes = []) {
  const currentEmployee = employee && typeof employee === "object" ? employee : {};
  const storedIds = normalizeSpecializationSelections(currentEmployee.specialization_type_ids);
  const currentPrimaryId = normalizeSelectValue(currentEmployee.specialization_type_id);
  const currentIds =
    currentPrimaryId && !storedIds.includes(currentPrimaryId) ? [...storedIds, currentPrimaryId] : storedIds;
  const allowedIds = getRoleScopedSpecializationTypes(role, roleChoices, specializationTypes)
    .map((specialization) => normalizeSelectValue(specialization?.id))
    .filter(Boolean);

  const nextIds = currentIds.filter((specializationId) => allowedIds.includes(specializationId));
  const nextPrimaryId = nextIds[0] || "";
  const idsChanged =
    nextIds.length !== storedIds.length || nextIds.some((specializationId, index) => specializationId !== storedIds[index]);

  if (!idsChanged && currentPrimaryId === nextPrimaryId) {
    return currentEmployee;
  }

  return {
    ...currentEmployee,
    specialization_type_ids: nextIds,
    specialization_type_id: nextPrimaryId,
  };
}

function isValidPhoneNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return /^(\+63|0)?\d{10}$/.test(normalized.replace(/[^\d+]/g, ""));
}

function isValidDateOfBirth(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  if (date > today) return false;
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 18 && age <= 100;
}

function isValidGovernmentAccountNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  return /^[0-9-]{6,20}$/.test(normalized);
}

function isAdminRoleName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "administrator";
}

function parseAccountNumberFromDetail(detail) {
  const directValue = String(detail?.account_name || "").trim();
  if (directValue) {
    return directValue;
  }

  const label = String(detail?.label || "").trim();
  if (!label) {
    return "";
  }

  const separatorIndex = label.indexOf(":");
  if (separatorIndex > -1) {
    const parsedValue = label.slice(separatorIndex + 1).trim();
    if (parsedValue) {
      return parsedValue;
    }
  }

  return "";
}

function extractAccountNumberByType(user, { id, payloadKey, aliases }) {
  const directValue = String(user?.[payloadKey] || "").trim();
  if (directValue) {
    return directValue;
  }

  if (!Array.isArray(user?.employee_financial_details)) {
    return "";
  }

  for (const detail of user.employee_financial_details) {
    const detailId = Number(detail?.id || 0);
    const detailName = String(detail?.name || detail?.label || "").toLowerCase();
    const matchedById = detailId === id;
    const matchedByName = aliases.some((alias) => detailName.includes(alias));
    if (!matchedById && !matchedByName) {
      continue;
    }

    const accountNumber = parseAccountNumberFromDetail(detail);
    if (accountNumber) {
      return accountNumber;
    }
  }

  return "";
}

function extractGovernmentAccountNumbers(user) {
  return {
    sss_account_number: extractAccountNumberByType(user, {
      id: ACCOUNT_TYPE_SSS,
      payloadKey: "employee_sss_account_number",
      aliases: ["sss"],
    }),
    pagibig_account_number: extractAccountNumberByType(user, {
      id: ACCOUNT_TYPE_PAGIBIG,
      payloadKey: "employee_pagibig_account_number",
      aliases: ["pag-ibig", "pagibig"],
    }),
    philhealth_account_number: extractAccountNumberByType(user, {
      id: ACCOUNT_TYPE_PHILHEALTH,
      payloadKey: "employee_philhealth_account_number",
      aliases: ["philhealth", "phil health"],
    }),
  };
}

function mapEmployeeFromUser(user) {
  const governmentAccounts = extractGovernmentAccountNumbers(user);

  return {
    first_name: normalizePersonName(user?.employee_first_name),
    middle_name: normalizeMiddleName(user?.employee_middle_name),
    last_name: normalizePersonName(user?.employee_last_name),
    date_of_birth: user?.employee_date_of_birth || "",
    phone_number: user?.employee_phone_number || "",
    sss_account_number: governmentAccounts.sss_account_number,
    pagibig_account_number: governmentAccounts.pagibig_account_number,
    philhealth_account_number: governmentAccounts.philhealth_account_number,
    specialization_type_id: normalizeSelectValue(user?.employee_specialization_type_id),
    specialization_type_ids: normalizeSpecializationSelections(user?.employee_specialization_type_ids),
  };
}

export default function UserManagement({
  userStatusFilter = "active",
  pageTitle = "User Management",
  pageDescription,
  emptyMessage = "No active users found.",
  showAddUserButton = true,
}) {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const canViewUsers = hasFeatureActionAccess(user, "user-management", "view", permissions);
  const canEditUsers = hasFeatureActionAccess(user, "user-management", "edit", permissions);
  const canSetUserAccountStatus = hasFeatureActionAccess(user, "user-management", "account-status", permissions);
  const canAddUsers = hasFeatureActionAccess(user, "user-management", "add-user", permissions);
  const canManageUsers = canEditUsers || canAddUsers;
  const defaultPageDescription = canManageUsers
    ? `Manage ${String(userStatusFilter).trim().toLowerCase() === "inactive" ? "inactive" : "active"} staff accounts from the admin dashboard.`
    : `View ${String(userStatusFilter).trim().toLowerCase() === "inactive" ? "inactive" : "active"} staff accounts in read-only mode.`;
  const userManagementDescription = pageDescription || defaultPageDescription;
  const [users, setUsers] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [form, setForm] = useState(createInitialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [specializationTypes, setSpecializationTypes] = useState(DEFAULT_SPECIALIZATION_TYPES);
  const [roleChoices, setRoleChoices] = useState([]);
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);
  const [statusActionUserId, setStatusActionUserId] = useState(null);
  const normalizedFormRole = normalizeRoleName(form.role);
  const selectedRoleChoice = useMemo(() => findRoleChoiceByName(form.role, roleChoices), [form.role, roleChoices]);
  const roleScopedSpecializationTypes = useMemo(
    () => getRoleScopedSpecializationTypes(form.role, roleChoices, specializationTypes),
    [form.role, roleChoices, specializationTypes]
  );
  const selectedSpecializationIds = normalizeSpecializationSelections(form.employee?.specialization_type_ids);
  const hasSelectedRole = Boolean(normalizedFormRole);
  const viewGovernmentAccounts = useMemo(() => extractGovernmentAccountNumbers(viewUser), [viewUser]);
  const viewSpecializationName = useMemo(() => {
    return resolveSpecializationName(viewUser, specializationTypes) || "-";
  }, [specializationTypes, viewUser]);

  const reportError = useCallback((message) => {
    const normalizedMessage = String(message || "").trim();
    setError(normalizedMessage);
    if (normalizedMessage) {
      showErrorToast({
        title: normalizedMessage,
        id: USER_MANAGEMENT_ERROR_TOAST_ID,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [usersRes, specializationRes, rolesRes] = await Promise.allSettled([
          api.get("user_list.php"),
          fetchSpecializationTypes({
            params: {
              include_disabled: 0,
            },
          }),
          fetchRoles({
            params: {
              include_disabled: 0,
            },
          }),
        ]);

        if (mounted && usersRes.status === "fulfilled" && Array.isArray(usersRes.value.data?.users)) {
          setUsers(usersRes.value.data.users);
        }

        if (mounted && specializationRes.status === "fulfilled") {
          const nextOptions = Array.isArray(specializationRes.value.data?.specialization_types)
            ? specializationRes.value.data.specialization_types
            : [];
          if (nextOptions.length > 0) {
            setSpecializationTypes(nextOptions);
          } else {
            setSpecializationTypes([]);
          }
        }

        if (mounted && rolesRes.status === "fulfilled") {
          const nextRoles = Array.isArray(rolesRes.value.data?.roles)
            ? rolesRes.value.data.roles.filter((role) => !isAdminRoleName(role?.name) && !isClientRoleName(role?.name))
            : [];
          setRoleChoices(nextRoles);
        }
      } catch (_) {
        // Keep the view usable even when the endpoints are unavailable.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadSecuritySettings = async () => {
      try {
        const response = await fetchSecuritySettings({ signal: controller.signal });
        if (!active) return;
        setSecuritySettings(response?.data?.settings || DEFAULT_SECURITY_SETTINGS);
      } catch (_) {
        if (!active) return;
        setSecuritySettings(DEFAULT_SECURITY_SETTINGS);
      }
    };

    loadSecuritySettings();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setForm((prev) => {
      const nextEmployee = syncEmployeeSpecializationForRole(prev.employee, prev.role, roleChoices, specializationTypes);
      if (nextEmployee === prev.employee) {
        return prev;
      }

      return {
        ...prev,
        employee: nextEmployee,
      };
    });
  }, [form.role, roleChoices, specializationTypes]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "role") {
        return {
          ...prev,
          role: value,
          employee: syncEmployeeSpecializationForRole(prev.employee, value, roleChoices, specializationTypes),
        };
      }

      return { ...prev, [name]: value };
    });
  };

  const handleEmployeeChange = (event) => {
    const { name, value, options, multiple } = event.target;
    const nextValue =
      multiple && options
        ? Array.from(options)
            .filter((option) => option.selected)
            .map((option) => option.value)
        : value;
    setForm((prev) => ({ ...prev, employee: { ...(prev.employee || {}), [name]: nextValue } }));
  };

  const handleSpecializationCheckboxChange = (specializationId) => {
    setForm((prev) => {
      const currentIds = new Set(normalizeSpecializationSelections(prev.employee?.specialization_type_ids));
      const normalizedId = normalizeSelectValue(specializationId);
      if (!normalizedId) {
        return prev;
      }

      if (currentIds.has(normalizedId)) {
        currentIds.delete(normalizedId);
      } else {
        currentIds.add(normalizedId);
      }

      const nextIds = Array.from(currentIds);
      return {
        ...prev,
        employee: {
          ...(prev.employee || {}),
          specialization_type_ids: nextIds,
          specialization_type_id: nextIds[0] || "",
        },
      };
    });
  };

  const validateEmployeeDetails = () => {
    if (!isValidPhoneNumber(form.employee?.phone_number)) {
      return "Enter a valid phone number.";
    }
    if (!isValidDateOfBirth(form.employee?.date_of_birth)) {
      return "Enter a valid date of birth for an employee aged 18 to 100.";
    }
    if (!isValidGovernmentAccountNumber(form.employee?.sss_account_number)) {
      return "Enter a valid SSS account number.";
    }
    if (!isValidGovernmentAccountNumber(form.employee?.pagibig_account_number)) {
      return "Enter a valid Pag-IBIG account number.";
    }
    if (!isValidGovernmentAccountNumber(form.employee?.philhealth_account_number)) {
      return "Enter a valid PhilHealth account number.";
    }
    return "";
  };

  const resetForm = ({ clearMessages = true } = { clearMessages: true }) => {
    setForm(createInitialForm());
    setEditingUser(null);
    if (clearMessages) {
      setError("");
      setSuccess("");
    }
  };

  const openAddModal = () => {
    if (!canAddUsers) {
      return;
    }

    resetForm();
    setAddOpen(true);
  };

  const openEditModal = (user) => {
    if (!canEditUsers) {
      return;
    }

    setError("");
    setSuccess("");
    setEditingUser(user);
    setForm({
      ...createInitialForm(),
      username: user?.username || "",
      email: user?.email || "",
      password: "",
      role: user?.role || "Secretary",
      employee: syncEmployeeSpecializationForRole(
        mapEmployeeFromUser(user),
        user?.role || "Secretary",
        roleChoices,
        specializationTypes
      ),
    });
    setEditOpen(true);
  };

  const openViewModal = (user) => {
    if (!canViewUsers) {
      return;
    }

    setViewUser(user);
    setViewOpen(true);
  };

  const closeAddModal = () => {
    setAddOpen(false);
    resetForm();
  };

  const closeEditModal = () => {
    setEditOpen(false);
    resetForm();
  };

  const closeViewModal = () => {
    setViewOpen(false);
    setViewUser(null);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!canAddUsers) {
      reportError("You do not have permission to create users.");
      return;
    }

    if (!form.username || !form.email || !form.password || !form.role) {
      reportError("All fields are required.");
      return;
    }
    if (!String(form?.employee?.first_name || "").trim() || !String(form?.employee?.last_name || "").trim()) {
      reportError("Employee first and last name are required.");
      return;
    }
    const employeeValidationMessage = validateEmployeeDetails();
    if (employeeValidationMessage) {
      reportError(employeeValidationMessage);
      return;
    }

    const passwordValidationError = validatePasswordValue(form.password, {
      maxPasswordLength: securitySettings.maxPasswordLength,
    });
    if (passwordValidationError) {
      reportError(passwordValidationError);
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("user_create.php", {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        employee_details: {
          first_name: normalizePersonName(form.employee?.first_name),
          middle_name: normalizeMiddleNameOrNull(form.employee?.middle_name),
          last_name: normalizePersonName(form.employee?.last_name),
          date_of_birth: form.employee?.date_of_birth || null,
          phone_number: String(form.employee?.phone_number || "").trim() || null,
          sss_account_number: String(form.employee?.sss_account_number || "").trim() || null,
          pagibig_account_number: String(form.employee?.pagibig_account_number || "").trim() || null,
          philhealth_account_number: String(form.employee?.philhealth_account_number || "").trim() || null,
          specialization_type_id: normalizeSelectValue(form.employee?.specialization_type_id) || null,
          specialization_type_ids: normalizeSpecializationSelections(form.employee?.specialization_type_ids),
        },
      });

      if (!res.data?.success) {
        reportError(res.data?.message || "Failed to create user.");
        return;
      }

      const newUser = res.data?.user || {
        id: res.data?.id || Date.now(),
        username: form.username,
        email: form.email,
        role: form.role,
        employee_id: res.data?.employee_id || null,
      };

      try {
        const list = await api.get("user_list.php");
        if (Array.isArray(list.data?.users)) {
          setUsers(list.data.users);
        } else {
          setUsers((prev) => [...prev, newUser]);
        }
      } catch (_) {
        setUsers((prev) => [...prev, newUser]);
      }

      setAddOpen(false);
      resetForm({ clearMessages: false });
      setSuccess("User created successfully.");
    } catch (err) {
      reportError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!canEditUsers) {
      reportError("You do not have permission to edit users.");
      return;
    }

    if (!form.username || !form.email || !form.role) {
      reportError("All fields are required.");
      return;
    }
    if (!String(form?.employee?.first_name || "").trim() || !String(form?.employee?.last_name || "").trim()) {
      reportError("Employee first and last name are required.");
      return;
    }
    const employeeValidationMessage = validateEmployeeDetails();
    if (employeeValidationMessage) {
      reportError(employeeValidationMessage);
      return;
    }

    const passwordValidationError = validatePasswordValue(form.password, {
      maxPasswordLength: securitySettings.maxPasswordLength,
      required: false,
    });
    if (passwordValidationError) {
      reportError(passwordValidationError);
      return;
    }

    try {
      setLoading(true);

      if (editingUser) {
        const payload = {
          id: editingUser.id,
          username: form.username,
          email: form.email,
          role: form.role,
          employee_details: {
            first_name: normalizePersonName(form.employee?.first_name),
            middle_name: normalizeMiddleNameOrNull(form.employee?.middle_name),
            last_name: normalizePersonName(form.employee?.last_name),
            date_of_birth: form.employee?.date_of_birth || null,
            phone_number: String(form.employee?.phone_number || "").trim() || null,
            sss_account_number: String(form.employee?.sss_account_number || "").trim() || null,
            pagibig_account_number: String(form.employee?.pagibig_account_number || "").trim() || null,
            philhealth_account_number: String(form.employee?.philhealth_account_number || "").trim() || null,
            specialization_type_id: normalizeSelectValue(form.employee?.specialization_type_id) || null,
            specialization_type_ids: normalizeSpecializationSelections(form.employee?.specialization_type_ids),
          },
        };
        if (form.password) payload.password = form.password;

        const res = await api.post("user_update.php", payload);
        if (!res?.data?.success) {
          reportError(res?.data?.message || "Failed to update user.");
          return;
        }

        try {
          const list = await api.get("user_list.php");
          if (Array.isArray(list.data?.users)) {
            setUsers(list.data.users);
          }
        } catch (_) {
          // Keep current local state on refresh failure.
        }
      }

      setEditOpen(false);
      resetForm({ clearMessages: false });
      setSuccess("User updated successfully.");
    } catch (err) {
      reportError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = ["All", ...roleChoices.map((role) => String(role?.name || "").trim()).filter(Boolean)];

  const toggleUserStatus = useCallback(async (targetUser) => {
    if (!targetUser?.id) return;
    if (!canSetUserAccountStatus) {
      reportError("You do not have permission to change user account status.");
      return;
    }

    const currentStatus = resolveUserStatus(targetUser);
    const nextStatus = String(currentStatus).trim().toLowerCase() === "inactive" ? "Active" : "Inactive";

    if (nextStatus === "Inactive") {
      const confirmation = await showDangerConfirmDialog({
        title: "Set account to inactive?",
        text: "This user will no longer be able to log in or use forgot password until the account is reactivated.",
        confirmButtonText: "Set Inactive",
      });
      if (!confirmation.isConfirmed) {
        return;
      }
    } else {
      const confirmation = await showConfirmDialog({
        title: "Set account to active?",
        text: "This user will be able to log in and use forgot password again.",
        confirmButtonText: "Set Active",
      });
      if (!confirmation.isConfirmed) {
        return;
      }
    }

    setError("");
    setSuccess("");
    setStatusActionUserId(targetUser.id);

    try {
      const response = await api.post("user_update.php", {
        action: "update_status",
        id: targetUser.id,
        employment_status: nextStatus,
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Failed to update user status.");
      }

      const updatedUser = response?.data?.user || {};
      setUsers((prev) =>
        prev.map((entry) =>
          entry.id === targetUser.id
            ? {
                ...entry,
                employee_status_id: updatedUser.employee_status_id ?? entry.employee_status_id,
                employee_status: updatedUser.employee_status ?? nextStatus,
                status: updatedUser.employee_status ?? nextStatus,
              }
            : entry
        )
      );
      showSuccessToast({
        title: nextStatus === "Active" ? "User account activated." : "User account set to inactive.",
        description:
          nextStatus === "Active"
            ? `The user can log in and use forgot password again. This user now appears on the ${getUserStatusPageLabel(nextStatus)} page.`
            : `The user can no longer log in until the account is reactivated. This user now appears on the ${getUserStatusPageLabel(nextStatus)} page.`,
      });
    } catch (requestError) {
      reportError(requestError?.response?.data?.message || requestError?.message || "Failed to update user status.");
    } finally {
      setStatusActionUserId(null);
    }
  }, [canSetUserAccountStatus, reportError]);

  const statusFilteredUsers = useMemo(() => {
    return users.filter((entry) => matchesUserStatusFilter(entry, userStatusFilter));
  }, [userStatusFilter, users]);

  const filteredUsers = useMemo(() => {
    return statusFilteredUsers.filter((user) => {
      const roleText = String(user?.role || "").toLowerCase();
      if (isAdminOrClientRoleName(roleText)) return false;

      const selectedRole = String(roleFilter || "All").toLowerCase();
      if (selectedRole !== "all" && roleText !== selectedRole) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;

      const username = String(user?.username || "").toLowerCase();
      const email = String(user?.email || "").toLowerCase();
      const business = String(user?.business_type || "").toLowerCase();
      const specialization = resolveSpecializationName(user, specializationTypes).toLowerCase();
      const status = resolveUserStatus(user).toLowerCase();
      return (
        username.includes(q) ||
        email.includes(q) ||
        roleText.includes(q) ||
        business.includes(q) ||
        specialization.includes(q) ||
        status.includes(q)
      );
    });
  }, [roleFilter, search, specializationTypes, statusFilteredUsers]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedUsers = filteredUsers.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const visibleRowActionCount = [canViewUsers, canEditUsers].filter(Boolean).length;
  const hasRowActions = visibleRowActionCount > 0;
  const actionColumnWidth = visibleRowActionCount >= 2 ? "12%" : visibleRowActionCount === 1 ? "8%" : "0%";

  const tableRows = useMemo(
    () =>
      pagedUsers.map((user, idx) => ({
        key: user.id ?? `${user.username}-${startIndex + idx}`,
        index: startIndex + idx + 1,
        specialization: resolveSpecializationName(user, specializationTypes) || "-",
        username: user.username || "-",
        email: user.email || "-",
        role: user.role || "-",
        status: resolveUserStatus(user),
        raw: user,
      })),
    [pagedUsers, specializationTypes, startIndex]
  );

  const columns = [
    { key: "index", header: "#", width: "8%" },
    { key: "username", header: "Username", width: "18%" },
    { key: "email", header: "Email", width: "24%" },
    { key: "specialization", header: "Specialization", width: "18%" },
    {
      key: "role",
      header: "Role",
      width: "10%",
      render: (value) => (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize">
          {value || "-"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (value, row) =>
        canSetUserAccountStatus ? (
          <button
            type="button"
            onClick={() => {
              void toggleUserStatus(row.raw);
            }}
            disabled={statusActionUserId === row.raw?.id}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              getStatusPillClass(value)
            } ${statusActionUserId === row.raw?.id ? "cursor-wait opacity-70" : ""}`}
            title="Click to change status"
          >
            {value || "-"}
          </button>
        ) : (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusPillClass(value)}`}>
            {value || "-"}
          </span>
        ),
    },
    ...(hasRowActions
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right",
            width: actionColumnWidth,
            render: (_, row) => (
              <div className="flex items-center justify-end gap-1">
                {canViewUsers ? (
                  <IconButton
                    size="sm"
                    variant="secondary"
                    aria-label={`View ${row.username}`}
                    onClick={() => openViewModal(row.raw)}
                    title="View employee details"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                    </svg>
                  </IconButton>
                ) : null}
                {canEditUsers ? (
                  <IconButton
                    size="sm"
                    variant="secondary"
                    aria-label={`Edit ${row.username}`}
                    onClick={() => openEditModal(row.raw)}
                    title="Edit user"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-10.21a1 1 0 0 0 0-1.42l-2.33-2.33a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </IconButton>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader
          action={
            canManageUsers ? (
              showAddUserButton ? (
                <Button variant="success" size="sm" onClick={openAddModal} disabled={!canAddUsers}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 6a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 12 6z" />
                  </svg>
                  Add User
                </Button>
              ) : (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  Filtered view
                </span>
              )
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                Read-only view
              </span>
            )
          }
        >
          <CardTitle>{pageTitle}</CardTitle>
          <CardDescription>{userManagementDescription}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search users..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="w-full sm:w-56">
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                aria-label="Filter by role"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={tableRows}
            keyField="key"
            compact
            striped={false}
            emptyMessage={emptyMessage}
            className="shadow-none"
          />

          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{filteredUsers.length === 0 ? 0 : startIndex + 1}</span>-
              <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, filteredUsers.length)}</span> of{" "}
              <span className="font-medium">{filteredUsers.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canPrev) setCurrentPage((prev) => prev - 1);
                }}
                disabled={!canPrev}
              >
                Previous
              </Button>

              <div className="text-xs text-slate-600">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canNext) setCurrentPage((prev) => prev + 1);
                }}
                disabled={!canNext}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="Add New User"
        description="Create a new Secretary or Accountant account."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              Cancel
            </Button>
            <Button type="submit" form="admin-add-user-form" variant="success" disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </Button>
          </>
        }
      >
        <form id="admin-add-user-form" onSubmit={handleCreate} className="space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Account Details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Username</label>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., johndoe"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., john@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  maxLength={securitySettings.maxPasswordLength}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="Enter password"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="">Select Role</option>
                  {roleChoices.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <PasswordRequirementsPanel
                  password={form.password}
                  maxPasswordLength={securitySettings.maxPasswordLength}
                  active={Boolean(form.password)}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Employee Details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
                <input
                  type="text"
                  name="first_name"
                  value={form.employee?.first_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., John"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Middle Name</label>
                <input
                  type="text"
                  name="middle_name"
                  value={form.employee?.middle_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., A."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
                <input
                  type="text"
                  name="last_name"
                  value={form.employee?.last_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., Doe"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={form.employee?.date_of_birth || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Phone Number</label>
                <input
                  type="text"
                  name="phone_number"
                  value={form.employee?.phone_number || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="e.g., +63 900 000 0000"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Specialization</label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-300 px-3 py-2">
                  {!hasSelectedRole ? (
                    <div className="text-sm text-slate-500">Select a role to view specialization options.</div>
                  ) : roleScopedSpecializationTypes.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      {selectedRoleChoice?.name
                        ? `No specializations are assigned to ${selectedRoleChoice.name} yet.`
                        : "No specializations are assigned to this role yet."}
                    </div>
                  ) : (
                    roleScopedSpecializationTypes.map((specialization) => {
                      const specializationId = String(specialization.id);
                      const checked = selectedSpecializationIds.includes(specializationId);
                      return (
                        <label key={specialization.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleSpecializationCheckboxChange(specializationId)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>{specialization.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Financial Details</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">SSS</label>
                    <input
                      type="text"
                      name="sss_account_number"
                      value={form.employee?.sss_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="SSS Account Number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Pag-IBIG</label>
                    <input
                      type="text"
                      name="pagibig_account_number"
                      value={form.employee?.pagibig_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="Pag-IBIG Account Number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">PhilHealth</label>
                    <input
                      type="text"
                      name="philhealth_account_number"
                      value={form.employee?.philhealth_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
                      placeholder="PhilHealth Account Number"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEditModal}
        title="Edit User"
        description="Update account and employee details."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button type="submit" form="admin-edit-user-form" variant="success" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      >
        <form id="admin-edit-user-form" onSubmit={handleUpdate} className="space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Account Details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Username</label>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., johndoe"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., john@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">New Password (optional)</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  maxLength={securitySettings.maxPasswordLength}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="Leave blank to keep current password"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="">Select Role</option>
                  {roleChoices.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <PasswordRequirementsPanel
                  password={form.password}
                  maxPasswordLength={securitySettings.maxPasswordLength}
                  active={Boolean(form.password)}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Employee Details</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
                <input
                  type="text"
                  name="first_name"
                  value={form.employee?.first_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., John"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Middle Name</label>
                <input
                  type="text"
                  name="middle_name"
                  value={form.employee?.middle_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., A."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
                <input
                  type="text"
                  name="last_name"
                  value={form.employee?.last_name || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., Doe"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={form.employee?.date_of_birth || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Phone Number</label>
                <input
                  type="text"
                  name="phone_number"
                  value={form.employee?.phone_number || ""}
                  onChange={handleEmployeeChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="e.g., +63 900 000 0000"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Specialization</label>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-300 px-3 py-2">
                  {!hasSelectedRole ? (
                    <div className="text-sm text-slate-500">Select a role to view specialization options.</div>
                  ) : roleScopedSpecializationTypes.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      {selectedRoleChoice?.name
                        ? `No specializations are assigned to ${selectedRoleChoice.name} yet.`
                        : "No specializations are assigned to this role yet."}
                    </div>
                  ) : (
                    roleScopedSpecializationTypes.map((specialization) => {
                      const specializationId = String(specialization.id);
                      const checked = selectedSpecializationIds.includes(specializationId);
                      return (
                        <label key={specialization.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleSpecializationCheckboxChange(specializationId)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{specialization.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Financial Details</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">SSS</label>
                    <input
                      type="text"
                      name="sss_account_number"
                      value={form.employee?.sss_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                      placeholder="SSS Account Number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Pag-IBIG</label>
                    <input
                      type="text"
                      name="pagibig_account_number"
                      value={form.employee?.pagibig_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                      placeholder="Pag-IBIG Account Number"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">PhilHealth</label>
                    <input
                      type="text"
                      name="philhealth_account_number"
                      value={form.employee?.philhealth_account_number || ""}
                      onChange={handleEmployeeChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/30"
                      placeholder="PhilHealth Account Number"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={viewOpen}
        onClose={closeViewModal}
        title="Employee Details"
        description="View account and employee information."
        size="lg"
        footer={
          <Button variant="secondary" onClick={closeViewModal}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Account Details</h4>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Username</div>
                <div className="font-medium text-slate-800">{viewUser?.username || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="font-medium text-slate-800 break-words">{viewUser?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Role</div>
                <div className="font-medium text-slate-800">{viewUser?.role || "-"}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Employee Details</h4>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">First Name</div>
                <div className="font-medium text-slate-800">{normalizePersonName(viewUser?.employee_first_name) || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Middle Name</div>
                <div className="font-medium text-slate-800">{normalizeMiddleName(viewUser?.employee_middle_name) || "None"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Last Name</div>
                <div className="font-medium text-slate-800">{normalizePersonName(viewUser?.employee_last_name) || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date of Birth</div>
                <div className="font-medium text-slate-800">{viewUser?.employee_date_of_birth || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Phone Number</div>
                <div className="font-medium text-slate-800">{viewUser?.employee_phone_number || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Specialization</div>
                <div className="font-medium text-slate-800">{viewSpecializationName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">SSS Account Number</div>
                <div className="font-medium text-slate-800">{viewGovernmentAccounts.sss_account_number || "None"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pag-IBIG Account Number</div>
                <div className="font-medium text-slate-800">{viewGovernmentAccounts.pagibig_account_number || "None"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">PhilHealth Account Number</div>
                <div className="font-medium text-slate-800">{viewGovernmentAccounts.philhealth_account_number || "None"}</div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
