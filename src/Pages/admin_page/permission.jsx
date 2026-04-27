import { useEffect, useMemo, useState } from "react";
import { RouteLoadingPanel } from "../../components/layout/route_loading_panel";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { fetchRoles, updateRole } from "../../services/api";
import { showErrorToast, showSuccessToast } from "../../utils/feedback";
import {
  FEATURE_SECTIONS,
  getRoleKeyFromId,
  getFeatureDefinition,
  createFeaturePermissions,
  featureUsesIndependentAccess,
  mergePermissions,
} from "../../utils/module_permissions";

const VISIBLE_FEATURE_SECTIONS = FEATURE_SECTIONS;
const ROLE_EDITING_STORAGE_KEY = "monitoring:permission-role-editing-states";
const ROLE_CATALOG_STORAGE_KEY = "monitoring:permission-role-catalog";

const ROLE_DESCRIPTIONS = Object.freeze({
  admin: "Full access across the system.",
  secretary: "Office workflow and scheduling access.",
  accountant: "Task and finance access.",
  client: "Client portal access.",
});

function normalizeRoleLabel(roleKey) {
  if (roleKey === "admin") return "Admin";
  if (roleKey === "secretary") return "Secretary";
  if (roleKey === "accountant") return "Accountant";
  if (roleKey === "client") return "Client";

  if (/^role_\d+$/.test(roleKey)) {
    return `Role ${roleKey.replace("role_", "")}`;
  }

  return String(roleKey || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function getRoleSortId(roleKey, fallbackId = null) {
  const normalizedRoleKey = String(roleKey || "").trim().toLowerCase();
  if (normalizedRoleKey === "admin") return 1;
  if (normalizedRoleKey === "secretary") return 2;
  if (normalizedRoleKey === "accountant") return 3;
  if (normalizedRoleKey === "client") return 4;

  const matchedRoleId = normalizedRoleKey.match(/^role_(\d+)$/);
  if (matchedRoleId) {
    return Number(matchedRoleId[1]);
  }

  const parsedFallbackId = Number(fallbackId);
  return Number.isInteger(parsedFallbackId) && parsedFallbackId > 0 ? parsedFallbackId : -1;
}

function normalizeRoleCatalog(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seen = new Set();

  return rows
    .map((role) => {
      const id = Number(role?.id);
      const roleKey = getRoleKeyFromId(id);
      const label = String(role?.name || "").trim();
      if (!roleKey || !label) {
        return null;
      }

      return {
        id,
        key: roleKey,
        name: label,
        disabled: Boolean(role?.disabled),
        editingLocked: Boolean(role?.editingLocked ?? role?.editing_locked),
      };
    })
    .filter((role) => {
      if (!role || seen.has(role.key)) {
        return false;
      }

      seen.add(role.key);
      return true;
    })
    .sort((left, right) => {
      const sortDifference = getRoleSortId(right.key, right.id) - getRoleSortId(left.key, left.id);
      if (sortDifference !== 0) {
        return sortDifference;
      }

      return String(left.name || "").localeCompare(String(right.name || ""));
    });
}

function normalizeRoleCatalogPatch(changes) {
  if (!changes || typeof changes !== "object") {
    return {};
  }

  const nextChanges = { ...changes };
  if (
    Object.prototype.hasOwnProperty.call(nextChanges, "editingLocked") ||
    Object.prototype.hasOwnProperty.call(nextChanges, "editing_locked")
  ) {
    const nextEditingLocked = Boolean(nextChanges.editingLocked ?? nextChanges.editing_locked);
    nextChanges.editingLocked = nextEditingLocked;
    nextChanges.editing_locked = nextEditingLocked;
  }

  return nextChanges;
}

function readCachedRoleCatalog() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return normalizeRoleCatalog(JSON.parse(window.localStorage.getItem(ROLE_CATALOG_STORAGE_KEY) || "[]"));
  } catch (_) {
    return [];
  }
}

function writeCachedRoleCatalog(roles) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ROLE_CATALOG_STORAGE_KEY, JSON.stringify(normalizeRoleCatalog(roles)));
  } catch (_) {}
}

function collectPermissionRoleKeys(permissions) {
  const roleKeys = new Set(["admin", "secretary", "accountant", "client"]);

  if (!permissions || typeof permissions !== "object") {
    return Array.from(roleKeys);
  }

  Object.values(permissions).forEach((featurePermissions) => {
    if (!featurePermissions || typeof featurePermissions !== "object") {
      return;
    }

    Object.keys(featurePermissions).forEach((key) => {
      if (key && key !== "actions") {
        roleKeys.add(key);
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
        if (key && key !== "actions") {
          roleKeys.add(key);
        }
      });
    });
  });

  return Array.from(roleKeys);
}

function buildRoleColumns(roles, permissions) {
  const columns = [];
  const seen = new Set();

  normalizeRoleCatalog(roles).forEach((role) => {
    const roleKey = getRoleKeyFromId(role?.id);
    if (!roleKey || seen.has(roleKey)) {
      return;
    }

    seen.add(roleKey);
    columns.push({
      id: role?.id,
      key: roleKey,
      label: String(role?.name || "").trim() || normalizeRoleLabel(roleKey),
      description: ROLE_DESCRIPTIONS[roleKey] || "Custom role access.",
      disabled: Boolean(role?.disabled),
      editingLocked: Boolean(role?.editingLocked),
      sortId: getRoleSortId(roleKey, role?.id),
    });
  });

  collectPermissionRoleKeys(permissions).forEach((roleKey) => {
    if (!roleKey || seen.has(roleKey)) {
      return;
    }

    seen.add(roleKey);
    columns.push({
      id: null,
      key: roleKey,
      label: normalizeRoleLabel(roleKey),
      description: ROLE_DESCRIPTIONS[roleKey] || "Custom role access.",
      disabled: false,
      editingLocked: undefined,
      sortId: getRoleSortId(roleKey),
    });
  });

  return columns
    .sort((left, right) => {
      const sortDifference = right.sortId - left.sortId;
      if (sortDifference !== 0) {
        return sortDifference;
      }

      return String(left.label || "").localeCompare(String(right.label || ""));
    })
    .map(({ sortId, ...role }) => role);
}

function createRoleEditingStates(roleColumns) {
  return roleColumns.reduce((states, role) => {
    states[role.key] = role.editingLocked !== true;
    return states;
  }, {});
}

function normalizeRoleEditingStates(storedStates, roleColumns) {
  const defaults = createRoleEditingStates(roleColumns);

  if (!storedStates || typeof storedStates !== "object") {
    return defaults;
  }

  return roleColumns.reduce((states, role) => {
    if (typeof role.editingLocked === "boolean") {
      states[role.key] = !role.editingLocked;
      return states;
    }

    states[role.key] = storedStates[role.key] !== false;
    return states;
  }, defaults);
}

function loadRoleEditingStates(roleColumns) {
  if (typeof window === "undefined") {
    return createRoleEditingStates(roleColumns);
  }

  try {
    const storedValue = window.localStorage.getItem(ROLE_EDITING_STORAGE_KEY);
    if (!storedValue) {
      return createRoleEditingStates(roleColumns);
    }

    return normalizeRoleEditingStates(JSON.parse(storedValue), roleColumns);
  } catch (_) {
    return createRoleEditingStates(roleColumns);
  }
}

function permissionsHaveUnsavedChanges(currentPermissions, savedPermissions) {
  return (
    JSON.stringify(mergePermissions(currentPermissions ?? null)) !==
    JSON.stringify(mergePermissions(savedPermissions ?? null))
  );
}

function applyBulkRoleAccess(base, roleKey, enabled, roleKeys) {
  const next = { ...base };

  for (const section of FEATURE_SECTIONS) {
    for (const feature of section.features) {
      const defaultFeaturePermissions = createFeaturePermissions(feature, roleKeys);
      const featurePermissions = next[feature.key] || defaultFeaturePermissions;
      const merged = {
        ...featurePermissions,
        [roleKey]: enabled,
      };

      if (Array.isArray(feature.actions) && feature.actions.length > 0) {
        merged.actions = { ...(featurePermissions.actions || {}) };
        for (const action of feature.actions) {
          merged.actions[action.key] = {
            ...(merged.actions[action.key] || defaultFeaturePermissions.actions?.[action.key]),
            [roleKey]: enabled,
          };
        }
      }

      next[feature.key] = merged;
    }
  }

  return next;
}

function countEnabledPermissionsForRole(permissions, roleKey) {
  return VISIBLE_FEATURE_SECTIONS.reduce((count, section) => {
    return (
      count +
      section.features.reduce((sectionCount, feature) => {
        const featurePermissions = permissions?.[feature.key];
        const actionCount = Array.isArray(feature.actions)
          ? feature.actions.filter((action) => Boolean(featurePermissions?.actions?.[action.key]?.[roleKey])).length
          : 0;

        return sectionCount + Number(Boolean(featurePermissions?.[roleKey])) + actionCount;
      }, 0)
    );
  }, 0);
}

export default function PermissionsPage() {
  const { permissions, isLoading, error, savePermissions, refreshPermissions } = useModulePermissions();
  const [draftPermissions, setDraftPermissions] = useState(null);
  const [savingRole, setSavingRole] = useState("");
  const [expandedFeatureDetails, setExpandedFeatureDetails] = useState(() => new Set());
  const [availableRoles, setAvailableRoles] = useState(() => readCachedRoleCatalog());
  const [rolesLoaded, setRolesLoaded] = useState(() => readCachedRoleCatalog().length > 0);
  const [roleEditingStates, setRoleEditingStates] = useState({});

  const roleColumns = useMemo(
    () => buildRoleColumns(availableRoles, draftPermissions || permissions),
    [availableRoles, draftPermissions, permissions]
  );
  const roleKeys = useMemo(() => roleColumns.map((role) => role.key), [roleColumns]);

  useEffect(() => {
    if (!permissions) {
      return;
    }

    setDraftPermissions((current) => current ?? permissions);
  }, [permissions]);

  useEffect(() => {
    let isMounted = true;

    const loadRoles = async () => {
      try {
        const response = await fetchRoles({
          params: {
            include_disabled: 1,
          },
        });

        if (!isMounted) {
          return;
        }

        const nextRoles = normalizeRoleCatalog(response?.data?.roles);
        if (nextRoles.length > 0) {
          setAvailableRoles(nextRoles);
        }
      } catch (_) {
        if (!isMounted) {
          return;
        }
      } finally {
        if (isMounted) {
          setRolesLoaded(true);
        }
      }
    };

    void loadRoles();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (availableRoles.length === 0) {
      return;
    }

    writeCachedRoleCatalog(availableRoles);
  }, [availableRoles]);

  useEffect(() => {
    if (roleColumns.length === 0) {
      return;
    }

    setRoleEditingStates((current) => {
      if (current && Object.keys(current).length > 0) {
        return normalizeRoleEditingStates(current, roleColumns);
      }

      return loadRoleEditingStates(roleColumns);
    });
  }, [roleColumns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        ROLE_EDITING_STORAGE_KEY,
        JSON.stringify(normalizeRoleEditingStates(roleEditingStates, roleColumns))
      );
    } catch (_) {}
  }, [roleColumns, roleEditingStates]);

  const togglePermission = (featureKey, roleKey) => {
    const featureDefinition = getFeatureDefinition(featureKey);
    if (!featureDefinition) {
      return;
    }

    setDraftPermissions((current) => {
      if (!current) {
        return current;
      }

      const defaultFeaturePermissions = createFeaturePermissions(featureDefinition, roleKeys);
      const featurePermissions = current[featureKey] || defaultFeaturePermissions;
      const nextEnabled = !Boolean(featurePermissions[roleKey]);
      const currentActions = featurePermissions.actions || defaultFeaturePermissions.actions || {};
      const nextActions = Array.isArray(featureDefinition.actions) && featureDefinition.actions.length > 0
        ? Object.entries(currentActions).reduce((accumulator, [actionKey, actionPermissions]) => {
            accumulator[actionKey] = {
              ...actionPermissions,
              [roleKey]: nextEnabled,
            };
            return accumulator;
          }, {})
        : undefined;

      const nextFeaturePermissions = {
        ...featurePermissions,
        [roleKey]: nextEnabled,
      };

      if (nextActions) {
        nextFeaturePermissions.actions = nextActions;
      }

      return {
        ...current,
        [featureKey]: nextFeaturePermissions,
      };
    });
  };

  const toggleFeatureDetails = (roleKey, featureKey) => {
    const detailKey = `${roleKey}:${featureKey}`;
    setExpandedFeatureDetails((current) => {
      const next = new Set(current);
      if (next.has(detailKey)) {
        next.delete(detailKey);
      } else {
        next.add(detailKey);
      }
      return next;
    });
  };

  const setAllPermissionsForRole = (roleKey, enabled) => {
    setDraftPermissions((current) => {
      if (!current) {
        return current;
      }
      return applyBulkRoleAccess(current, roleKey, enabled, roleKeys);
    });
  };

  const toggleActionPermission = (featureKey, actionKey, roleKey) => {
    const featureDefinition = getFeatureDefinition(featureKey);
    const actionDefinition = featureDefinition?.actions?.find((action) => action.key === actionKey);

    if (!featureDefinition || !actionDefinition) {
      return;
    }

    setDraftPermissions((current) => {
      if (!current) {
        return current;
      }

      const defaultFeaturePermissions = createFeaturePermissions(featureDefinition, roleKeys);
      const featurePermissions = current[featureKey] || defaultFeaturePermissions;
      const actionPermissions = featurePermissions.actions?.[actionKey] || defaultFeaturePermissions.actions?.[actionKey];
      if (!actionPermissions) {
        return current;
      }

      const nextEnabled = !Boolean(actionPermissions[roleKey]);
      const nextActions = {
        ...(featurePermissions.actions || defaultFeaturePermissions.actions || {}),
        [actionKey]: {
          ...actionPermissions,
          [roleKey]: nextEnabled,
        },
      };
      const nextRoleEnabled = featureUsesIndependentAccess(featureKey)
        ? Boolean(featurePermissions[roleKey])
        : Object.values(nextActions).some((value) => Boolean(value?.[roleKey]));

      return {
        ...current,
        [featureKey]: {
          ...featurePermissions,
          [roleKey]: nextRoleEnabled,
          actions: nextActions,
        },
      };
    });
  };

  const updateCachedRole = (roleId, changes) => {
    const normalizedRoleId = Number(roleId);
    if (!Number.isInteger(normalizedRoleId) || normalizedRoleId <= 0) {
      return;
    }

    const normalizedChanges = normalizeRoleCatalogPatch(changes);

    setAvailableRoles((current) =>
      normalizeRoleCatalog(
        current.map((role) =>
          Number(role?.id) === normalizedRoleId
            ? {
                ...role,
                ...normalizedChanges,
              }
            : role
        )
      )
    );
  };

  const handleSavePermissions = async (
    role,
    { showSuccessOnSave = true, successTitle = "" } = {},
    manageSavingState = true
  ) => {
    if (!draftPermissions) {
      return false;
    }

    const roleKey = String(role?.key || "").trim();
    const roleLabel = String(role?.label || "Role").trim() || "Role";
    if (manageSavingState) {
      setSavingRole(roleKey);
    }

    try {
      const savedPermissions = await savePermissions(draftPermissions);
      setDraftPermissions(savedPermissions);
      if (showSuccessOnSave) {
        showSuccessToast({
          title: successTitle || `${roleLabel} permissions saved`,
          duration: 1800,
        });
      }
      return true;
    } catch (saveError) {
      showErrorToast({
        title: saveError?.response?.data?.message || "Unable to save permissions",
        duration: 2200,
      });
      return false;
    } finally {
      if (manageSavingState) {
        setSavingRole("");
      }
    }
  };

  const toggleRoleEditing = async (role) => {
    const roleKey = String(role?.key || "").trim();
    const roleLabel = String(role?.label || "Role").trim() || "Role";
    const roleId = Number(role?.id);
    if (!roleKey) {
      return;
    }

    const isRoleEditingEnabled = roleEditingStates[roleKey] !== false;
    const nextEditingEnabled = !isRoleEditingEnabled;
    const nextEditingLocked = !nextEditingEnabled;

    setSavingRole(roleKey);

    try {
      if (isRoleEditingEnabled && draftPermissions && permissionsHaveUnsavedChanges(draftPermissions, permissions)) {
        const saved = await handleSavePermissions(role, { showSuccessOnSave: false }, false);
        if (!saved) {
          return;
        }
      }

      let finalEditingLocked = nextEditingLocked;
      if (Number.isInteger(roleId) && roleId > 0) {
        const response = await updateRole({
          role_id: roleId,
          editing_locked: nextEditingLocked,
        });
        finalEditingLocked = Boolean(response?.data?.role?.editing_locked ?? nextEditingLocked);
        updateCachedRole(roleId, response?.data?.role || { editing_locked: finalEditingLocked });
      }

      const finalEditingEnabled = !finalEditingLocked;

      setRoleEditingStates((current) => ({
        ...current,
        [roleKey]: finalEditingEnabled,
      }));

      showSuccessToast({
        title: finalEditingEnabled ? `${roleLabel} unlocked` : `${roleLabel} saved and locked`,
        duration: 1800,
      });
    } catch (saveError) {
      showErrorToast({
        title: saveError?.response?.data?.message || "Unable to update edit lock",
        duration: 2200,
      });
    } finally {
      setSavingRole("");
    }
  };

  if (isLoading && !draftPermissions) {
    return <RouteLoadingPanel />;
  }

  if (!rolesLoaded && availableRoles.length === 0) {
    return <RouteLoadingPanel />;
  }

  if (error && !draftPermissions) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {error}
        <button
          type="button"
          onClick={() => {
            void refreshPermissions();
          }}
          className="ml-3 inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentPermissions = draftPermissions || permissions;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Permissions</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Each card controls one role: checked items match what that role can open in the app (including sidebar links).
            Use Enable all on a card to turn on every module for that role, then Save.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {roleColumns.map((role) => {
          const enabledCount = countEnabledPermissionsForRole(currentPermissions, role.key);
          const isRoleEditingEnabled = roleEditingStates[role.key] !== false;
          const isRoleSaving = savingRole === role.key;

          return (
            <section key={role.key} className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{role.label}</h2>
                    <p className="mt-1 text-sm text-slate-500">{role.description}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                      {enabledCount} enabled
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={!isRoleEditingEnabled || isRoleSaving}
                        onClick={() => setAllPermissionsForRole(role.key, true)}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Enable all
                      </button>
                      <button
                        type="button"
                        disabled={!isRoleEditingEnabled || isRoleSaving}
                        onClick={() => setAllPermissionsForRole(role.key, false)}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Clear all
                      </button>
                      <button
                        type="button"
                        disabled={isRoleSaving}
                        onClick={() => {
                          void toggleRoleEditing(role);
                        }}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isRoleEditingEnabled
                            ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {isRoleSaving ? "Saving..." : isRoleEditingEnabled ? "Lock edits" : "Unlock edits"}
                      </button>
                      <button
                        type="button"
                        disabled={!isRoleEditingEnabled || isRoleSaving}
                        onClick={() => {
                          void handleSavePermissions(role);
                        }}
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {isRoleSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div 
                className="grid items-start gap-6 p-5"
                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
              >
                {VISIBLE_FEATURE_SECTIONS.map((section) => (
                  <div key={section.label} className="min-h-0 min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{section.label}</div>

                    <div className="mt-3 space-y-2">
                      {section.features.map((feature) => {
                        const checked = Boolean(currentPermissions?.[feature.key]?.[role.key]);
                        const hasActions = Array.isArray(feature.actions) && feature.actions.length > 0;
                        const detailKey = `${role.key}:${feature.key}`;
                        const isExpanded = expandedFeatureDetails.has(detailKey);

                        return (
                          <div
                            key={feature.key}
                            className="rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50"
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!isRoleEditingEnabled || isRoleSaving}
                                onChange={() => togglePermission(feature.key, role.key)}
                                className={`mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                  !isRoleEditingEnabled || isRoleSaving ? "cursor-not-allowed opacity-60" : ""
                                }`}
                              />

                              <div className="min-h-0 min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  {hasActions ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleFeatureDetails(role.key, feature.key)}
                                      aria-expanded={isExpanded}
                                      aria-controls={`${detailKey}-actions`}
                                      className="min-w-0 text-left"
                                    >
                                      <span className="block text-sm font-medium text-slate-900">{feature.label}</span>
                                      <span className="mt-0.5 block text-xs text-slate-500">{feature.description}</span>
                                    </button>
                                  ) : (
                                    <div className="min-w-0 text-left">
                                      <span className="block text-sm font-medium text-slate-900">{feature.label}</span>
                                      <span className="mt-0.5 block text-xs text-slate-500">{feature.description}</span>
                                    </div>
                                  )}

                                  {hasActions ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleFeatureDetails(role.key, feature.key)}
                                      className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                                    >
                                      {isExpanded ? "Hide actions" : "Show actions"}
                                    </button>
                                  ) : null}
                                </div>

                                {hasActions && isExpanded ? (
                                  <div
                                    id={`${detailKey}-actions`}
                                    className="mt-3 max-h-[min(60vh,24rem)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg border border-dashed border-slate-200 bg-white p-3 pr-2 [-webkit-overflow-scrolling:touch]"
                                  >
                                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                      {feature.label} Actions
                                    </div>

                                    <div className="mt-3 space-y-2">
                                      {feature.actions.map((action) => {
                                        const actionChecked = Boolean(currentPermissions?.[feature.key]?.actions?.[action.key]?.[role.key]);

                                        return (
                                          <label
                                            key={action.key}
                                            className={`flex items-start gap-3 rounded-md border border-slate-100 px-3 py-2 transition-colors ${
                                              isRoleEditingEnabled ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-70"
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={actionChecked}
                                              disabled={!isRoleEditingEnabled || isRoleSaving}
                                              onChange={() => toggleActionPermission(feature.key, action.key, role.key)}
                                              className={`mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                                !isRoleEditingEnabled || isRoleSaving ? "cursor-not-allowed opacity-60" : ""
                                              }`}
                                            />

                                            <span className="min-w-0">
                                              <span className="block text-sm font-medium text-slate-900">{action.label}</span>
                                              <span className="mt-0.5 block text-xs text-slate-500">{action.description}</span>
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>

                                    <p className="mt-2 text-[11px] leading-5 text-slate-500">
                                      Turning on an action also enables access to {feature.label} for this role.
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Click Save on a card to store the changes for all sessions.
      </p>
    </div>
  );
}
