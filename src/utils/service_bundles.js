function normalizeServiceNameKey(value) {
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (!compact) return "";
  if (compact === "booking" || compact.includes("bookkeep")) return "bookkeeping";
  if (compact.includes("taxfil")) {
    if (compact.includes("nonvat")) return "taxfilingnonvat";
    if (compact.includes("vat")) return "taxfilingvat";
    return "taxfiling";
  }
  if (compact.includes("audit")) return "auditing";
  if (compact.includes("taxcomp")) return "taxcomputation";
  return compact;
}

export function cloneBundleSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    assignee: String(step?.assignee || "accountant").trim().toLowerCase() || "accountant",
    text: String(step?.text || ""),
  }));
}

export function buildServiceBundleRecord(service) {
  const serviceName = String(service?.name || "").trim();
  const serviceId = String(service?.id ?? "").trim();
  const serviceKey = normalizeServiceNameKey(serviceName);
  const explicitSteps = cloneBundleSteps(service?.bundle_steps);

  return {
    id: serviceId || serviceKey || serviceName,
    key: serviceId || serviceKey || serviceName,
    label: serviceName ? `${serviceName} Bundle` : "Service Bundle",
    serviceName,
    summary: String(service?.summary || "").trim() || "Bundle tasks saved for this service.",
    steps: explicitSteps,
    disabled: Boolean(service?.disabled),
  };
}

export function buildServiceBundleCollection(services) {
  return (Array.isArray(services) ? services : [])
    .map((service) => buildServiceBundleRecord(service))
    .filter((bundle) => String(bundle.serviceName || "").trim());
}

export function getServiceBundleKey(serviceName) {
  return normalizeServiceNameKey(serviceName);
}

export { normalizeServiceNameKey };
