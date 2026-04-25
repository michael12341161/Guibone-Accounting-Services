import React, { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { DataTable } from "../../components/UI/table";
import { createServiceType, fetchAvailableServices, updateServiceType } from "../../services/api";
import { buildServiceBundleCollection, cloneBundleSteps } from "../../utils/service_bundles";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

function normalizeServiceName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createEmptyStep() {
  return { assignee: "accountant", text: "" };
}

function createInitialForm() {
  return {
    serviceId: "",
    serviceName: "",
    disabled: false,
    bundleSteps: [createEmptyStep()],
  };
}

function normalizeBundleSteps(steps) {
  return cloneBundleSteps(steps).filter((step) => String(step?.text || "").trim());
}

export default function NewServices() {
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

  const loadServices = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const response = await fetchAvailableServices("", {
        params: {
          include_disabled: 1,
        },
      });
      const nextServices = Array.isArray(response?.data?.services) ? response.data.services : [];
      setServices(nextServices);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load services.");
      if (!silent) {
        setServices([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadServices({ silent: false });
  }, []);

  const serviceRows = useMemo(() => {
    const bundlesById = new Map(buildServiceBundleCollection(services).map((bundle) => [String(bundle.id), bundle]));
    const query = String(search || "").trim().toLowerCase();

    return (Array.isArray(services) ? services : [])
      .map((service) => {
        const serviceId = String(service?.id ?? "").trim();
        const bundle = bundlesById.get(serviceId);
        return {
          id: serviceId || String(service?.name || "").trim(),
          serviceId,
          name: normalizeServiceName(service?.name),
          disabled: Boolean(service?.disabled),
          bundleSteps: Array.isArray(bundle?.steps) ? bundle.steps : [],
          stepCount: Array.isArray(bundle?.steps) ? bundle.steps.length : 0,
        };
      })
      .filter((service) => {
        if (!query) return true;
        return `${service.name} ${service.disabled ? "disabled" : "active"} ${service.stepCount}`.toLowerCase().includes(query);
      });
  }, [search, services]);

  const validateForm = () => {
    const normalizedName = normalizeServiceName(form.serviceName);
    if (!normalizedName) {
      return "Service name is required.";
    }

    if (normalizedName.length > 150) {
      return "Service name must be 150 characters or fewer.";
    }

    const duplicate = serviceRows.some((service) => {
      if (String(service.serviceId) === String(form.serviceId || "")) {
        return false;
      }
      return String(service.name || "").trim().toLowerCase() === normalizedName.toLowerCase();
    });
    if (duplicate) {
      return "Another service already uses that name.";
    }

    const steps = normalizeBundleSteps(form.bundleSteps);
    if (steps.length === 0) {
      return "Add at least one bundle task step.";
    }

    return "";
  };

  const openCreateModal = () => {
    setModalMode("create");
    setForm(createInitialForm());
    setFieldError("");
    setModalOpen(true);
  };

  const openEditModal = (service) => {
    setModalMode("edit");
    setForm({
      serviceId: String(service?.serviceId || ""),
      serviceName: String(service?.name || ""),
      disabled: Boolean(service?.disabled),
      bundleSteps: Array.isArray(service?.bundleSteps) && service.bundleSteps.length
        ? cloneBundleSteps(service.bundleSteps)
        : [createEmptyStep()],
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

  const updateStep = (index, changes) => {
    setForm((current) => {
      const nextSteps = [...current.bundleSteps];
      if (!nextSteps[index]) return current;
      nextSteps[index] = {
        ...nextSteps[index],
        ...changes,
      };
      return {
        ...current,
        bundleSteps: nextSteps,
      };
    });
    if (fieldError) {
      setFieldError("");
    }
  };

  const addStep = () => {
    setForm((current) => ({
      ...current,
      bundleSteps: [...current.bundleSteps, createEmptyStep()],
    }));
    if (fieldError) {
      setFieldError("");
    }
  };

  const removeStep = (index) => {
    setForm((current) => {
      const nextSteps = current.bundleSteps.filter((_, stepIndex) => stepIndex !== index);
      return {
        ...current,
        bundleSteps: nextSteps.length ? nextSteps : [createEmptyStep()],
      };
    });
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
      name: normalizeServiceName(form.serviceName),
      bundle_steps: normalizeBundleSteps(form.bundleSteps),
      disabled: Boolean(form.disabled),
    };

    try {
      setSubmitting(true);
      setError("");

      if (modalMode === "edit" && form.serviceId) {
        await updateServiceType({
          service_id: Number(form.serviceId),
          ...payload,
        });
        showSuccessToast("Service updated successfully.");
      } else {
        await createServiceType(payload);
        showSuccessToast("Service added successfully.");
      }

      closeModal(true);
      await loadServices({ silent: false });
    } catch (requestError) {
      const nextMessage =
        requestError?.response?.data?.message || requestError?.message || "Unable to save the service.";
      if ([409, 422].includes(Number(requestError?.response?.status || 0))) {
        setFieldError(nextMessage);
      } else {
        setError(nextMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableToggle = async (service) => {
    try {
      setError("");
      await updateServiceType({
        service_id: Number(service.serviceId),
        name: service.name,
        disabled: !service.disabled,
        bundle_steps: normalizeBundleSteps(service.bundleSteps),
      });
      showSuccessToast(service.disabled ? "Service enabled successfully." : "Service disabled successfully.");
      await loadServices({ silent: true });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to update the service.");
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        render: (value, row) => (
          <div className="min-w-[220px]">
            <div className="font-medium text-slate-900">{value}</div>
            <div className="mt-1 text-xs text-slate-500">
              {row.stepCount} bundle task{row.stepCount === 1 ? "" : "s"}
            </div>
          </div>
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
        key: "stepCount",
        header: "Bundle Tasks",
        width: "16%",
        align: "center",
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
              title="Edit service"
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
              title={row.disabled ? "Enable service" : "Disable service"}
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
    [serviceRows]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>New Services</CardTitle>
            <CardDescription>Manage service names, bundle tasks, and service availability from one table.</CardDescription>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search services..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {serviceRows.length} service{serviceRows.length === 1 ? "" : "s"} found
              </div>
              <Button type="button" onClick={openCreateModal}>
                Add Service
              </Button>
            </div>

            <DataTable
              columns={columns}
              rows={serviceRows}
              keyField="id"
              loading={loading}
              emptyMessage="No services found."
              stickyHeader
              maxHeight="620px"
            />
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === "edit" ? "Edit Service" : "Add Service"}
        description="Create or update a service together with its bundle tasks."
        size="lg"
        closeOnOverlayClick={!submitting}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="service-form" disabled={submitting}>
              {submitting ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create Service"}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="service-name" className="mb-1 block text-xs font-medium text-slate-600">
              Service Name
            </label>
            <input
              id="service-name"
              type="text"
              value={form.serviceName}
              onChange={(event) => {
                setForm((current) => ({ ...current, serviceName: event.target.value }));
                if (fieldError) {
                  setFieldError("");
                }
              }}
              maxLength={150}
              disabled={submitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
              placeholder="Enter service name"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Bundle Tasks</div>
                <div className="text-xs text-slate-500">These steps will be applied when this service is used to create a task.</div>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addStep} disabled={submitting}>
                Add Step
              </Button>
            </div>

            <div className="space-y-3">
              {form.bundleSteps.map((step, index) => (
                <div key={`step-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {index + 1}</div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={submitting}
                      onClick={() => removeStep(index)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[180px,1fr]">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Assignee</label>
                      <select
                        value={step.assignee}
                        onChange={(event) => updateStep(index, { assignee: event.target.value })}
                        disabled={submitting}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
                      >
                        <option value="accountant">Accountant</option>
                        <option value="secretary">Secretary</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Task Step</label>
                      <textarea
                        rows={2}
                        value={step.text}
                        onChange={(event) => updateStep(index, { text: event.target.value })}
                        disabled={submitting}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
                        placeholder="Describe the bundle task step"
                      />
                    </div>
                  </div>
                </div>
              ))}
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
