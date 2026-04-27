import { getUserRole, ROLE_IDS } from "./helpers";

export const MODULE_PERMISSION_CHANGE_STORAGE_KEY = "monitoring:permissions-changed-at";
export const MODULE_PERMISSION_CHANGE_EVENT = "monitoring:permissions-changed";
export const MODULE_ACCESS_DENIED_MESSAGE = "You do not have permission to access this page.";

const ROLE_KEY_BY_ID = Object.freeze({
  [ROLE_IDS.ADMIN]: "admin",
  [ROLE_IDS.SECRETARY]: "secretary",
  [ROLE_IDS.ACCOUNTANT]: "accountant",
  [ROLE_IDS.CLIENT]: "client",
});
const BUILTIN_ROLE_KEYS = Object.freeze(Object.values(ROLE_KEY_BY_ID));
const FEATURES_WITH_INDEPENDENT_ACTION_ACCESS = new Set(["certificate", "edit-certificate"]);

function normalizeRoleKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "actions") {
    return "";
  }

  return normalized;
}

function mergeRoleKeys(...groups) {
  const roleKeys = new Set(BUILTIN_ROLE_KEYS);

  groups.forEach((group) => {
    if (Array.isArray(group)) {
      group.forEach((value) => {
        const normalized = normalizeRoleKey(value);
        if (normalized) {
          roleKeys.add(normalized);
        }
      });
      return;
    }

    if (group && typeof group === "object") {
      Object.keys(group).forEach((key) => {
        const normalized = normalizeRoleKey(key);
        if (normalized) {
          roleKeys.add(normalized);
        }
      });
      return;
    }

    const normalized = normalizeRoleKey(group);
    if (normalized) {
      roleKeys.add(normalized);
    }
  });

  return Array.from(roleKeys);
}

function collectRoleKeysFromPermissions(permissions) {
  const roleKeys = new Set(BUILTIN_ROLE_KEYS);

  if (!permissions || typeof permissions !== "object") {
    return Array.from(roleKeys);
  }

  Object.values(permissions).forEach((featurePermissions) => {
    if (!featurePermissions || typeof featurePermissions !== "object") {
      return;
    }

    Object.keys(featurePermissions).forEach((key) => {
      const normalized = normalizeRoleKey(key);
      if (normalized) {
        roleKeys.add(normalized);
      }
    });

    if (!featurePermissions.actions || typeof featurePermissions.actions !== "object") {
      return;
    }

    Object.values(featurePermissions.actions).forEach((actionPermissions) => {
      if (!actionPermissions || typeof actionPermissions !== "object") {
        return;
      }

      Object.keys(actionPermissions).forEach((key) => {
        const normalized = normalizeRoleKey(key);
        if (normalized) {
          roleKeys.add(normalized);
        }
      });
    });
  });

  return Array.from(roleKeys);
}

function humanizePermissionKey(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function featureUsesIndependentAccess(featureKey) {
  return FEATURES_WITH_INDEPENDENT_ACTION_ACCESS.has(String(featureKey || "").trim());
}

export const FEATURE_SECTIONS = [
  {
    label: "Core Access",
    features: [
      {
        key: "dashboard",
        label: "Dashboard Access",
        description: "Open the role home page.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: true },
      },
      {
        key: "user-management",
        label: "User Management",
        description: "View and manage system users.",
        defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
        actions: [
          {
            key: "view",
            label: "Can View",
            description: "Allow the role to open and review user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
          },
          {
            key: "edit",
            label: "Can Edit",
            description: "Allow the role to update existing user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
          },
          {
            key: "add-user",
            label: "Add User",
            description: "Allow the role to create new user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
          },
          {
            key: "account-status",
            label: "Set Active / Inactive",
            description:
              "Allow the role to change a user account between Active and Inactive from the User Management list (login and password recovery follow account status).",
            defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
          },
        ],
      },
      {
        key: "permissions",
        label: "Permissions",
        description: "Configure access rules for each role.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
      },
      {
        key: "settings",
        label: "Settings",
        description: "Update system settings and preferences.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
      },
    ],
  },
  {
    label: "Client Work 1",
    features: [
      {
        key: "client-management",
        label: "Client Management",
        description: "Open client records and manage client details.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
        actions: [
          {
            key: "view",
            label: "Can View",
            description: "Allow the role to open and review client records.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "edit",
            label: "Can Edit",
            description: "Allow the role to update existing client details.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "add-new-client",
            label: "Add New Client",
            description: "Allow the role to create new client records.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "location",
            label: "Location Access",
            description: "Allow the role to open saved business locations for clients.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "file-upload",
            label: "File Upload",
            description: "Allow the role to upload files in Required Documents.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "account-status",
            label: "Set Active / Inactive",
            description:
              "Allow the role to change a client account between Active and Inactive from the Client Management list (login and password recovery follow account status).",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
        ],
      },
      {
        key: "new-client-management",
        label: "New Client Management",
        description: "Handle newly created client records.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
      },
      {
        key: "documents",
        label: "Documents",
        description: "Manage Business Permit, DTI, SEC, and LGU files for client businesses.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
        actions: [
          {
            key: "upload",
            label: "Can Upload",
            description: "Allow the role to upload or replace Business Permit, DTI, SEC, and LGU files.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "view-only",
            label: "View Only",
            description: "Allow the role to open the Documents page and review uploaded files without uploading changes.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
        ],
      },
      {
        key: "certificate",
        label: "Certificate",
        description: "Allow the role to open and review certificate templates.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
        actions: [
          {
            key: "edit",
            label: "Edit",
            description: "Allow the role to use the Edit button from the Certificate page.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "remove",
            label: "Remove",
            description: "Allow the role to remove saved certificate templates from the Certificate page.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "remove-auto-send",
            label: "Remove Auto-send",
            description: "Allow the role to assign or remove templates for automatic certificate delivery.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
        ],
      },
    ],
  },
  {
    label: "Client Work 2",
    features: [
      {
        key: "edit-certificate",
        label: "Edit Certificate",
        description: "Allow the role to create or update certificate templates.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
        actions: [
          {
            key: "header-tools-properties",
            label: "Can Access Header Tools and Properties",
            description: "Allow the role to use the Header Tools and Properties controls in the Edit Certificate page.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
        ],
      },
      {
        key: "business-status",
        label: "Business Status",
        description: "Review which client businesses are registered and which still need a Business Permit.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
      },
      {
        key: "appointments",
        label: "Appointments",
        description: "View and manage scheduled appointments.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
        actions: [
          {
            key: "approve",
            label: "Approve",
            description: "Allow the role to approve appointment requests.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "decline",
            label: "Decline",
            description: "Allow the role to decline appointment requests.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "view-files",
            label: "View Files",
            description: "Allow the role to open and review uploaded appointment files.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
        ],
      },
      {
        key: "scheduling",
        label: "Consultation",
        description: "Manage consultation schedules and slots.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
        actions: [
          {
            key: "approve",
            label: "Approve",
            description: "Allow the role to approve consultation requests.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "decline",
            label: "Decline",
            description: "Allow the role to decline consultation requests.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "reschedule",
            label: "Reschedule",
            description: "Allow the role to reschedule consultation requests.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "configure-times",
            label: "Configure Times",
            description: "Allow the role to manage consultation time slots.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
        ],
      },
    ],
  },
  {
    label: "Billing",
    features: [
      {
        key: "payment",
        label: "Payment",
        description: "Review client payments and manage available payment methods.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
      },
    ],
  },
  {
    label: "Work Management",
    features: [
      {
        key: "tasks",
        label: "Task Management",
        description: "Create, assign, and track tasks.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
        actions: [
          {
            key: "create-task",
            label: "Create Task",
            description: "Allow the role to create tasks from task management.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "client-appointments",
            label: "Client Appointments",
            description: "Allow the role to open approved client appointments from Task Management.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "task-limit",
            label: "Task Limit",
            description: "Allow the role to view and update the active task limit from Task Management.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "edit-step",
            label: "Can Edit Tasks To-Do",
            description: "Allow the role to edit task to-do items, add new steps, and update step assignees from Task Management.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "remove-step",
            label: "Remove Step",
            description: "Allow the role to remove task steps.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
        ],
      },
      {
        key: "calendar",
        label: "Calendar",
        description: "Open the shared calendar view.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: true },
      },
      {
        key: "work-update",
        label: "My tasks",
        description: "Review and update task progress.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
        actions: [
          {
            key: "check-steps",
            label: "Can Check Steps",
            description: "Allow the role to mark assigned task steps as completed.",
            defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
          },
          {
            key: "approve",
            label: "Can Approve",
            description: "Allow the role to approve submitted task steps that are pending review.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "history",
            label: "Can View History",
            description: "Allow the role to open task update history and view saved task update logs.",
            defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
          },
          {
            key: "edit",
            label: "Can Edit",
            description: "Allow the role to edit task update details.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "mark-done",
            label: "Can Mark Done",
            description: "Allow the role to mark task updates as done.",
            defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
          },
          {
            key: "decline",
            label: "Can Decline",
            description: "Allow the role to decline task updates.",
            defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
          },
          {
            key: "remarks",
            label: "Can Add Remarks",
            description: "Allow the role to add or edit emergency remarks on task steps in My tasks.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "archive",
            label: "Can Archive",
            description: "Allow the role to archive completed task updates from history.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "restore",
            label: "Can Restore",
            description: "Allow the role to restore archived task updates back into history.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
        ],
      },
    ],
  },
  {
    label: "Communication",
    features: [
      {
        key: "messaging",
        label: "Messaging",
        description: "Open team and client conversations.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: true },
      },
    ],
  },
  {
    label: "Insights",
    features: [
      {
        key: "reports",
        label: "Reports",
        description: "Open reports and summaries.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
      },
    ],
  },
];

export function getRoleKeyFromId(roleId) {
  const normalizedRoleId = Number(roleId);
  if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
    return null;
  }

  return ROLE_KEY_BY_ID[normalizedRoleId] || `role_${normalizedRoleId}`;
}

export function getModuleLabelByKey(moduleKey) {
  const normalizedKey = String(moduleKey || "").trim();
  if (!normalizedKey) {
    return "this page";
  }

  for (const section of FEATURE_SECTIONS) {
    const feature = section.features.find((item) => item.key === normalizedKey);
    if (feature) {
      return feature.label || normalizedKey;
    }
  }

  return humanizePermissionKey(normalizedKey);
}

export function getFeatureDefinition(featureKey) {
  const normalizedKey = String(featureKey || "").trim();
  if (!normalizedKey) {
    return null;
  }

  for (const section of FEATURE_SECTIONS) {
    const feature = section.features.find((item) => item.key === normalizedKey);
    if (feature) {
      return feature;
    }
  }

  return null;
}

export function getFeatureActionDefinition(featureKey, actionKey) {
  const feature = getFeatureDefinition(featureKey);
  if (!feature || !Array.isArray(feature.actions)) {
    return null;
  }

  return feature.actions.find((action) => action.key === String(actionKey || "").trim()) || null;
}

export function getFeatureActionLabel(featureKey, actionKey) {
  const action = getFeatureActionDefinition(featureKey, actionKey);
  if (action?.label) {
    return action.label;
  }

  return humanizePermissionKey(actionKey);
}

function createRolePermissions(defaultAccess = {}, roleKeys = BUILTIN_ROLE_KEYS) {
  return mergeRoleKeys(roleKeys, defaultAccess).reduce((accumulator, roleKey) => {
    accumulator[roleKey] = Boolean(defaultAccess?.[roleKey]);
    return accumulator;
  }, {});
}

function createActionPermissions(actions = [], roleKeys = BUILTIN_ROLE_KEYS) {
  return actions.reduce((accumulator, action) => {
    accumulator[action.key] = createRolePermissions(action?.defaultAccess, roleKeys);
    return accumulator;
  }, {});
}

export function createFeaturePermissions(feature, roleKeys = BUILTIN_ROLE_KEYS) {
  const permissions = createRolePermissions(feature?.defaultAccess, roleKeys);

  if (Array.isArray(feature?.actions) && feature.actions.length > 0) {
    permissions.actions = createActionPermissions(feature.actions, roleKeys);
  }

  return permissions;
}

export function createDefaultPermissions(roleKeys = BUILTIN_ROLE_KEYS) {
  return FEATURE_SECTIONS.reduce((accumulator, section) => {
    section.features.forEach((feature) => {
      accumulator[feature.key] = createFeaturePermissions(feature, roleKeys);
    });
    return accumulator;
  }, {});
}

function resolveStoredFeaturePermissions(storedPermissions, featureKey, roleKeys = BUILTIN_ROLE_KEYS) {
  const directPermissions = storedPermissions?.[featureKey];

  if (featureKey === "certificate" && directPermissions && typeof directPermissions === "object") {
    const storedActions = directPermissions.actions && typeof directPermissions.actions === "object" ? directPermissions.actions : null;
    if (!storedActions) {
      return directPermissions;
    }

    const hasCurrentActionKeys = ["edit", "remove", "remove-auto-send"].some(
      (actionKey) => storedActions[actionKey] && typeof storedActions[actionKey] === "object"
    );
    if (hasCurrentActionKeys) {
      return directPermissions;
    }

    const migratedActions = {};
    if (storedActions.edit && typeof storedActions.edit === "object") {
      migratedActions.edit = storedActions.edit;
    }

    return {
      ...directPermissions,
      actions: migratedActions,
    };
  }

  if (featureKey === "edit-certificate") {
    if (directPermissions && typeof directPermissions === "object") {
      return directPermissions;
    }

    const legacyEditPermissions = storedPermissions?.certificate?.actions?.edit;
    if (legacyEditPermissions && typeof legacyEditPermissions === "object") {
      return legacyEditPermissions;
    }
  }

  // DB may still expose a top-level `my-tasks` row; the app uses feature key `work-update`
  // (Permissions UI label "My tasks") for routes, nav, and gates — same as secretary.
  if (featureKey === "work-update") {
    const legacyMyTasks = storedPermissions?.["my-tasks"];
    if (!legacyMyTasks || typeof legacyMyTasks !== "object") {
      return directPermissions;
    }

    const availableRoleKeys = mergeRoleKeys(roleKeys, legacyMyTasks, directPermissions);
    const base =
      directPermissions && typeof directPermissions === "object"
        ? {
            ...directPermissions,
            actions:
              directPermissions.actions && typeof directPermissions.actions === "object"
                ? Object.fromEntries(
                    Object.entries(directPermissions.actions).map(([actionKey, value]) => [
                      actionKey,
                      value && typeof value === "object" ? { ...value } : value,
                    ])
                  )
                : {},
          }
        : { actions: {} };

    const actionsObj = base.actions && typeof base.actions === "object" ? base.actions : {};
    base.actions = actionsObj;

    for (const roleKey of availableRoleKeys) {
      if (!legacyMyTasks[roleKey]) {
        continue;
      }
      base[roleKey] = true;
      const anyActionForRole = Object.values(actionsObj).some(
        (actionPerm) => actionPerm && typeof actionPerm === "object" && Boolean(actionPerm[roleKey])
      );
      if (!anyActionForRole) {
        const existing = actionsObj["check-steps"] && typeof actionsObj["check-steps"] === "object" ? actionsObj["check-steps"] : {};
        actionsObj["check-steps"] = {
          ...createRolePermissions({}, availableRoleKeys),
          ...existing,
          [roleKey]: true,
        };
      }
    }

    return base;
  }

  return directPermissions;
}

export function mergePermissions(storedPermissions, roleKeys = []) {
  const availableRoleKeys = mergeRoleKeys(roleKeys, collectRoleKeysFromPermissions(storedPermissions));
  const defaults = createDefaultPermissions(availableRoleKeys);

  if (!storedPermissions || typeof storedPermissions !== "object") {
    return defaults;
  }

  return FEATURE_SECTIONS.reduce((accumulator, section) => {
    section.features.forEach((feature) => {
      const storedFeature = resolveStoredFeaturePermissions(storedPermissions, feature.key, availableRoleKeys);
      const mergedFeature = availableRoleKeys.reduce((featureAccumulator, roleKey) => {
        featureAccumulator[roleKey] = Boolean(storedFeature?.[roleKey] ?? defaults[feature.key]?.[roleKey]);
        return featureAccumulator;
      }, {});

      if (Array.isArray(feature.actions) && feature.actions.length > 0) {
        const storedActions = storedFeature?.actions && typeof storedFeature.actions === "object" ? storedFeature.actions : {};
        const hasStoredActions = Object.keys(storedActions).length > 0;
        mergedFeature.actions = feature.actions.reduce((actionAccumulator, action) => {
          const defaultActionPermissions =
            defaults[feature.key]?.actions?.[action.key] || createRolePermissions(action?.defaultAccess, availableRoleKeys);
          const storedActionPermissions =
            storedActions?.[action.key] ||
            (feature.key === "tasks" && storedActions?.["show-actions"] ? storedActions["show-actions"] : null) ||
            (!hasStoredActions && storedFeature && typeof storedFeature === "object" ? storedFeature : null);

          actionAccumulator[action.key] = availableRoleKeys.reduce((permissionAccumulator, roleKey) => {
            permissionAccumulator[roleKey] = Boolean(
              storedActionPermissions?.[roleKey] ?? defaultActionPermissions?.[roleKey]
            );
            return permissionAccumulator;
          }, {});
          return actionAccumulator;
        }, {});

        if (!featureUsesIndependentAccess(feature.key)) {
          const mergedActionValues = Object.values(mergedFeature.actions);
          availableRoleKeys.forEach((roleKey) => {
            mergedFeature[roleKey] = mergedActionValues.some((actionPermission) => Boolean(actionPermission?.[roleKey]));
          });
        }
      }

      accumulator[feature.key] = mergedFeature;
    });
    return accumulator;
  }, {});
}

function countEnabledRoleValues(permissionValue, roleKey) {
  let count = 0;

  if (Boolean(permissionValue?.[roleKey])) {
    count += 1;
  }

  if (permissionValue?.actions && typeof permissionValue.actions === "object") {
    count += Object.values(permissionValue.actions).filter((actionValue) => Boolean(actionValue?.[roleKey])).length;
  }

  return count;
}

export function countEnabledPermissions(permissions, roleKey) {
  return FEATURE_SECTIONS.reduce(
    (count, section) =>
      count +
      section.features.reduce((sectionCount, feature) => sectionCount + countEnabledRoleValues(permissions?.[feature.key], roleKey), 0),
    0
  );
}

export function hasFeatureActionAccess(user, featureKey, actionKey, permissions = null) {
  if (!featureKey || !actionKey) {
    return false;
  }

  const roleId = getUserRole(user);
  if (!Number.isInteger(roleId)) {
    return true;
  }

  if (roleId === ROLE_IDS.ADMIN) {
    return true;
  }

  const roleKey = getRoleKeyFromId(roleId);
  if (!roleKey) {
    return false;
  }

  const mergedPermissions = mergePermissions(permissions ?? null);
  const featurePermissions = mergedPermissions?.[featureKey];
  const actionPermissions = featurePermissions?.actions?.[actionKey];
  if (!actionPermissions || typeof actionPermissions !== "object") {
    return hasModuleAccess(user, featureKey, mergedPermissions);
  }

  return Boolean(actionPermissions[roleKey]);
}

export function hasModuleAccess(user, moduleKey, permissions = null) {
  if (!moduleKey) {
    return true;
  }

  const roleId = getUserRole(user);
  if (!Number.isInteger(roleId)) {
    return true;
  }

  if (roleId === ROLE_IDS.ADMIN) {
    return true;
  }

  const roleKey = getRoleKeyFromId(roleId);
  if (!roleKey) {
    return false;
  }

  const nextPermissions = mergePermissions(permissions ?? null);
  const modulePermissions = nextPermissions?.[moduleKey];

  if (!modulePermissions || typeof modulePermissions !== "object") {
    return false;
  }

  const featureDefinition = getFeatureDefinition(moduleKey);
  if (
    Array.isArray(featureDefinition?.actions) &&
    featureDefinition.actions.length > 0 &&
    !featureUsesIndependentAccess(moduleKey)
  ) {
    const actionPermissions = modulePermissions.actions;
    if (actionPermissions && typeof actionPermissions === "object") {
      return Object.values(actionPermissions).some((actionPermission) => Boolean(actionPermission?.[roleKey]));
    }
  }

  return Boolean(modulePermissions[roleKey]);
}

export function filterNavItemsByAccess(user, navItems, permissions = null) {
  return (navItems || []).reduce((accumulator, item) => {
    if (!item || typeof item !== "object") {
      return accumulator;
    }

    const nextChildren = Array.isArray(item.children)
      ? filterNavItemsByAccess(user, item.children, permissions)
      : [];
    const accessKey = item.accessKey || null;
    const actionKey = item.actionKey || null;
    const canAccessSelf = accessKey
      ? actionKey
        ? hasFeatureActionAccess(user, accessKey, actionKey, permissions)
        : hasModuleAccess(user, accessKey, permissions)
      : true;
    const shouldKeep = canAccessSelf || nextChildren.length > 0;

    if (!shouldKeep) {
      return accumulator;
    }

    accumulator.push({
      ...item,
      ...(Array.isArray(item.children) ? { children: nextChildren } : {}),
    });

    return accumulator;
  }, []);
}
