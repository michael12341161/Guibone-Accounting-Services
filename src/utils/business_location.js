import { repairUtf8Mojibake } from "./text_normalization";

export const DEFAULT_MAP_ZOOM = 16;

export function formatDisplayValue(value, fallback = "-") {
  const normalized = repairUtf8Mojibake(value).trim();
  return normalized || fallback;
}

export function buildBusinessAddress(business) {
  const joinedAddress = [
    business?.business_street_address,
    business?.business_barangay,
    business?.business_municipality,
    business?.business_province,
    business?.business_postal_code,
  ]
    .map((part) => repairUtf8Mojibake(part).trim())
    .filter(Boolean)
    .join(", ");

  return formatDisplayValue(business?.business_address || joinedAddress, "No address on file");
}

export function buildBusinessAddressDetails(business) {
  return [
    ["Province", business?.business_province],
    ["Municipality", business?.business_municipality],
    ["Barangay", business?.business_barangay],
    ["Postal Code", business?.business_postal_code],
  ]
    .map(([label, value]) => {
      const normalizedValue = repairUtf8Mojibake(value).trim();
      return normalizedValue ? `${label}: ${normalizedValue}` : "";
    })
    .filter(Boolean);
}

function normalizeGeocodePart(value) {
  return repairUtf8Mojibake(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeQueries(queries) {
  const seen = new Set();

  return queries.filter((query) => {
    const normalized = String(query ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

export function buildBusinessSearchQueries(business) {
  const street = normalizeGeocodePart(business?.business_street_address);
  const barangay = normalizeGeocodePart(business?.business_barangay);
  const municipality = normalizeGeocodePart(business?.business_municipality);
  const province = normalizeGeocodePart(business?.business_province);
  const postalCode = normalizeGeocodePart(business?.business_postal_code);
  const fullAddress = normalizeGeocodePart(business?.business_address);

  const createQuery = (...parts) => {
    const filtered = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
    return filtered.length ? [...filtered, "Philippines"].join(", ") : "";
  };

  const barangayLabel = barangay ? `Barangay ${barangay}` : "";

  return dedupeQueries([
    createQuery(barangayLabel, municipality, province, postalCode),
    createQuery(barangay, municipality, province, postalCode),
    createQuery(barangayLabel, municipality, province),
    createQuery(barangay, municipality, province),
    createQuery(street, barangayLabel, municipality, province, postalCode),
    createQuery(street, barangay, municipality, province, postalCode),
    createQuery(street, barangayLabel, municipality, province),
    createQuery(street, barangay, municipality, province),
    createQuery(fullAddress),
    createQuery(municipality, province, postalCode),
    createQuery(municipality, province),
    createQuery(province),
  ]);
}

export async function geocodeBusinessAddress(queries, options = {}) {
  const candidates = Array.isArray(queries) ? queries : [queries];
  const normalizedCandidates = candidates.map((query) => String(query ?? "").trim()).filter(Boolean);
  const { signal } = options;

  if (!normalizedCandidates.length) {
    throw new Error("No business address is available for the map.");
  }

  for (const query of normalizedCandidates) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
      countrycodes: "ph",
    });

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error("Unable to load the map location right now.");
    }

    const rows = await response.json();
    const firstMatch = Array.isArray(rows) ? rows[0] : null;
    const lat = Number(firstMatch?.lat);
    const lng = Number(firstMatch?.lon);

    if (firstMatch && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return {
        lat,
        lng,
        label: String(firstMatch?.display_name || query).trim(),
        query,
      };
    }
  }

  throw new Error("We could not find this business on the map yet.");
}
