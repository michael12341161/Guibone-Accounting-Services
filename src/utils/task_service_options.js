const TASK_SERVICE_EXCLUDED_NAMES = new Set(["consultation"]);

export function filterTaskServiceOptions(services) {
  return (Array.isArray(services) ? services : []).filter((service) => {
    const serviceName = String(service?.name || service?.Name || "").trim().toLowerCase();
    return serviceName && !TASK_SERVICE_EXCLUDED_NAMES.has(serviceName);
  });
}
