import React, { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { DataTable } from "../../components/UI/table";
import {
  createSpecializationType,
  fetchSpecializationTypes,
  updateSpecializationType,
} from "../../services/api";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

function normalizeSpecializationName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createInitialForm() {
  return {
    specializationId: "",
    specializationName: "",
    disabled: false,
    serviceIds: [],
  };
}

export default function NewSpecialization() {
  const [specializations, setSpecializations] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [form, setForm] = useState(createInitialForm);
  const [fieldError, setFieldError] = useState("");
  const [search, setSearch] = useState("");

  useErrorToast(error);

  const loadSpecializations = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const response = await fetchSpecializationTypes({
        params: {
          include_disabled: 1,
        },
      });

      setSpecializations(Array.isArray(response?.data?.specialization_types) ? response.data.specialization_types : []);
      setServices(Array.isArray(response?.data?.services) ? response.data.services : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load specializations.");
      if (!silent) {
        setSpecializations([]);
        setServices([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadSpecializations({ silent: false });
  }, []);

  const serviceNameById = useMemo(() => {
    const entries = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      const serviceId = Number(service?.id);
      const serviceName = String(service?.name || "").trim();
      if (Number.isFinite(serviceId) && serviceId > 0 && serviceName) {
        entries.set(serviceId, serviceName);
      }
    });
    return entries;
  }, [services]);

  const specializationRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();

    return (Array.isArray(specializations) ? specializations : [])
      .map((specialization) => {
        const serviceIds = Array.isArray(specialization?.service_ids)
          ? specialization.service_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
          : [];
        const resolvedServiceNames = serviceIds
          .map((serviceId) => serviceNameById.get(serviceId) || "")
          .filter(Boolean);
        const serviceNames = resolvedServiceNames.length
          ? resolvedServiceNames
          : Array.isArray(specialization?.service_names)
            ? specialization.service_names.map((value) => String(value || "").trim()).filter(Boolean)
            : [];

        return {
          id: String(specialization?.id ?? "").trim() || String(specialization?.name || "").trim(),
          specializationId: String(specialization?.id ?? "").trim(),
          name: normalizeSpecializationName(specialization?.name),
          disabled: Boolean(specialization?.disabled),
          serviceIds,
          serviceNames,
          serviceSummary: serviceNames.length ? serviceNames.join(", ") : "None",
          serviceCount: serviceNames.length,
        };
      })
      .filter((specialization) => {
        if (!query) return true;
        return `${specialization.name} ${specialization.serviceSummary} ${specialization.disabled ? "disabled" : "active"}`
          .toLowerCase()
          .includes(query);
      });
  }, [search, serviceNameById, specializations]);

  const validateForm = () => {
    const normalizedName = normalizeSpecializationName(form.specializationName);
    if (!normalizedName) {
      return "Specialization name is required.";
    }

    if (normalizedName.length > 150) {
      return "Specialization name must be 150 characters or fewer.";
    }

    const duplicate = specializationRows.some((specialization) => {
      if (String(specialization.specializationId) === String(form.specializationId || "")) {
        return false;
      }
      return String(specialization.name || "").trim().toLowerCase() === normalizedName.toLowerCase();
    });
    if (duplicate) {
      return "Another specialization already uses that name.";
    }

    return "";
  };

  const openCreateModal = () => {
    setModalMode("create");
    setForm(createInitialForm());
    setFieldError("");
    setModalOpen(true);
  };

  const openEditModal = (specialization) => {
    setModalMode("edit");
    setForm({
      specializationId: String(specialization?.specializationId || ""),
      specializationName: String(specialization?.name || ""),
      disabled: Boolean(specialization?.disabled),
      serviceIds: Array.isArray(specialization?.serviceIds) ? specialization.serviceIds : [],
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

  const toggleService = (serviceId) => {
    setForm((current) => {
      const currentSet = new Set(current.serviceIds);
      if (currentSet.has(serviceId)) {
        currentSet.delete(serviceId);
      } else {
        currentSet.add(serviceId);
      }

      return {
        ...current,
        serviceIds: Array.from(currentSet).sort((left, right) => left - right),
      };
    });
    if (fieldError) {
      setFieldError("");
    }
  };

  const selectNone = () => {
    setForm((current) => ({
      ...current,
      serviceIds: [],
    }));
    if (fieldError) {
      setFieldError("");
    }
  };

  const selectAllServices = () => {
    setForm((current) => ({
      ...current,
      serviceIds: services
        .map((service) => Number(service?.id))
        .filter((value) => Number.isFinite(value) && value > 0),
    }));
    if (fieldError) {
      setFieldError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    setFieldError(validationMessage);
    if (validationMessage) {
      return;
    }

    const payload = {
      name: normalizeSpecializationName(form.specializationName),
      service_ids: Array.isArray(form.serviceIds) ? form.serviceIds : [],
      disabled: Boolean(form.disabled),
    };

    try {
      setSubmitting(true);
      setError("");

      if (modalMode === "edit" && form.specializationId) {
        await updateSpecializationType({
          specialization_id: Number(form.specializationId),
          ...payload,
        });
        showSuccessToast("Specialization updated successfully.");
      } else {
        await createSpecializationType(payload);
        showSuccessToast("Specialization added successfully.");
      }

      closeModal(true);
      await loadSpecializations({ silent: false });
    } catch (requestError) {
      const nextMessage =
        requestError?.response?.data?.message || requestError?.message || "Unable to save the specialization.";
      if ([409, 422].includes(Number(requestError?.response?.status || 0))) {
        setFieldError(nextMessage);
      } else {
        setError(nextMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableToggle = async (specialization) => {
    try {
      setError("");
      await updateSpecializationType({
        specialization_id: Number(specialization.specializationId),
        name: specialization.name,
        disabled: !specialization.disabled,
        service_ids: specialization.serviceIds,
      });
      showSuccessToast(
        specialization.disabled ? "Specialization enabled successfully." : "Specialization disabled successfully."
      );
      await loadSpecializations({ silent: true });
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message || requestError?.message || "Unable to update the specialization."
      );
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Specialization",
        render: (value, row) => (
          <div className="min-w-[220px]">
            <div className="font-medium text-slate-900">{value}</div>
            <div className="mt-1 text-xs text-slate-500">
              {row.serviceCount === 0 ? "No linked services" : `${row.serviceCount} service${row.serviceCount === 1 ? "" : "s"}`}
            </div>
          </div>
        ),
      },
      {
        key: "serviceSummary",
        header: "Services",
        render: (value) => <div className="min-w-[260px] text-sm text-slate-700">{value}</div>,
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
              title="Edit specialization"
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
              title={row.disabled ? "Enable specialization" : "Disable specialization"}
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
    ],
    []
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>New Specialization</CardTitle>
            <CardDescription>Manage specializations and their linked services using the same table and floating form pattern.</CardDescription>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search specializations..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {specializationRows.length} specialization{specializationRows.length === 1 ? "" : "s"} found
              </div>
              <Button type="button" onClick={openCreateModal}>
                Add Specialization
              </Button>
            </div>

            <DataTable
              columns={columns}
              rows={specializationRows}
              keyField="id"
              loading={loading}
              emptyMessage="No specializations found."
              stickyHeader
              maxHeight="620px"
            />
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === "edit" ? "Edit Specialization" : "Add Specialization"}
        description="Create or update a specialization and choose the services connected to it."
        size="lg"
        closeOnOverlayClick={!submitting}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="specialization-form" disabled={submitting}>
              {submitting ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create Specialization"}
            </Button>
          </>
        }
      >
        <form id="specialization-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="specialization-name" className="mb-1 block text-xs font-medium text-slate-600">
              Specialization Name
            </label>
            <input
              id="specialization-name"
              type="text"
              value={form.specializationName}
              onChange={(event) => {
                setForm((current) => ({ ...current, specializationName: event.target.value }));
                if (fieldError) {
                  setFieldError("");
                }
              }}
              maxLength={150}
              disabled={submitting}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
              placeholder="Enter specialization name"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Associated Services</div>
                <div className="text-xs text-slate-500">Pick one or more services, or choose None if this specialization should stand alone.</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.serviceIds.length === 0}
                    onChange={selectNone}
                    disabled={submitting}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900">None</span>
                    <span className="ml-2 text-xs text-slate-500">Use this when no services should be linked yet.</span>
                  </span>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={services.length > 0 && form.serviceIds.length === services.length}
                    onChange={selectAllServices}
                    disabled={submitting || services.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900">Check All Services</span>
                    <span className="ml-2 text-xs text-slate-500">Select every available service in one click.</span>
                  </span>
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {services.map((service) => {
                  const serviceId = Number(service?.id);
                  const checked = form.serviceIds.includes(serviceId);
                  return (
                    <label
                      key={`service-${serviceId}`}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition ${
                        checked
                          ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleService(serviceId)}
                        disabled={submitting}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium">{service.name}</span>
                    </label>
                  );
                })}
              </div>

              {services.length === 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No services are available yet. You can still save this specialization with the None option.
                </div>
              ) : null}
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
