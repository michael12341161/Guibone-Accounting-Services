import React, { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { DataTable } from "../../components/UI/table";
import { createRole, fetchRoles, fetchSpecializationTypes, updateRole } from "../../services/api";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

const PERMISSION_ROLE_CATALOG_STORAGE_KEY = "monitoring:permission-role-catalog";

function normalizeRoleName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSelectValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "";
}

function normalizeSelectionIds(value) {
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

function isAdminRole(value) {
  const normalized = normalizeRoleName(value).toLowerCase();
  return normalized === "admin" || normalized === "administrator";
}

function createInitialForm() {
  return {
    roleId: "",
    roleName: "",
    disabled: false,
    specializationTypeIds: [],
  };
}

function writePermissionRoleCatalog(roles) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      PERMISSION_ROLE_CATALOG_STORAGE_KEY,
      JSON.stringify(Array.isArray(roles) ? roles : [])
    );
  } catch (_) {}
}

export default function NewRole() {
  const [roles, setRoles] = useState([]);
  const [specializationTypes, setSpecializationTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [specializationLoading, setSpecializationLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [form, setForm] = useState(createInitialForm);
  const [fieldError, setFieldError] = useState("");
  const [search, setSearch] = useState("");

  useErrorToast(error);

  const loadRoles = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const response = await fetchRoles({
        params: {
          include_disabled: 1,
        },
      });
      const nextRoles = Array.isArray(response?.data?.roles) ? response.data.roles : [];
      writePermissionRoleCatalog(nextRoles);
      setRoles(nextRoles.filter((role) => !isAdminRole(role?.name)));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load roles.");
      if (!silent) {
        setRoles([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadSpecializationTypes = async () => {
    try {
      setSpecializationLoading(true);
      const response = await fetchSpecializationTypes({
        params: {
          include_disabled: 0,
        },
      });
      const nextSpecializations = Array.isArray(response?.data?.specialization_types)
        ? response.data.specialization_types.filter((specialization) => !specialization?.disabled)
        : [];
      setSpecializationTypes(nextSpecializations);
    } catch (requestError) {
      setSpecializationTypes([]);
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load specializations.");
    } finally {
      setSpecializationLoading(false);
    }
  };

  useEffect(() => {
    loadRoles({ silent: false });
    loadSpecializationTypes();
  }, []);

  const roleRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();

    return (Array.isArray(roles) ? roles : [])
      .map((role) => {
        const specializationNames = Array.isArray(role?.specialization_type_names)
          ? role.specialization_type_names.map((value) => String(value || "").trim()).filter(Boolean)
          : [];

        return {
          id: String(role?.id ?? "").trim() || String(role?.name || "").trim(),
          roleId: String(role?.id ?? "").trim(),
          name: normalizeRoleName(role?.name),
          disabled: Boolean(role?.disabled),
          specializationIds: normalizeSelectionIds(role?.specialization_type_ids),
          specializationNames,
        };
      })
      .filter((role) => {
        if (!query) return true;
        return `${role.name} ${role.disabled ? "disabled" : "active"} ${role.specializationNames.join(" ")}`
          .toLowerCase()
          .includes(query);
      });
  }, [roles, search]);

  const selectedRoleSpecializationIds = useMemo(
    () => normalizeSelectionIds(form.specializationTypeIds),
    [form.specializationTypeIds]
  );
  const availableSpecializationIds = useMemo(
    () =>
      specializationTypes
        .map((specialization) => normalizeSelectValue(specialization?.id))
        .filter(Boolean),
    [specializationTypes]
  );
  const allSpecializationsSelected =
    availableSpecializationIds.length > 0 && selectedRoleSpecializationIds.length === availableSpecializationIds.length;
  const noSpecializationsSelected = selectedRoleSpecializationIds.length === 0;

  const validateForm = () => {
    const normalizedName = normalizeRoleName(form.roleName);
    if (!normalizedName) {
      return "Role name is required.";
    }

    if (normalizedName.length > 100) {
      return "Role name must be 100 characters or fewer.";
    }

    const duplicate = roleRows.some((role) => {
      if (String(role.roleId) === String(form.roleId || "")) {
        return false;
      }
      return String(role.name || "").trim().toLowerCase() === normalizedName.toLowerCase();
    });

    if (duplicate) {
      return "Another role already uses that name.";
    }

    return "";
  };

  const openCreateModal = () => {
    setModalMode("create");
    setForm(createInitialForm());
    setFieldError("");
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setModalMode("edit");
    setForm({
      roleId: String(role?.roleId || ""),
      roleName: String(role?.name || ""),
      disabled: Boolean(role?.disabled),
      specializationTypeIds: normalizeSelectionIds(role?.specializationIds),
    });
    setFieldError("");
    setModalOpen(true);
  };

  const closeModal = (force = false) => {
    if (submitting && !force) return;
    setModalOpen(false);
    setFieldError("");
    setForm(createInitialForm());
  };

  const handleRoleSpecializationToggle = (specializationId) => {
    const normalizedId = normalizeSelectValue(specializationId);
    if (!normalizedId) {
      return;
    }

    setForm((current) => {
      const currentIds = new Set(normalizeSelectionIds(current.specializationTypeIds));
      if (currentIds.has(normalizedId)) {
        currentIds.delete(normalizedId);
      } else {
        currentIds.add(normalizedId);
      }

      return {
        ...current,
        specializationTypeIds: Array.from(currentIds),
      };
    });
  };

  const handleSelectAllSpecializations = (checked) => {
    setForm((current) => ({
      ...current,
      specializationTypeIds: checked ? availableSpecializationIds : [],
    }));
  };

  const handleClearRoleSpecializations = () => {
    setForm((current) => ({
      ...current,
      specializationTypeIds: [],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    setFieldError(validationMessage);
    if (validationMessage) {
      return;
    }

    const payload = {
      name: normalizeRoleName(form.roleName),
      disabled: Boolean(form.disabled),
      specialization_type_ids: selectedRoleSpecializationIds,
    };

    try {
      setSubmitting(true);
      setError("");

      if (modalMode === "edit" && form.roleId) {
        await updateRole({
          role_id: Number(form.roleId),
          ...payload,
        });
        showSuccessToast("Role updated successfully.");
      } else {
        await createRole(payload);
        showSuccessToast("Role added successfully.");
      }

      closeModal(true);
      await loadRoles({ silent: false });
    } catch (requestError) {
      const nextMessage = requestError?.response?.data?.message || requestError?.message || "Unable to save the role.";
      if ([409, 422].includes(Number(requestError?.response?.status || 0))) {
        setFieldError(nextMessage);
      } else {
        setError(nextMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableToggle = async (role) => {
    try {
      setError("");
      await updateRole({
        role_id: Number(role.roleId),
        name: role.name,
        disabled: !role.disabled,
        specialization_type_ids: normalizeSelectionIds(role.specializationIds),
      });
      showSuccessToast(role.disabled ? "Role enabled successfully." : "Role disabled successfully.");
      await loadRoles({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to update the role.");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Role Name",
      width: "24%",
      render: (value) => <div className="min-w-[180px] font-medium text-slate-900">{value}</div>,
    },
    {
      key: "specializationNames",
      header: "Specializations",
      render: (value) =>
        Array.isArray(value) && value.length > 0 ? (
          <div className="min-w-[240px] text-sm text-slate-700">{value.join(", ")}</div>
        ) : (
          <div className="min-w-[160px] text-sm text-slate-400">None</div>
        ),
    },
    {
      key: "disabled",
      header: "Status",
      width: "16%",
      render: (value) => (
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            value
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {value ? "Disabled" : "Active"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "18%",
      align: "center",
      render: (_, row) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton
            size="sm"
            variant="secondary"
            title="Edit role"
            aria-label={`Edit ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              openEditModal(row);
            }}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
          </IconButton>
          <IconButton
            size="sm"
            variant={row.disabled ? "success" : "danger"}
            title={row.disabled ? "Enable role" : "Disable role"}
            aria-label={row.disabled ? `Enable ${row.name}` : `Disable ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              handleDisableToggle(row);
            }}
          >
            {row.disabled ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
              </svg>
            )}
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>New Role</CardTitle>
            <CardDescription>Manage system roles and choose which specializations each role can use.</CardDescription>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search roles..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {roleRows.length} role{roleRows.length === 1 ? "" : "s"} found
              </div>
              <Button type="button" onClick={openCreateModal}>
                Add Role
              </Button>
            </div>

            <DataTable
              columns={columns}
              rows={roleRows}
              keyField="id"
              loading={loading}
              emptyMessage="No roles found."
              stickyHeader
              maxHeight="620px"
            />
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === "edit" ? "Edit Role" : "Add Role"}
        description="Create or update a role and choose the specializations it can use."
        size="lg"
        closeOnOverlayClick={!submitting}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="role-form" disabled={submitting}>
              {submitting ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create Role"}
            </Button>
          </>
        }
      >
        <form id="role-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="role-name" className="mb-1 block text-xs font-medium text-slate-600">
              Role Name
            </label>
            <input
              id="role-name"
              type="text"
              value={form.roleName}
              onChange={(event) => {
                setForm((current) => ({ ...current, roleName: event.target.value }));
                if (fieldError) {
                  setFieldError("");
                }
              }}
              maxLength={100}
              disabled={submitting}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
              placeholder="Enter role name"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-xs font-medium text-slate-600">Allowed Specializations</label>
              <div className="text-xs text-slate-500">
                {selectedRoleSpecializationIds.length} selected
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={allSpecializationsSelected}
                    onChange={(event) => handleSelectAllSpecializations(event.target.checked)}
                    disabled={submitting || specializationLoading || availableSpecializationIds.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Check all</span>
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={noSpecializationsSelected}
                    onChange={handleClearRoleSpecializations}
                    disabled={submitting || specializationLoading}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>None</span>
                </label>
              </div>

              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {specializationLoading ? (
                  <div className="text-sm text-slate-500">Loading specializations...</div>
                ) : specializationTypes.length === 0 ? (
                  <div className="text-sm text-slate-500">No active specializations available.</div>
                ) : (
                  specializationTypes.map((specialization) => {
                    const specializationId = normalizeSelectValue(specialization?.id);
                    const checked = selectedRoleSpecializationIds.includes(specializationId);

                    return (
                      <label key={specialization.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleRoleSpecializationToggle(specializationId)}
                          disabled={submitting}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{specialization.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {fieldError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{fieldError}</div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
