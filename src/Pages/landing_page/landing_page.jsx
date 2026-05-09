import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LoaderCircle, MapPin } from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { appLogo } from "../../assets/branding";
import DarkModeToggle from "../../components/darkmode/DarkModeToggle";
import SignUpModal from "../../components/auth/SignUpModal";
import Footer from "../../components/footer/footer";
import { RouteLoadingPanel } from "../../components/layout/route_loading_panel";
import { getHomePathForRole } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import { showErrorToast, showSuccessToast } from "../../utils/feedback";
import { DEFAULT_MAP_ZOOM, geocodeBusinessAddress } from "../../utils/business_location";
import { getUserRole } from "../../utils/helpers";

const sectionLinks = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

const getSectionIdFromHref = (href) => href.replace("#", "");
const sectionIds = sectionLinks.map((item) => getSectionIdFromHref(item.href));

const OFFICE_NAME = "Guibone Accounting Services";
const OFFICE_ADDRESS = "Tiano Brothers Street, Barangay 8, Poblacion, Cagayan de Oro, Northern Mindanao, 9000, Philippines";
const OFFICE_ADDRESS_DESCRIPTION = "Visit the office for in-person consultations, document submission, and client assistance.";
const OFFICE_HOURS = "Mon-Fri, 8:00 AM - 5:00 PM";
const OFFICE_MAP_QUERIES = [
  OFFICE_ADDRESS,
  "Tiano Brothers Street, Barangay 8, Cagayan de Oro, 9000, Philippines",
  "Barangay 8, Poblacion, Cagayan de Oro, 9000, Philippines",
];
const OFFICE_MAP_SEARCH_URL = `https://www.openstreetmap.org/search?query=${encodeURIComponent(OFFICE_ADDRESS)}`;

const LANDING_MARKER_ICON = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function LandingMapSizeController({ watchKey }) {
  const map = useMap();

  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      map.invalidateSize(false);
    });
    const secondPass = window.setTimeout(() => {
      map.invalidateSize(false);
    }, 180);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(secondPass);
    };
  }, [map, watchKey]);

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize(false);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);

  return null;
}

const serviceItems = [
  {
    title: "DTI / SEC Registration",
    description: "Guide new businesses through complete registration steps, submissions, and approval tracking.",
  },
  {
    title: "BIR Registration",
    description: "Monitor BIR compliance requirements, deadlines, and filing milestones with clear status updates.",
  },
  {
    title: "SSS, PhilHealth & Pag-IBIG Registration",
    description: "Track agency registrations, supporting requirements, and filing progress for employer compliance.",
  },
  {
    title: "Tax Consultation",
    description: "Track consultations, notes, and next actions for smarter tax planning and compliance.",
  },
  {
    title: "Audit Services",
    description: "Organize audit requests, working papers, and progress monitoring across stakeholders.",
  },
  {
    title: "Client Record Management",
    description: "Keep client profiles, business data, documents, and requests secured and easy to retrieve.",
  },
];

const aboutHighlights = [
  {
    title: "Role-based workflows",
    description: "Admins, accountants, secretaries, and clients see only what they need—nothing more.",
  },
  {
    title: "Clear progress monitoring",
    description: "Track tasks, requirements, and service steps from intake to completion in one timeline.",
  },
  {
    title: "Scheduling & follow-ups",
    description: "Coordinate appointments and reminders so no filing deadline is missed.",
  },
];

const contactItems = [
  {
    label: "Email",
    value: "nacaya.michael123@gmail.com",
    href: "mailto:nacaya.michael123@gmail.com",
    description: "For account access, onboarding support, and general client concerns.",
  },
  {
    label: "Phone",
    value: "+63 935 478 6152",
    href: "tel:+639354786152",
    description: "Reach the office for appointment coordination and follow-up questions.",
  },
  {
    label: "Address",
    value: OFFICE_ADDRESS,
    description: "Visit for in-person consultations, document submission, and assistance.",
  },
];

const initialContactForm = {
  name: "",
  email: "",
  message: "",
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Container({ className, children }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-5 lg:px-6", className)}>{children}</div>;
}

function NavLink({ href, children, active, onClick, isDarkMode }) {
  return (
    <a
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative inline-flex h-9 items-center justify-center px-1 text-xs font-semibold transition-colors duration-300",
        "after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:origin-left after:scale-x-0 after:rounded-full after:transition-transform after:duration-300",
        active
          ? isDarkMode
            ? "text-emerald-200 after:scale-x-100 after:bg-emerald-300"
            : "text-emerald-800 after:scale-x-100 after:bg-emerald-600"
          : isDarkMode
            ? "text-slate-200/90 after:bg-emerald-300 hover:text-white hover:after:scale-x-100"
            : "text-slate-700 after:bg-emerald-600 hover:text-emerald-700 hover:after:scale-x-100"
      )}
    >
      {children}
    </a>
  );
}

function MobileMenuButton({ open, onClick, isDarkMode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center rounded-xl border p-2 shadow-sm transition lg:hidden",
        isDarkMode
          ? "border-slate-800 bg-slate-950/60 text-slate-100 hover:bg-slate-900/70"
          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      )}
      aria-expanded={open}
      aria-label="Toggle navigation"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        {open ? (
          <path
            fillRule="evenodd"
            d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 1 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M3.75 5.25A.75.75 0 0 1 4.5 4.5h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1-.75-.75Zm0 6.75a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1-.75-.75Zm0 6.75a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1-.75-.75Z"
            clipRule="evenodd"
          />
        )}
      </svg>
    </button>
  );
}

function SectionHeader({ eyebrow, title, description, align = "left", isDarkMode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}
    >
      <p
        className={cx(
          "text-[0.65rem] font-semibold uppercase tracking-[0.18em]",
          isDarkMode ? "text-emerald-300" : "text-emerald-700"
        )}
      >
        {eyebrow}
      </p>
      <h2 className={cx("mt-3 text-2xl font-semibold tracking-tight sm:text-3xl", isDarkMode ? "text-white" : "text-slate-900")}>
        {title}
      </h2>
      {description ? (
        <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
          {description}
        </p>
      ) : null}
    </motion.div>
  );
}

function StatPill({ label, value, isDarkMode }) {
  return (
    <div
      className={cx(
        "rounded-lg border px-3 py-2",
        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
      )}
    >
      <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-slate-300" : "text-slate-500")}>
        {label}
      </p>
      <p className={cx("mt-1.5 text-base font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
        {value}
      </p>
    </div>
  );
}

function FeatureCard({ title, description, icon, isDarkMode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -5 }}
      className={cx(
        "group rounded-lg border p-4 transition-all duration-300 hover:shadow-lg",
        isDarkMode
          ? "border-slate-800 bg-slate-950/40 hover:bg-slate-950/70 hover:border-emerald-500/30"
          : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div
        className={cx(
          "flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-300 group-hover:scale-105",
          isDarkMode ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        )}
      >
        {icon}
      </div>
      <h3 className={cx("mt-3 text-sm font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>{title}</h3>
      <p className={cx("mt-1.5 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
      <div className={cx("mt-4 h-px w-full", isDarkMode ? "bg-white/5" : "bg-slate-100")} />
      <p className={cx("mt-3 text-xs font-semibold transition-colors duration-300", isDarkMode ? "text-emerald-200 group-hover:text-emerald-400" : "text-emerald-700 group-hover:text-emerald-600")}>
        Organized. Trackable. Secure.
      </p>
    </motion.div>
  );
}

function ServiceCard({ title, description, isDarkMode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -5 }}
      className={cx(
        "group rounded-lg border p-4 shadow-sm transition-all duration-300 hover:shadow-lg",
        isDarkMode
          ? "border-slate-800 bg-slate-950/35 hover:bg-slate-950/60 hover:border-emerald-500/30"
          : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cx(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105",
            isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"
          )}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M9 12l2 2 4-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.4"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className={cx("text-sm font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>{title}</h3>
          <p className={cx("mt-1.5 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ContactInput({ label, name, value, onChange, type = "text", placeholder, multiline = false, isDarkMode }) {
  const sharedClassName = cx(
    "w-full rounded-lg border px-3 py-2.5 text-xs shadow-sm outline-none transition focus:ring-2",
    isDarkMode
      ? "border-slate-800 bg-slate-950/40 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:ring-emerald-400/15"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/15"
  );

  return (
    <label className="block">
      <span className={cx("mb-1.5 block text-xs font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>{label}</span>
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={5}
          className={cx(sharedClassName, "min-h-[120px] resize-y")}
          required
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={sharedClassName}
          required
        />
      )}
    </label>
  );
}

function ContactInfoItem({ label, value, description, href, isDarkMode }) {
  const valueContent = href ? (
    <a
      href={href}
      className={cx("text-sm font-semibold transition break-words", isDarkMode ? "text-white hover:text-emerald-200" : "text-slate-900 hover:text-emerald-700")}
    >
      {value}
    </a>
  ) : (
    <p className={cx("text-sm font-semibold break-words", isDarkMode ? "text-white" : "text-slate-900")}>{value}</p>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02 }}
      className={cx(
        "flex items-start gap-3 rounded-lg border p-4 transition-all duration-300 hover:shadow-md",
        isDarkMode ? "border-slate-800 bg-slate-950/35 hover:bg-slate-950/50 hover:border-emerald-500/30" : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div
        className={cx(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
          isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"
        )}
      >
        {label.charAt(0)}
      </div>
      <div className="min-w-0">
        <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>{label}</p>
        <div className="mt-1.5">{valueContent}</div>
        <p className={cx("mt-1.5 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
      </div>
    </motion.div>
  );
}

function OfficeMapCard({ isDarkMode }) {
  const [mapLocation, setMapLocation] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setMapLoading(true);
    setMapError("");

    geocodeBusinessAddress(OFFICE_MAP_QUERIES, { signal: controller.signal })
      .then((nextLocation) => {
        if (!active) {
          return;
        }

        setMapLocation(nextLocation);
      })
      .catch((error) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setMapLocation(null);
        setMapError(error?.message || "Unable to load the office map right now.");
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setMapLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const openStreetMapHref = mapLocation
    ? `https://www.openstreetmap.org/?mlat=${mapLocation.lat}&mlon=${mapLocation.lng}#map=${DEFAULT_MAP_ZOOM}/${mapLocation.lat}/${mapLocation.lng}`
    : OFFICE_MAP_SEARCH_URL;

  return (
    <div
      className={cx(
        "mt-6 rounded-lg border p-4 sm:p-5",
        isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
            Office location
          </p>
          <p className={cx("mt-2 text-base font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>
            {OFFICE_ADDRESS}
          </p>
          <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
            {OFFICE_ADDRESS_DESCRIPTION}
          </p>
        </div>

        <a
          href={openStreetMapHref}
          target="_blank"
          rel="noreferrer"
          className={cx(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition",
            isDarkMode
              ? "border-slate-700 bg-slate-950/50 text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
              : "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
          )}
        >
          <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
          Open map
        </a>
      </div>

      <div
        className={cx(
          "mt-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.7rem] font-medium",
          isDarkMode ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-600"
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>{OFFICE_HOURS}</span>
      </div>

      {mapLoading ? (
        <div
          className={cx(
            "mt-4 flex items-center gap-2 rounded-lg border px-3 py-3 text-xs",
            isDarkMode ? "border-slate-800 bg-slate-950/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          <span>Loading the office map...</span>
        </div>
      ) : mapError ? (
        <div
          className={cx(
            "mt-4 rounded-lg border px-3 py-3 text-xs",
            isDarkMode ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"
          )}
        >
          {mapError}
        </div>
      ) : mapLocation ? (
        <div className="mt-4 space-y-2">
          <div className="leaflet-map-surface overflow-hidden rounded-lg border border-slate-200">
            <MapContainer
              center={[mapLocation.lat, mapLocation.lng]}
              zoom={DEFAULT_MAP_ZOOM}
              scrollWheelZoom={false}
              className="h-[14rem] w-full"
            >
              <LandingMapSizeController watchKey={mapLocation?.label || `${mapLocation.lat}:${mapLocation.lng}`} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[mapLocation.lat, mapLocation.lng]} icon={LANDING_MARKER_ICON}>
                <Popup>
                  <div className="max-w-[14rem] text-xs">
                    <div className="font-semibold text-slate-900">{OFFICE_NAME}</div>
                    <div className="mt-1 text-[0.7rem] text-slate-600">{mapLocation.label}</div>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
          <p className={cx("text-[0.7rem]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
            Map preview based on the office address above.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(sectionIds[0]);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, isAuthReady } = useAuth();
  const { isDarkMode } = useTheme();
  const redirectRoleId = getUserRole(user);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const openSignupModal = () => {
    setSignupModalOpen(true);
    closeMenu();
  };

  const closeSignupModal = () => {
    setSignupModalOpen(false);
  };

  const handleAuthLinkClick = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    closeMenu();
  };

  useEffect(() => {
    const updateActiveSection = () => {
      const marker = window.scrollY + 180;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      let nextActiveSection = sectionIds[0];

      sectionIds.forEach((sectionId) => {
        const section = document.getElementById(sectionId);
        if (section && marker >= section.offsetTop) {
          nextActiveSection = sectionId;
        }
      });

      if (maxScroll > 0 && window.scrollY >= maxScroll - 16) {
        nextActiveSection = sectionIds[sectionIds.length - 1];
      }

      setActiveSection(nextActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  const handleNavClick = (href) => {
    setActiveSection(getSectionIdFromHref(href));
    closeMenu();
  };

  const handleContactChange = (event) => {
    const { name, value } = event.target;

    setContactForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();

    const payload = {
      name: contactForm.name.trim(),
      email: contactForm.email.trim(),
      message: contactForm.message.trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      showErrorToast({
        title: "Incomplete form",
        description: "Please complete your name, email, and message before sending.",
        id: "landing-contact-submit",
      });
      return;
    }

    setSubmitting(true);

    try {
      await api.post("contact_form.php", payload);

      setContactForm(initialContactForm);
      showSuccessToast({
        title: "Message sent",
        description: "Your message has been delivered to our team.",
        id: "landing-contact-submit",
      });
    } catch (error) {
      const errorMessage =
        String(error?.response?.data?.message ?? "").trim() ||
        "Unable to send your message right now. Please try again in a moment.";

      showErrorToast({
        title: "Send failed",
        description: errorMessage,
        id: "landing-contact-submit",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <RouteLoadingPanel />
      </div>
    );
  }

  if (user && redirectRoleId) {
    return <Navigate to={getHomePathForRole(user || redirectRoleId)} replace />;
  }

  return (
    <div
      className={cx(
        "min-h-screen transition-colors duration-300",
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_36%),linear-gradient(180deg,_#020617_0%,_#0b1224_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ecfdf5_100%)]"
      )}
    >
      {/* Header / Navbar */}
      <header
        className={cx(
          "fixed inset-x-0 top-0 z-50 border-b backdrop-blur-2xl transition-all duration-500",
          isDarkMode ? "border-slate-900/60 bg-slate-950/60" : "border-white/40 bg-white/60"
        )}
      >
        <Container className="py-3">
          <div className="flex items-center justify-between gap-3">
            <a href="#home" onClick={() => handleNavClick("#home")} className="flex min-w-0 items-center gap-2.5">
              <img
                src={appLogo}
                alt="Monitoring System"
                className={cx(
                  "h-9 w-9 rounded-lg border object-contain p-1 shadow-sm sm:h-10 sm:w-10",
                  isDarkMode ? "border-slate-800 bg-slate-950" : "border-emerald-200 bg-white"
                )}
              />
              <div className="min-w-0">
                <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  Guibone
                </p>
                <p className={cx("truncate text-xs font-semibold tracking-tight sm:text-sm", isDarkMode ? "text-white" : "text-slate-900")}>
                  Guibone Accounting Services
                </p>
              </div>
            </a>

            <div className="hidden items-center gap-3 lg:flex">
              <nav className="flex items-center gap-1">
                {sectionLinks.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    isDarkMode={isDarkMode}
                    active={activeSection === getSectionIdFromHref(item.href)}
                    onClick={() => handleNavClick(item.href)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className={cx("h-6 w-px", isDarkMode ? "bg-slate-800" : "bg-slate-200")} />

              <div className="flex items-center gap-2.5">
                <DarkModeToggle />
                <Link
                  to="/login"
                  onClick={handleAuthLinkClick}
                  className={cx(
                    "inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-all duration-300 hover:scale-105",
                    isDarkMode
                      ? "border-slate-800 text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
                      : "border-slate-300 text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                  )}
                >
                  Sign in
                </Link>
                <button
                  type="button"
                  onClick={openSignupModal}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all duration-300 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/35"
                >
                  Sign up
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <DarkModeToggle showLabel={false} />
              <MobileMenuButton open={menuOpen} onClick={() => setMenuOpen((v) => !v)} isDarkMode={isDarkMode} />
            </div>
          </div>

          {menuOpen ? (
            <div
              className={cx(
                "mt-3 rounded-lg border p-3 shadow-lg lg:hidden",
                isDarkMode ? "border-slate-800 bg-slate-950/90" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className={cx("text-xs font-semibold", isDarkMode ? "text-slate-100" : "text-slate-900")}>Menu</p>
                  <button
                    type="button"
                    onClick={closeMenu}
                    className={cx(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                      isDarkMode ? "text-slate-200 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Close
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {sectionLinks.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      isDarkMode={isDarkMode}
                      active={activeSection === getSectionIdFromHref(item.href)}
                      onClick={() => handleNavClick(item.href)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>

                <div className={cx("mt-2 h-px", isDarkMode ? "bg-slate-800" : "bg-slate-200")} />

                <div className="grid gap-2">
                  <Link
                    to="/login"
                    onClick={handleAuthLinkClick}
                    className={cx(
                      "rounded-lg border px-3 py-2.5 text-center text-xs font-semibold transition",
                      isDarkMode ? "border-slate-800 text-slate-100" : "border-slate-300 text-slate-700"
                    )}
                  >
                    Sign in
                  </Link>
                  <button
                    type="button"
                    onClick={openSignupModal}
                    className="rounded-lg bg-emerald-600 px-3 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Sign up
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </Container>
      </header>

      <main className="pt-16">
        {/* Hero */}
        <section id="home" className="scroll-mt-24">
          <Container className="pt-6 pb-12 md:pt-8 md:pb-14 lg:pt-10 lg:pb-16">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <div
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm",
                    isDarkMode
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                      : "border-emerald-200 bg-white/70 text-emerald-700"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Welcome to Guibone Accounting Services
                </div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className={cx("mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl", isDarkMode ? "text-white" : "text-slate-900")}
                >
                  Guibone Accounting Services
                  <span className={cx("mt-1.5 block", isDarkMode ? "text-emerald-300" : "text-emerald-700")}>
                    for Accounting & Business Registration
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className={cx("mt-4 text-sm leading-6 tracking-tight sm:text-base sm:leading-7", isDarkMode ? "text-slate-300" : "text-slate-600")}
                >
                  A centralized platform to manage client records, tasks, documents, and appointments—designed for clear progress visibility and role-based access.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center"
                >
                  <Link
                    to="/login"
                    onClick={handleAuthLinkClick}
                    className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all duration-300 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/40"
                  >
                    Go to Sign in
                  </Link>
                  <button
                    type="button"
                    onClick={openSignupModal}
                    className={cx(
                      "inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-xs font-semibold transition-all duration-300 hover:scale-[1.03]",
                      isDarkMode
                        ? "border-slate-800 bg-slate-950/30 text-slate-100 hover:border-emerald-400 hover:bg-slate-900"
                        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700 hover:bg-slate-50"
                    )}
                  >
                    Create Client Account
                  </button>
                  <a
                    href="#services"
                    onClick={() => handleNavClick("#services")}
                    className={cx(
                      "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold transition-all duration-300 hover:scale-[1.03]",
                      isDarkMode ? "text-slate-200 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Explore services
                  </a>
                </motion.div>

                <div className="mt-7 grid gap-2 sm:grid-cols-3">
                  <StatPill label="Workflow" value="Role-based" isDarkMode={isDarkMode} />
                  <StatPill label="Tracking" value="Real-time" isDarkMode={isDarkMode} />
                  <StatPill label="Access" value="Secure" isDarkMode={isDarkMode} />
                </div>
              </div>

              <div className="relative">
                <div className={cx("absolute -top-8 left-6 h-36 w-36 rounded-full blur-3xl", isDarkMode ? "bg-emerald-500/15" : "bg-emerald-200/70")} />
                <div className={cx("absolute -bottom-8 right-0 h-44 w-44 rounded-full blur-3xl", isDarkMode ? "bg-blue-500/15" : "bg-amber-200/70")} />

                <div
                  className={cx(
                    "relative overflow-hidden rounded-lg border p-4 shadow-[0_28px_70px_-50px_rgba(15,23,42,0.7)] sm:p-5",
                    isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/70"
                  )}
                >
                  <div
                    className={cx(
                      "absolute inset-0 opacity-80",
                      isDarkMode
                        ? "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.18),_transparent_42%)]"
                        : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_42%)]"
                    )}
                  />

                  <div className="relative space-y-3">
                    <div
                      className={cx(
                        "rounded-lg border p-4",
                        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                      )}
                    >
                      <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                        What you can do
                      </p>
                      <p className={cx("mt-2 text-lg font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                        Track clients, tasks, and appointments from one dashboard.
                      </p>
                      <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        Keep work organized with clear ownership, status visibility, and document follow-ups.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FeatureCard
                        isDarkMode={isDarkMode}
                        title="Client records"
                        description="Store profiles, requirements, and business details in a secure workspace."
                        icon={
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        }
                      />
                      <FeatureCard
                        isDarkMode={isDarkMode}
                        title="Task monitoring"
                        description="Follow processing stages with updates and accountability across roles."
                        icon={
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
                          </svg>
                        }
                      />
                    </div>

                    <div
                      className={cx(
                        "rounded-lg border p-4",
                        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                      )}
                    >
                      <p className={cx("text-xs font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                        Included workflows
                      </p>
                      <ul className={cx("mt-2.5 grid gap-2 text-xs sm:grid-cols-2", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <li className={cx("rounded-lg border px-3 py-2", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Document tracking</li>
                        <li className={cx("rounded-lg border px-3 py-2", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Appointment scheduling</li>
                        <li className={cx("rounded-lg border px-3 py-2", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Status updates</li>
                        <li className={cx("rounded-lg border px-3 py-2", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Role-based access</li>
                      </ul>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-24">
          <Container className="py-12 lg:py-16">
            <SectionHeader
              eyebrow="Services"
              title="Everything you need to track registration and accounting work"
              description="Modernize your workflow with structured steps, clear progress visibility, and centralized documents for each service request."
              isDarkMode={isDarkMode}
            />

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {serviceItems.map((item) => (
                <ServiceCard key={item.title} title={item.title} description={item.description} isDarkMode={isDarkMode} />
              ))}
            </div>

            <div
              className={cx(
                "mt-7 grid gap-3 rounded-lg border p-4 sm:p-5 lg:grid-cols-3",
                isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
              )}
            >
              <div className="lg:col-span-1">
                <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  How it works
                </p>
                <p className={cx("mt-2 text-lg font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                  Simple steps. Clear outcomes.
                </p>
                <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  Submit requirements, monitor progress, and receive confirmation once processing is complete.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
                {[
                  { step: "1", title: "Submit", desc: "Upload requirements and provide client details." },
                  { step: "2", title: "Track", desc: "See real-time updates across tasks and appointments." },
                  { step: "3", title: "Complete", desc: "Get notified when the service is finished." },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={cx(
                      "rounded-lg border p-4",
                      isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className={cx("text-xs font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{s.title}</p>
                      <span className={cx("inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold", isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700")}>
                        {s.step}
                      </span>
                    </div>
                    <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24">
          <Container className="py-12 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <SectionHeader
                  eyebrow="About"
                  title="A professional monitoring workflow built for accounting teams"
                  description="Behind every successful business is an organized process. This platform helps teams manage tasks, clients, and schedules with clarity and accountability."
                  isDarkMode={isDarkMode}
                />

                <div className="mt-6 flex flex-col gap-2.5">
                  <Link
                    to="/login"
                    onClick={handleAuthLinkClick}
                    className={cx(
                      "inline-flex w-full items-center justify-center rounded-full border px-5 py-2.5 text-xs font-semibold transition sm:w-fit",
                      isDarkMode
                        ? "border-slate-800 bg-slate-950/30 text-slate-100 hover:border-emerald-400"
                        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                    )}
                  >
                    Access your dashboard
                  </Link>
                  <p className={cx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Already have an account? Sign in to continue.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {aboutHighlights.map((item) => (
                  <div
                    key={item.title}
                    className={cx(
                      "rounded-lg border p-4",
                      isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
                    )}
                  >
                    <p className={cx("text-sm font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{item.title}</p>
                    <p className={cx("mt-1.5 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>{item.description}</p>
                  </div>
                ))}

                <div
                  className={cx(
                    "sm:col-span-2 rounded-lg border p-4",
                    isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
                  )}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Clients", value: "Organized" },
                      { label: "Tasks", value: "Trackable" },
                      { label: "Appointments", value: "Scheduled" },
                    ].map((stat) => (
                      <div key={stat.label} className={cx("rounded-lg border p-3", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white")}>
                        <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                          {stat.label}
                        </p>
                        <p className={cx("mt-1.5 text-base font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-24">
          <Container className="py-12 lg:py-16">
            <SectionHeader
              eyebrow="Contact"
              title="Talk to the team"
              description="Send a message for onboarding assistance, appointment coordination, account concerns, or status follow-ups."
              align="center"
              isDarkMode={isDarkMode}
            />

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div
                className={cx(
                  "rounded-lg border p-4 shadow-[0_22px_60px_-50px_rgba(15,23,42,0.6)] sm:p-5",
                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/75"
                )}
              >
                <div className="border-b border-slate-200/60 pb-4">
                  <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                    Send a message
                  </p>
                  <p className={cx("mt-2 text-lg font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>
                    We will direct your concern properly.
                  </p>
                  <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    This form sends your message directly to our team for support, follow-up, and account assistance.
                  </p>
                </div>
                <form onSubmit={handleContactSubmit} className="mt-4 space-y-4">
                  <ContactInput
                    label="Name"
                    name="name"
                    value={contactForm.name}
                    onChange={handleContactChange}
                    placeholder="Enter your full name"
                    isDarkMode={isDarkMode}
                  />
                  <ContactInput
                    label="Email"
                    name="email"
                    type="email"
                    value={contactForm.email}
                    onChange={handleContactChange}
                    placeholder="Enter your email address"
                    isDarkMode={isDarkMode}
                  />
                  <ContactInput
                    label="Message"
                    name="message"
                    value={contactForm.message}
                    onChange={handleContactChange}
                    placeholder="Write your message here"
                    multiline
                    isDarkMode={isDarkMode}
                  />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="submit"
                      disabled={submitting}
                      className={cx(
                        "inline-flex w-full items-center justify-center rounded-full px-6 py-2.5 text-xs font-semibold shadow-md transition-all duration-300 sm:w-auto",
                        submitting
                          ? "cursor-not-allowed bg-emerald-500 text-white/70 shadow-emerald-500/20"
                          : "bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/40"
                      )}
                    >
                      {submitting ? (
                        <>
                          <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Message'
                      )}
                    </button>
                    <p className={cx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                      Messages sent securely via our server.
                    </p>
                  </div>
                </form>
              </div>

              <div
                className={cx(
                  "rounded-lg border p-4 sm:p-5",
                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/75"
                )}
              >
                <p className={cx("text-[0.65rem] font-semibold uppercase tracking-[0.18em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  Contact information
                </p>
                <p className={cx("mt-2 text-lg font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>
                  Choose the best way to reach us.
                </p>
                <p className={cx("mt-2 text-xs leading-5", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  Use these direct contact details for account support, scheduling updates, and office visits, then use the map below to find the office.
                </p>

                <div className="mt-4 grid gap-3">
                  {contactItems.filter((item) => item.label !== "Address").map((item) => (
                    <ContactInfoItem
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      description={item.description}
                      href={item.href}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                </div>

                <OfficeMapCard isDarkMode={isDarkMode} />

                <div className={cx("hidden rounded-lg border p-4", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white")}>
                  <p className={cx("text-xs font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>Office hours</p>
                  <p className={cx("mt-1.5 text-xs", isDarkMode ? "text-slate-300" : "text-slate-600")}>Mon–Fri, 8:00 AM – 5:00 PM</p>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <SignUpModal open={signupModalOpen} onClose={closeSignupModal} />

      {/* Footer */}
      <Footer onOpenSignUp={openSignupModal} />
    </div>
  );
}
