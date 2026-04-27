import { api } from "./api";
import { normalizeConsultationSlots } from "../utils/consultationSlots";

export async function fetchConsultationSlots(config = {}) {
  const response = await api.get("consultation_slot_settings.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      slots: normalizeConsultationSlots(response?.data?.slots),
    },
  };
}

export async function saveConsultationSlots(slots, config = {}) {
  const response = await api.post(
    "consultation_slot_settings.php",
    {
      slots: normalizeConsultationSlots(slots),
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      slots: normalizeConsultationSlots(response?.data?.slots),
    },
  };
}
