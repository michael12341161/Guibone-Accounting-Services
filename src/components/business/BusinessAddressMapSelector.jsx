import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, MapPin, Search } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { getPostalCodeByLocation } from "../../services/postalService";
import {
  buildInteractiveBusinessSearchQuery,
  DEFAULT_MAP_ZOOM,
  MIN_LOCATION_SEARCH_LENGTH,
  PHILIPPINES_DEFAULT_MAP_ZOOM,
  PHILIPPINES_MAP_CENTER,
  reverseGeocodePhilippineLocation,
  searchPhilippineLocationSuggestions,
} from "../../utils/business_location";

const BUSINESS_MARKER_ICON = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FlyToSelection({ position }) {
  const map = useMap();

  useEffect(() => {
    if (!position) {
      return;
    }

    map.flyTo(position, DEFAULT_MAP_ZOOM, {
      duration: 1.1,
    });
  }, [map, position]);

  return null;
}

function ClickToSelectLocation({ disabled, onSelect }) {
  useMapEvents({
    click(event) {
      if (disabled) {
        return;
      }

      onSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  readOnly = false,
  required = false,
  containerClassName = "",
}) {
  return (
    <div className={containerClassName}>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full rounded-2xl border px-4 py-3.5 text-sm shadow-sm outline-none transition ${
          readOnly
            ? "border-slate-300 bg-slate-100 text-slate-500"
            : "border-slate-300 bg-white text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
        }`}
      />
      {helperText ? <p className="mt-2 text-xs text-slate-500">{helperText}</p> : null}
    </div>
  );
}

export default function BusinessAddressMapSelector({
  value,
  onChange,
  title = "Business Address Details",
  description = "Search a location or click on the map to auto-fill the business address.",
  required = false,
}) {
  const [searchValue, setSearchValue] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [noResultsMessage, setNoResultsMessage] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const activeControllerRef = useRef(null);
  const skipNextAutocompleteRef = useRef("");
  const seededQueryRef = useRef("");
  const searchContainerRef = useRef(null);
  const streetValue = String(value?.street || "");
  const barangayValue = String(value?.barangay || "");
  const cityValue = String(value?.city || "");
  const provinceValue = String(value?.province || "");
  const postalCodeValue = String(value?.postalCode || "");
  const countryValue = String(value?.country || "Philippines");

  const hasAddressValue = useMemo(() => {
    return [streetValue, barangayValue, cityValue, provinceValue, postalCodeValue].some(
      (part) => String(part ?? "").trim() !== ""
    );
  }, [barangayValue, cityValue, postalCodeValue, provinceValue, streetValue]);

  const currentPosition = useMemo(() => {
    if (!Number.isFinite(selectedLocation?.lat) || !Number.isFinite(selectedLocation?.lng)) {
      return null;
    }

    return [selectedLocation.lat, selectedLocation.lng];
  }, [selectedLocation]);

  const commitValue = useCallback(
    (patch) => {
      if (!onChange) {
        return;
      }

      const nextValue = {
        ...value,
        ...patch,
      };
      const explicitPostalCode = String(patch?.postalCode ?? "").trim();
      const resolvedPostalCode =
        explicitPostalCode ||
        getPostalCodeByLocation({
          province: nextValue.province,
          city: nextValue.city,
          fallback: nextValue.postalCode,
        });

      onChange({
        ...nextValue,
        postalCode: resolvedPostalCode,
        country: nextValue.country || "Philippines",
      });
    },
    [onChange, value]
  );

  const applyResolvedLocation = useCallback(
    (location, nextSearchValue = "") => {
      commitValue({
        street: location?.street || "",
        barangay: location?.barangay || "",
        city: location?.city || "",
        province: location?.province || "",
        postalCode: location?.postalCode || "",
        country: location?.country || "Philippines",
      });

      const label =
        String(nextSearchValue || location?.displayName || buildInteractiveBusinessSearchQuery(location)).trim() ||
        "";

      if (label) {
        skipNextAutocompleteRef.current = label;
        setSearchValue(label);
      }

      setSelectedLocation({
        lat: location?.lat,
        lng: location?.lng,
        displayName: location?.displayName || label,
      });
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      setNoResultsMessage("");
      setError("");
    },
    [commitValue]
  );

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasAddressValue) {
      seededQueryRef.current = "";
      skipNextAutocompleteRef.current = "";
      setSearchValue("");
      setSelectedLocation(null);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      setNoResultsMessage("");
      setError("");
      setLoadingMessage("");
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      return;
    }

    if (selectedLocation) {
      return;
    }

    const seededQuery = buildInteractiveBusinessSearchQuery({
      street: streetValue,
      barangay: barangayValue,
      city: cityValue,
      province: provinceValue,
      postalCode: postalCodeValue,
    });
    if (!seededQuery || seededQuery === seededQueryRef.current) {
      return;
    }

    seededQueryRef.current = seededQuery;
    skipNextAutocompleteRef.current = seededQuery;
    setSearchValue(seededQuery);
  }, [barangayValue, cityValue, hasAddressValue, postalCodeValue, provinceValue, selectedLocation, streetValue]);

  const handleSuggestionSelect = useCallback(
    (location) => {
      if (!location) {
        return;
      }

      applyResolvedLocation(location, location.displayName);
    },
    [applyResolvedLocation]
  );

  useEffect(() => {
    const query = String(searchValue || "").trim();

    if (!query) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      setNoResultsMessage("");
      setError("");
      return;
    }

    if (skipNextAutocompleteRef.current && skipNextAutocompleteRef.current === query) {
      skipNextAutocompleteRef.current = "";
      return;
    }

    if (query.length < MIN_LOCATION_SEARCH_LENGTH) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      setNoResultsMessage("");
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      activeControllerRef.current?.abort();
      activeControllerRef.current = controller;
      setSuggestionsLoading(true);
      setSuggestionsOpen(true);
      setNoResultsMessage("");
      setError("");

      try {
        const nextSuggestions = await searchPhilippineLocationSuggestions(query, {
          signal: controller.signal,
          limit: 5,
        });

        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setSuggestions(nextSuggestions);
        setNoResultsMessage(
          nextSuggestions.length
            ? ""
            : "No matching locations found. Try a more specific street, barangay, city, or province."
        );
      } catch (searchError) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setSuggestions([]);
        setNoResultsMessage("");
        setError(searchError?.message || "Unable to load location choices right now.");
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }

        if (!controller.signal.aborted && requestIdRef.current === requestId) {
          setSuggestionsLoading(false);
        }
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [searchValue]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!searchContainerRef.current?.contains(event.target)) {
        setSuggestionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleMapSelection = useCallback(
    async ({ lat, lng }) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      const controller = new AbortController();

      activeControllerRef.current?.abort();
      activeControllerRef.current = controller;
      setLoadingMessage("Resolving the clicked map location...");
      setError("");

      try {
        const location = await reverseGeocodePhilippineLocation(
          { lat, lng },
          {
            signal: controller.signal,
          }
        );

        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        applyResolvedLocation(location, location.displayName);
      } catch (reverseError) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setError(reverseError?.message || "Unable to resolve that map location.");
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }

        if (!controller.signal.aborted && requestIdRef.current === requestId) {
          setLoadingMessage("");
        }
      }
    },
    [applyResolvedLocation]
  );

  const handleFieldChange = useCallback(
    (field) => (event) => {
      commitValue({
        [field]: event.target.value,
      });
    },
    [commitValue]
  );

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Search Business Location
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </label>
        <div ref={searchContainerRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={1.9} />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => {
                seededQueryRef.current = "";
                skipNextAutocompleteRef.current = "";
                setSearchValue(event.target.value);
                setError("");
                setNoResultsMessage("");
                setSuggestionsOpen(true);
              }}
              onFocus={() => {
                if (suggestions.length || suggestionsLoading || noResultsMessage) {
                  setSuggestionsOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions.length) {
                  event.preventDefault();
                  handleSuggestionSelect(suggestions[0]);
                }

                if (event.key === "Escape") {
                  setSuggestionsOpen(false);
                }
              }}
              placeholder="Type street, barangay, city, or province"
              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
            />
          </div>
          {suggestionsOpen && (suggestionsLoading || suggestions.length || noResultsMessage) ? (
            <div className="absolute z-[1200] mt-2 max-h-72 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.45)]">
              {suggestionsLoading ? (
                <div className="px-4 py-3 text-sm text-slate-600">Loading location choices...</div>
              ) : suggestions.length ? (
                <div className="max-h-72 overflow-y-auto py-2">
                  {suggestions.map((location) => {
                    const details = [location?.barangay, location?.city, location?.province, location?.postalCode]
                      .map((part) => String(part || "").trim())
                      .filter(Boolean)
                      .join(" | ");

                    return (
                      <button
                        key={`${location.lat}:${location.lng}:${location.displayName}`}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSuggestionSelect(location);
                        }}
                        className="block w-full px-4 py-3 text-left transition hover:bg-emerald-50"
                      >
                        <div className="text-sm font-medium text-slate-900">{location.displayName}</div>
                        {details ? <div className="mt-1 text-xs text-slate-500">{details}</div> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-600">{noResultsMessage}</div>
              )}
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Matching locations will appear as choices while you type. The marker will show only after you pick one of those choices or click directly on the map.
        </p>
      </div>

      {loadingMessage ? (
        <div className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
          <span>{loadingMessage}</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {selectedLocation?.displayName ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-slate-700">
          <div className="flex items-center gap-2 font-medium text-emerald-700">
            <MapPin className="h-4 w-4" strokeWidth={1.9} />
            <span>Selected location</span>
          </div>
          <p className="mt-2 text-slate-700">{selectedLocation.displayName}</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <MapContainer
          center={PHILIPPINES_MAP_CENTER}
          zoom={PHILIPPINES_DEFAULT_MAP_ZOOM}
          scrollWheelZoom
          className="h-[22rem] w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToSelectLocation disabled={Boolean(loadingMessage)} onSelect={handleMapSelection} />
          <FlyToSelection position={currentPosition} />
          {currentPosition ? (
            <Marker position={currentPosition} icon={BUSINESS_MARKER_ICON}>
              <Popup>
                <div className="max-w-[16rem] text-sm">
                  <div className="font-semibold text-slate-900">Business location</div>
                  <div className="mt-1 text-xs text-slate-600">
                    {selectedLocation.displayName || "Selected location"}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TextInput
          label="Business Street Address / House No."
          value={streetValue}
          onChange={handleFieldChange("street")}
          placeholder="House no., street, subdivision"
          containerClassName="md:col-span-2"
        />
        <TextInput
          label="Barangay"
          value={barangayValue}
          onChange={handleFieldChange("barangay")}
          placeholder="Auto-filled from the selected location"
          required={required}
        />
        <TextInput
          label="City / Municipality"
          value={cityValue}
          onChange={handleFieldChange("city")}
          placeholder="Auto-filled from the selected location"
          required={required}
        />
        <TextInput
          label="Province"
          value={provinceValue}
          onChange={handleFieldChange("province")}
          placeholder="Auto-filled from the selected location"
          required={required}
        />
        <TextInput
          label="Postal Code / ZIP Code"
          value={postalCodeValue}
          onChange={handleFieldChange("postalCode")}
          placeholder="Auto-filled from Nominatim or local postal mapping"
          helperText="When Nominatim has no ZIP code, the city and province are matched against the local Philippine postal dataset."
        />
        <TextInput
          label="Country"
          value={countryValue}
          readOnly
          helperText="Currently limited to Philippine addresses."
          containerClassName="md:col-span-2"
        />
      </div>
    </div>
  );
}
