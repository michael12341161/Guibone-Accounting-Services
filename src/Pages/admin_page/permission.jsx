import { useEffect, useState } from "react";
import { RouteLoadingPanel } from "../../components/layout/route_loading_panel";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { showErrorToast, showSuccessToast } from "../../utils/feedback";
import {
  FEATURE_SECTIONS,
  getFeatureDefinition,
  createFeaturePermissions,
  featureUsesIndependentAccess,
} from "../../utils/module_permissions";

const ROLE_COLUMNS = [
  { key: "admin", label: "Admin", description: "Full access across the system." },
  { key: "secretary", label: "Secretary", description: "Office workflow and scheduling access." },
  { key: "accountant", label: "Accountant", description: "Task and finance access." },
  { key: "client", label: "Client", description: "Client portal access." },
];

const HIDDEN_FEATURE_KEYS = new Set(["my-tasks", "invoices"]);

const VISIBLE_FEATURE_SECTIONS = FEATURE_SECTIONS
  .map((section) => ({
    ...section,
    features: section.features.filter((feature) => !HIDDEN_FEATURE_KEYS.has(feature.key)),
  }))
  .filter((section) => section.features.length > 0);
const ROLE_EDITING_STORAGE_KEY = "monitoring:permission-role-editing-states";

function createRoleEditingStates() {
  return ROLE_COLUMNS.reduce((states, role) => {
    states[role.key] = true;
    return states;
  }, {});
}

function normalizeRoleEditingStates(storedStates) {
  const defaults = createRoleEditingStates();

  if (!storedStates || typeof storedStates !== "object") {
    return defaults;
  }

  return ROLE_COLUMNS.reduce((states, role) => {
    states[role.key] = storedStates[role.key] !== false;
    return states;
  }, defaults);
}

function loadRoleEditingStates() {
  if (typeof window === "undefined") {
    return createRoleEditingStates();
  }

  try {
    const storedValue = window.localStorage.getItem(ROLE_EDITING_STORAGE_KEY);
    if (!storedValue) {
      return createRoleEditingStates();
    }

    return normalizeRoleEditingStates(JSON.parse(storedValue));
  } catch (_) {
    return createRoleEditingStates();
  }
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
  const [roleEditingStates, setRoleEditingStates] = useState(loadRoleEditingStates);

  useEffect(() => {
    if (!permissions) {
      return;
    }

    setDraftPermissions((current) => current ?? permissions);
  }, [permissions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        ROLE_EDITING_STORAGE_KEY,
        JSON.stringify(normalizeRoleEditingStates(roleEditingStates))
      );
    } catch (_) {}
  }, [roleEditingStates]);

  const togglePermission = (featureKey, roleKey) => {
    const featureDefinition = getFeatureDefinition(featureKey);
    if (!featureDefinition) {
      return;
    }

    setDraftPermissions((current) => {
      if (!current) {
        return current;
      }

      const defaultFeaturePermissions = createFeaturePermissions(featureDefinition);
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

  const toggleRoleEditing = (roleKey) => {
    setRoleEditingStates((current) => ({
      ...current,
      [roleKey]: !current[roleKey],
    }));
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

      const defaultFeaturePermissions = createFeaturePermissions(featureDefinition);
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

  const handleSavePermissions = async (roleLabel) => {
    if (!draftPermissions) {
      return;
    }

    setSavingRole(roleLabel);

    try {
      const savedPermissions = await savePermissions(draftPermissions);
      setDraftPermissions(savedPermissions);
      showSuccessToast({
        title: `${roleLabel} permissions saved`,
        duration: 1800,
      });
    } catch (saveError) {
      showErrorToast({
        title: saveError?.response?.data?.message || "Unable to save permissions",
        duration: 2200,
      });
    } finally {
      setSavingRole("");
    }
  };

  if (isLoading && !draftPermissions) {
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
            Use the cards to allow or restrict access for Admin, Secretary, Accountant, and Client.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {ROLE_COLUMNS.map((role) => {
          const enabledCount = countEnabledPermissionsForRole(currentPermissions, role.key);
          const isRoleEditingEnabled = roleEditingStates[role.key] !== false;

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
                        onClick={() => toggleRoleEditing(role.key)}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isRoleEditingEnabled
                            ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {isRoleEditingEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={savingRole === role.label}
                        onClick={() => handleSavePermissions(role.label)}
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {savingRole === role.label ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="max-h-[72vh] space-y-5 overflow-y-auto p-5">
                {VISIBLE_FEATURE_SECTIONS.map((section) => (
                  <div key={section.label}>
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
                                disabled={!isRoleEditingEnabled}
                                onChange={() => togglePermission(feature.key, role.key)}
                                className={`mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                  !isRoleEditingEnabled ? "cursor-not-allowed opacity-60" : ""
                                }`}
                              />

                              <div className="min-w-0 flex-1">
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
                                    className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-3"
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
                                              disabled={!isRoleEditingEnabled}
                                              onChange={() => toggleActionPermission(feature.key, action.key, role.key)}
                                              className={`mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                                                !isRoleEditingEnabled ? "cursor-not-allowed opacity-60" : ""
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