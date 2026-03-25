import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { appLogo } from "../../assets/branding";
import DarkModeToggle from "../../components/darkmode/DarkModeToggle";
import Footer from "../../components/footer/footer";
import { getHomePathForRole, readStoredLoginState } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { getUserRole } from "../../utils/helpers";

const sectionLinks = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

const getSectionIdFromHref = (href) => href.replace("#", "");
const sectionIds = sectionLinks.map((item) => getSectionIdFromHref(item.href));

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
    title: "LGU Permit Processing",
    description: "Centralize permit requirements, follow-ups, and document validation for local registrations.",
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
    value: "Mabini–Tiano St., Brgy. 14, Cagayan de Oro City, Misamis Oriental 9000, Philippines",
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
  return <div className={cx("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

function NavLink({ href, children, active, onClick, isDarkMode }) {
  return (
    <a
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all duration-300",
        active
          ? isDarkMode
            ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/25"
            : "bg-emerald-100 text-emerald-800"
          : isDarkMode
            ? "text-slate-200/90 hover:bg-white/5 hover:text-white hover:scale-105"
            : "text-slate-700 hover:bg-slate-100 hover:text-emerald-600 hover:scale-[1.03]"
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
        "inline-flex items-center justify-center rounded-2xl border p-2.5 shadow-sm transition lg:hidden",
        isDarkMode
          ? "border-slate-800 bg-slate-950/60 text-slate-100 hover:bg-slate-900/70"
          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      )}
      aria-expanded={open}
      aria-label="Toggle navigation"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
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
      className={cx("max-w-3xl", align === "center" && "mx-auto text-center")}
    >
      <p
        className={cx(
          "text-xs font-semibold uppercase tracking-[0.24em]",
          isDarkMode ? "text-emerald-300" : "text-emerald-700"
        )}
      >
        {eyebrow}
      </p>
      <h2 className={cx("mt-4 text-3xl font-semibold tracking-tight sm:text-4xl", isDarkMode ? "text-white" : "text-slate-900")}>
        {title}
      </h2>
      {description ? (
        <p className={cx("mt-4 text-base leading-7", isDarkMode ? "text-slate-300" : "text-slate-600")}>
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
        "rounded-2xl border px-4 py-3",
        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
      )}
    >
      <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-slate-300" : "text-slate-500")}>
        {label}
      </p>
      <p className={cx("mt-2 text-lg font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
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
        "group rounded-[2rem] border p-6 transition-all duration-300 hover:shadow-xl",
        isDarkMode
          ? "border-slate-800 bg-slate-950/40 hover:bg-slate-950/70 hover:border-emerald-500/30"
          : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div
        className={cx(
          "flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset transition-transform duration-300 group-hover:scale-110",
          isDarkMode ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        )}
      >
        {icon}
      </div>
      <h3 className={cx("mt-5 text-lg font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>{title}</h3>
      <p className={cx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
      <div className={cx("mt-5 h-px w-full", isDarkMode ? "bg-white/5" : "bg-slate-100")} />
      <p className={cx("mt-4 text-sm font-semibold transition-colors duration-300", isDarkMode ? "text-emerald-200 group-hover:text-emerald-400" : "text-emerald-700 group-hover:text-emerald-600")}>
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
        "group rounded-[2rem] border p-6 shadow-sm transition-all duration-300 hover:shadow-xl",
        isDarkMode
          ? "border-slate-800 bg-slate-950/35 hover:bg-slate-950/60 hover:border-emerald-500/30"
          : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cx(
            "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110",
            isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"
          )}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <h3 className={cx("text-base font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>{title}</h3>
          <p className={cx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ContactInput({ label, name, value, onChange, type = "text", placeholder, multiline = false, isDarkMode }) {
  const sharedClassName = cx(
    "w-full rounded-2xl border px-4 py-3.5 text-sm shadow-sm outline-none transition focus:ring-4",
    isDarkMode
      ? "border-slate-800 bg-slate-950/40 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:ring-emerald-400/15"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/15"
  );

  return (
    <label className="block">
      <span className={cx("mb-2 block text-sm font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>{label}</span>
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={6}
          className={cx(sharedClassName, "min-h-[170px] resize-y")}
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
      className={cx("text-base font-semibold transition break-words", isDarkMode ? "text-white hover:text-emerald-200" : "text-slate-900 hover:text-emerald-700")}
    >
      {value}
    </a>
  ) : (
    <p className={cx("text-base font-semibold break-words", isDarkMode ? "text-white" : "text-slate-900")}>{value}</p>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.02 }}
      className={cx(
        "flex items-start gap-4 rounded-[2rem] border p-5 transition-all duration-300 hover:shadow-md",
        isDarkMode ? "border-slate-800 bg-slate-950/35 hover:bg-slate-950/50 hover:border-emerald-500/30" : "border-slate-200 bg-white/80 hover:bg-white hover:border-emerald-200"
      )}
    >
      <div
        className={cx(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
          isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700"
        )}
      >
        {label.charAt(0)}
      </div>
      <div className="min-w-0">
        <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>{label}</p>
        <div className="mt-2">{valueContent}</div>
        <p className={cx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>{description}</p>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(sectionIds[0]);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const storedLoginState = useMemo(() => readStoredLoginState(), []);
  const redirectRoleId = getUserRole(user) ?? storedLoginState.roleId;

  const closeMenu = () => {
    setMenuOpen(false);
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

  const handleContactSubmit = (event) => {
    event.preventDefault();

    const subject = encodeURIComponent(`Website inquiry from ${contactForm.name.trim() || "Website visitor"}`);
    const body = encodeURIComponent(
      [`Name: ${contactForm.name.trim()}`, `Email: ${contactForm.email.trim()}`, "", contactForm.message.trim()].join(
        "\n"
      )
    );

    window.location.href = `mailto:support@guiboneaccounting.com?subject=${subject}&body=${body}`;
  };

  if ((user || storedLoginState.isLoggedIn) && redirectRoleId) {
    return <Navigate to={getHomePathForRole(redirectRoleId)} replace />;
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
        <Container className="py-4">
          <div className="flex items-center justify-between gap-4">
            <a href="#home" onClick={() => handleNavClick("#home")} className="flex items-center gap-3 min-w-0">
              <img
                src={appLogo}
                alt="Monitoring System"
                className={cx(
                  "h-11 w-11 rounded-2xl border object-contain p-1.5 shadow-sm sm:h-12 sm:w-12",
                  isDarkMode ? "border-slate-800 bg-slate-950" : "border-emerald-200 bg-white"
                )}
              />
              <div className="min-w-0">
                <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  Guibone
                </p>
                <p className={cx("truncate text-sm font-semibold tracking-tight sm:text-base", isDarkMode ? "text-white" : "text-slate-900")}>
                  Guibone Accounting Services
                </p>
              </div>
            </a>

            <div className="hidden items-center gap-4 lg:flex">
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

              <div className={cx("h-8 w-px", isDarkMode ? "bg-slate-800" : "bg-slate-200")} />

              <div className="flex items-center gap-3">
                <DarkModeToggle className="min-w-[10.5rem]" />
                <Link
                  to="/login"
                  onClick={handleAuthLinkClick}
                  className={cx(
                    "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-all duration-300 hover:scale-105",
                    isDarkMode
                      ? "border-slate-800 text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
                      : "border-slate-300 text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                  )}
                >
                  Sign in
                </Link>
                <Link
                  to="/sign-up"
                  className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-300 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/35"
                >
                  Sign up
                </Link>
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
                "mt-4 rounded-3xl border p-4 shadow-lg lg:hidden",
                isDarkMode ? "border-slate-800 bg-slate-950/90" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className={cx("text-sm font-semibold", isDarkMode ? "text-slate-100" : "text-slate-900")}>Menu</p>
                  <button
                    type="button"
                    onClick={closeMenu}
                    className={cx(
                      "rounded-2xl px-3 py-2 text-sm font-semibold transition",
                      isDarkMode ? "text-slate-200 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Close
                  </button>
                </div>

                <div className="flex flex-col gap-2">
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
                      "rounded-2xl border px-4 py-3 text-center text-sm font-semibold transition",
                      isDarkMode ? "border-slate-800 text-slate-100" : "border-slate-300 text-slate-700"
                    )}
                  >
                    Sign in
                  </Link>
                <Link
                  to="/sign-up"
                  onClick={closeMenu}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Sign up
                </Link>
                </div>
              </div>
            </div>
          ) : null}
        </Container>
      </header>

      <main className="pt-20">
        {/* Hero */}
        <section id="home" className="scroll-mt-28">
          <Container className="pt-8 pb-16 md:pt-10 md:pb-20 lg:pt-12 lg:pb-24">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <div
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm",
                    isDarkMode
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                      : "border-emerald-200 bg-white/70 text-emerald-700"
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Welcome to Guibone Accounting Services
                </div>

                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                  className={cx("mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl", isDarkMode ? "text-white" : "text-slate-900")}
                >
                  Guibone Accounting Services
                  <span className={cx("block mt-2", isDarkMode ? "text-emerald-300" : "text-emerald-700")}>
                    for Accounting & Business Registration
                  </span>
                </motion.h1>

                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className={cx("mt-6 text-lg tracking-tight leading-8", isDarkMode ? "text-slate-300" : "text-slate-600")}
                >
                  A centralized platform to manage client records, tasks, documents, and appointments—designed for clear progress visibility and role-based access.
                </motion.p>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <Link
                    to="/login"
                    onClick={handleAuthLinkClick}
                    className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-300 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/40"
                  >
                    Go to Sign in
                  </Link>
                  <Link
                    to="/sign-up"
                    className={cx(
                      "inline-flex items-center justify-center rounded-full border px-6 py-3.5 text-sm font-semibold transition-all duration-300 hover:scale-[1.03]",
                      isDarkMode
                        ? "border-slate-800 bg-slate-950/30 text-slate-100 hover:border-emerald-400 hover:bg-slate-900"
                        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700 hover:bg-slate-50"
                    )}
                  >
                    Create Client Account
                  </Link>
                  <a
                    href="#services"
                    onClick={() => handleNavClick("#services")}
                    className={cx(
                      "inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold transition-all duration-300 hover:scale-[1.03]",
                      isDarkMode ? "text-slate-200 hover:bg-white/5" : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    Explore services
                  </a>
                </motion.div>

                <div className="mt-10 grid gap-3 sm:grid-cols-3">
                  <StatPill label="Workflow" value="Role-based" isDarkMode={isDarkMode} />
                  <StatPill label="Tracking" value="Real-time" isDarkMode={isDarkMode} />
                  <StatPill label="Access" value="Secure" isDarkMode={isDarkMode} />
                </div>
              </div>

              <div className="relative">
                <div className={cx("absolute -top-10 left-6 h-48 w-48 rounded-full blur-3xl", isDarkMode ? "bg-emerald-500/15" : "bg-emerald-200/70")} />
                <div className={cx("absolute -bottom-10 right-0 h-56 w-56 rounded-full blur-3xl", isDarkMode ? "bg-blue-500/15" : "bg-amber-200/70")} />

                <div
                  className={cx(
                    "relative overflow-hidden rounded-[2.2rem] border p-6 shadow-[0_40px_90px_-55px_rgba(15,23,42,0.7)] sm:p-8",
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

                  <div className="relative space-y-4">
                    <div
                      className={cx(
                        "rounded-3xl border p-5",
                        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                      )}
                    >
                      <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                        What you can do
                      </p>
                      <p className={cx("mt-3 text-xl font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                        Track clients, tasks, and appointments from one dashboard.
                      </p>
                      <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        Keep work organized with clear ownership, status visibility, and document follow-ups.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FeatureCard
                        isDarkMode={isDarkMode}
                        title="Client records"
                        description="Store profiles, requirements, and business details in a secure workspace."
                        icon={
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
                          </svg>
                        }
                      />
                    </div>

                    <div
                      className={cx(
                        "rounded-3xl border p-5",
                        isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                      )}
                    >
                      <p className={cx("text-sm font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                        Included workflows
                      </p>
                      <ul className={cx("mt-3 grid gap-3 text-sm sm:grid-cols-2", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                        <li className={cx("rounded-2xl border px-4 py-3", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Document tracking</li>
                        <li className={cx("rounded-2xl border px-4 py-3", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Appointment scheduling</li>
                        <li className={cx("rounded-2xl border px-4 py-3", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Status updates</li>
                        <li className={cx("rounded-2xl border px-4 py-3", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>Role-based access</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-28">
          <Container className="py-16 lg:py-24">
            <SectionHeader
              eyebrow="Services"
              title="Everything you need to track registration and accounting work"
              description="Modernize your workflow with structured steps, clear progress visibility, and centralized documents for each service request."
              isDarkMode={isDarkMode}
            />

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {serviceItems.map((item) => (
                <ServiceCard key={item.title} title={item.title} description={item.description} isDarkMode={isDarkMode} />
              ))}
            </div>

            <div
              className={cx(
                "mt-10 grid gap-4 rounded-[2rem] border p-6 sm:p-8 lg:grid-cols-3",
                isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
              )}
            >
              <div className="lg:col-span-1">
                <p className={cx("text-sm font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  How it works
                </p>
                <p className={cx("mt-3 text-xl font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>
                  Simple steps. Clear outcomes.
                </p>
                <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  Submit requirements, monitor progress, and receive confirmation once processing is complete.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
                {[
                  { step: "1", title: "Submit", desc: "Upload requirements and provide client details." },
                  { step: "2", title: "Track", desc: "See real-time updates across tasks and appointments." },
                  { step: "3", title: "Complete", desc: "Get notified when the service is finished." },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={cx(
                      "rounded-3xl border p-5",
                      isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className={cx("text-sm font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{s.title}</p>
                      <span className={cx("inline-flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-semibold", isDarkMode ? "bg-emerald-500/10 text-emerald-200" : "bg-emerald-50 text-emerald-700")}>
                        {s.step}
                      </span>
                    </div>
                    <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-28">
          <Container className="py-16 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <SectionHeader
                  eyebrow="About"
                  title="A professional monitoring workflow built for accounting teams"
                  description="Behind every successful business is an organized process. This platform helps teams manage tasks, clients, and schedules with clarity and accountability."
                  isDarkMode={isDarkMode}
                />

                <div className="mt-8 flex flex-col gap-3">
                  <Link
                    to="/login"
                    onClick={handleAuthLinkClick}
                    className={cx(
                      "inline-flex w-full items-center justify-center rounded-full border px-6 py-3.5 text-sm font-semibold transition sm:w-fit",
                      isDarkMode
                        ? "border-slate-800 bg-slate-950/30 text-slate-100 hover:border-emerald-400"
                        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                    )}
                  >
                    Access your dashboard
                  </Link>
                  <p className={cx("text-sm", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                    Already have an account? Sign in to continue.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {aboutHighlights.map((item) => (
                  <div
                    key={item.title}
                    className={cx(
                      "rounded-[2rem] border p-6",
                      isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
                    )}
                  >
                    <p className={cx("text-base font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{item.title}</p>
                    <p className={cx("mt-2 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>{item.description}</p>
                  </div>
                ))}

                <div
                  className={cx(
                    "sm:col-span-2 rounded-[2rem] border p-6",
                    isDarkMode ? "border-slate-800 bg-slate-950/35" : "border-slate-200 bg-white/70"
                  )}
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[
                      { label: "Clients", value: "Organized" },
                      { label: "Tasks", value: "Trackable" },
                      { label: "Appointments", value: "Scheduled" },
                    ].map((stat) => (
                      <div key={stat.label} className={cx("rounded-3xl border p-5", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white")}>
                        <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                          {stat.label}
                        </p>
                        <p className={cx("mt-2 text-lg font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Contact */}
        <section id="contact" className="scroll-mt-28">
          <Container className="py-16 lg:py-24">
            <SectionHeader
              eyebrow="Contact"
              title="Talk to the team"
              description="Send a message for onboarding assistance, appointment coordination, account concerns, or status follow-ups."
              align="center"
              isDarkMode={isDarkMode}
            />

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div
                className={cx(
                  "rounded-[2.25rem] border p-6 shadow-[0_28px_80px_-60px_rgba(15,23,42,0.6)] sm:p-8",
                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/75"
                )}
              >
                <div className="border-b border-slate-200/60 pb-6">
                  <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                    Send a message
                  </p>
                  <p className={cx("mt-3 text-2xl font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>
                    We will direct your concern properly.
                  </p>
                  <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                    This form opens your email client with the message pre-filled so you can send it quickly.
                  </p>
                </div>

                <form onSubmit={handleContactSubmit} className="mt-6 space-y-5">
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
                      className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-300 hover:bg-emerald-700 hover:scale-105 hover:shadow-emerald-600/40 sm:w-auto"
                    >
                      Send Message
                    </button>
                    <p className={cx("text-xs", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                      No data is stored here; it opens your mail app.
                    </p>
                  </div>
                </form>
              </div>

              <div
                className={cx(
                  "rounded-[2.25rem] border p-6 sm:p-8",
                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white/75"
                )}
              >
                <p className={cx("text-xs font-semibold uppercase tracking-[0.22em]", isDarkMode ? "text-emerald-200" : "text-emerald-700")}>
                  Contact information
                </p>
                <p className={cx("mt-3 text-2xl font-semibold tracking-tight", isDarkMode ? "text-white" : "text-slate-900")}>
                  Choose the best way to reach us.
                </p>
                <p className={cx("mt-3 text-sm leading-6", isDarkMode ? "text-slate-300" : "text-slate-600")}>
                  Use these direct contact details for account support, scheduling updates, and office visits.
                </p>

                <div className="mt-6 grid gap-4">
                  {contactItems.map((item) => (
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

                <div className={cx("mt-8 rounded-3xl border p-5", isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white")}>
                  <p className={cx("text-sm font-semibold", isDarkMode ? "text-white" : "text-slate-900")}>Office hours</p>
                  <p className={cx("mt-2 text-sm", isDarkMode ? "text-slate-300" : "text-slate-600")}>Mon–Fri, 8:00 AM – 5:00 PM</p>
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
