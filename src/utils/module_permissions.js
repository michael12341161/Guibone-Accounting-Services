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

export const FEATURE_SECTIONS = [
  {
    label: "Core Access",
    features: [
      {
        key: "dashboard",
        label: "Dashboard Access",
        description: "Open the role home page.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
      },
      {
        key: "user-management",
        label: "User Management",
        description: "View and manage system users.",
        defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
        actions: [
          {
            key: "view",
            label: "Can View",
            description: "Allow the role to open and review user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "edit",
            label: "Can Edit",
            description: "Allow the role to update existing user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
          },
          {
            key: "add-user",
            label: "Add User",
            description: "Allow the role to create new user accounts.",
            defaultAccess: { admin: true, secretary: false, accountant: false, client: false },
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
    label: "Client Work",
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
        ],
      },
      {
        key: "new-client-management",
        label: "New Client Management",
        description: "Handle newly created client records.",
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
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
        actions: [
          {
            key: "approve",
            label: "Approve",
            description: "Allow the role to approve consultation requests.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "decline",
            label: "Decline",
            description: "Allow the role to decline consultation requests.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
          },
          {
            key: "reschedule",
            label: "Reschedule",
            description: "Allow the role to reschedule consultation requests.",
            defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
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
    label: "Work Management",
    features: [
      {
        key: "tasks",
        label: "Task Management",
        description: "Create, assign, and track tasks.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
      },
      {
        key: "calendar",
        label: "Calendar",
        description: "Open the shared calendar view.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
      },
      {
        key: "work-update",
        label: "Task Update",
        description: "Review and update task progress.",
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
      },
      {
        key: "my-tasks",
        label: "My Tasks",
        description: "Review accountant task assignments.",
        defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
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
        defaultAccess: { admin: true, secretary: true, accountant: false, client: false },
      },
    ],
  },
  {
    label: "Finance",
    features: [
      {
        key: "invoices",
        label: "Invoices",
        description: "View and manage invoices.",
        defaultAccess: { admin: true, secretary: false, accountant: true, client: false },
      },
      {
        key: "reports",
        label: "Reports",
        description: "Open reports and summaries.",
        defaultAccess: { admin: true, secretary: true, accountant: true, client: false },
      },
    ],
  },
  {
    label: "Client Area",
    features: [
      {
        key: "client-account",
        label: "Can Access Account",
        description: "Allow the client to access their account portal.",
        defaultAccess: { admin: false, secretary: false, accountant: false, client: true },
      },
    ],
  },
];

export function getRoleKeyFromId(roleId) {
  return ROLE_KEY_BY_ID[Number(roleId)] || null;
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

  return normalizedKey
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function createRolePermissions(defaultAccess = {}) {
  return {
    admin: Boolean(defaultAccess?.admin),
    secretary: Boolean(defaultAccess?.secretary),
    accountant: Boolean(defaultAccess?.accountant),
    client: Boolean(defaultAccess?.client),
  };
}

function createActionPermissions(actions = []) {
  return actions.reduce((accumulator, action) => {
    accumulator[action.key] = createRolePermissions(action?.defaultAccess);
    return accumulator;
  }, {});
}

export function createFeaturePermissions(feature) {
  const permissions = createRolePermissions(feature?.defaultAccess);

  if (Array.isArray(feature?.actions) && feature.actions.length > 0) {
    permissions.actions = createActionPermissions(feature.actions);
  }

  return permissions;
}

export function createDefaultPermissions() {
  return FEATURE_SECTIONS.reduce((accumulator, section) => {
    section.features.forEach((feature) => {
      accumulator[feature.key] = createFeaturePermissions(feature);
    });
    return accumulator;
  }, {});
}

export function mergePermissions(storedPermissions) {
  const defaults = createDefaultPermissions();

  if (!storedPermissions || typeof storedPermissions !== "object") {
    return defaults;
  }

  return FEATURE_SECTIONS.reduce((accumulator, section) => {
    section.features.forEach((feature) => {
      const storedFeature = storedPermissions[feature.key];
      const mergedFeature = {
        admin: Boolean(storedFeature?.admin ?? defaults[feature.key].admin),
        secretary: Boolean(storedFeature?.secretary ?? defaults[feature.key].secretary),
        accountant: Boolean(storedFeature?.accountant ?? defaults[feature.key].accountant),
        client: Boolean(storedFeature?.client ?? defaults[feature.key].client),
      };

      if (Array.isArray(feature.actions) && feature.actions.length > 0) {
        const storedActions = storedFeature?.actions && typeof storedFeature.actions === "object" ? storedFeature.actions : {};
        mergedFeature.actions = feature.actions.reduce((actionAccumulator, action) => {
          const defaultActionPermissions = defaults[feature.key]?.actions?.[action.key] || createRolePermissions(action?.defaultAccess);
          const storedActionPermissions = storedActions?.[action.key];

          actionAccumulator[action.key] = {
            admin: Boolean(storedActionPermissions?.admin ?? defaultActionPermissions.admin),
            secretary: Boolean(storedActionPermissions?.secretary ?? defaultActionPermissions.secretary),
            accountant: Boolean(storedActionPermissions?.accountant ?? defaultActionPermissions.accountant),
            client: Boolean(storedActionPermissions?.client ?? defaultActionPermissions.client),
          };
          return actionAccumulator;
        }, {});

        const mergedActionValues = Object.values(mergedFeature.actions);
        mergedFeature.admin = mergedActionValues.some((actionPermission) => Boolean(actionPermission?.admin));
        mergedFeature.secretary = mergedActionValues.some((actionPermission) => Boolean(actionPermission?.secretary));
        mergedFeature.accountant = mergedActionValues.some((actionPermission) => Boolean(actionPermission?.accountant));
        mergedFeature.client = mergedActionValues.some((actionPermission) => Boolean(actionPermission?.client));
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

  const featurePermissions = permissions?.[featureKey];
  const actionPermissions = featurePermissions?.actions?.[actionKey];
  if (!actionPermissions || typeof actionPermissions !== "object") {
    return hasModuleAccess(user, featureKey, permissions);
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

  const nextPermissions = permissions;
  const modulePermissions = nextPermissions?.[moduleKey];

  if (!modulePermissions || typeof modulePermissions !== "object") {
    return false;
  }

  const featureDefinition = getFeatureDefinition(moduleKey);
  if (Array.isArray(featureDefinition?.actions) && featureDefinition.actions.length > 0) {
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
    const canAccessSelf = accessKey ? hasModuleAccess(user, accessKey, permissions) : true;
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
