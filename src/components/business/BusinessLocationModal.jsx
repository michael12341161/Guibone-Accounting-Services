import React, { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Modal } from "../UI/modal";
import { useErrorToast } from "../../utils/feedback";
import {
  buildBusinessAddress,
  buildBusinessAddressDetails,
  buildBusinessSearchQueries,
  DEFAULT_MAP_ZOOM,
  geocodeBusinessAddress,
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

export default function BusinessLocationModal({
  open,
  onClose,
  business,
  businessName = "Business",
  title = "Business Location",
  description = "The map below is based on the saved business address.",
  loading = false,
  error = "",
  loadingMessage = "Loading business location...",
  emptyMessage = "No business details are available yet.",
}) {
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  useErrorToast(error);
  useErrorToast(mapError);
  const [mapLocation, setMapLocation] = useState(null);

  const businessAddress = useMemo(() => buildBusinessAddress(business), [business]);
  const businessAddressDetails = useMemo(() => buildBusinessAddressDetails(business), [business]);
  const businessSearchQueries = useMemo(() => buildBusinessSearchQueries(business), [business]);

  useEffect(() => {
    if (!open) {
      setMapLoading(false);
      setMapError("");
      setMapLocation(null);
      return undefined;
    }

    if (loading || !business) {
      setMapLoading(false);
      setMapError("");
      setMapLocation(null);
      return undefined;
    }

    if (!businessSearchQueries.length) {
      setMapLoading(false);
      setMapLocation(null);
      setMapError("No business address is available for the map.");
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    setMapLoading(true);
    setMapError("");
    setMapLocation(null);

    geocodeBusinessAddress(businessSearchQueries, { signal: controller.signal })
      .then((nextLocation) => {
        if (!active) return;
        setMapLocation(nextLocation);
      })
      .catch((mapLoadError) => {
        if (!active || controller.signal.aborted) return;
        setMapLocation(null);
        setMapError(mapLoadError?.message || "Unable to show this business on the map.");
      })
      .finally(() => {
        if (!active) return;
        setMapLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [business, businessSearchQueries, loading, open]);

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="lg">
      <div className="space-y-4">
        {business ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Address</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{businessAddress}</div>
            {businessAddressDetails.length ? (
              <div className="mt-2 text-xs text-slate-500">{businessAddressDetails.join(" | ")}</div>
            ) : null}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            {loadingMessage}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{error}</div>
        ) : !business ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            {emptyMessage}
          </div>
        ) : mapLoading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            Finding this business on the map...
          </div>
        ) : mapError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">{mapError}</div>
        ) : mapLocation ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <MapContainer
                key={`${mapLocation.lat}:${mapLocation.lng}`}
                center={[mapLocation.lat, mapLocation.lng]}
                zoom={DEFAULT_MAP_ZOOM}
                scrollWheelZoom
                className="h-[22rem] w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[mapLocation.lat, mapLocation.lng]} icon={BUSINESS_MARKER_ICON}>
                  <Popup>
                    <div className="max-w-[16rem]">
                      <div className="font-semibold text-slate-900">{businessName}</div>
                      <div className="mt-1 text-xs text-slate-600">{mapLocation.label}</div>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            <a
              href={`https://www.openstreetmap.org/?mlat=${mapLocation.lat}&mlon=${mapLocation.lng}#map=${DEFAULT_MAP_ZOOM}/${mapLocation.lat}/${mapLocation.lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              <MapPin className="h-4 w-4" strokeWidth={1.8} />
              Open in OpenStreetMap
            </a>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
