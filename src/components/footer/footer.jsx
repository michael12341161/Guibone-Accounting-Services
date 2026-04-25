import React from "react";
import { Link } from "react-router-dom";
import { appLogo } from "../../assets/branding";

const quickLinks = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Contact Us", href: "#contact" },
];

const authLinks = [
  { label: "Sign In", to: "/login" },
  { label: "Sign Up", to: "/sign-up" },
];

const services = ["Auditing", "Tax Filing", "Bookkeeping", "Consultation"];

const contactInfo = [
  {
    label: "Email",
    value: "nacaya.michael123@gmail.com",
    href: "nacaya.michael123@gmail.com",
  },
  {
    label: "Phone",
    value: "+63 935 478 6152",
    href: "tel:+639354786152",
  },
  {
    label: "Address",
    value: "Mabini–Tiano St., Brgy. 14, Cagayan de Oro City, Misamis Oriental 9000, Philippines",
  },
];

function FooterSection({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{title}</h2>
      {children}
    </section>
  );
}

export default function Footer() {
  return (
    <footer className="relative mt-16 w-full border-t border-slate-200/80 bg-white/85 text-slate-900 backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 border-b border-slate-200/80 pb-10 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1.1fr]">
          <FooterSection title="System Information">
            <div className="space-y-4">
              <img
                src={appLogo}
                alt="Monitoring System"
                className="h-12 w-12 rounded-2xl border border-emerald-200 bg-white object-contain p-1 shadow-sm"
              />
              <div className="space-y-3">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Guibone Accounting Services</h3>
                <p className="max-w-sm text-sm leading-7 text-slate-600">
                  A system that helps manage clients, appointments, and accounting services.
                </p>
              </div>
            </div>
          </FooterSection>

          <FooterSection title="Quick Links">
            <nav aria-label="Footer quick links">
              <ul className="space-y-3">
                {quickLinks.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm font-medium text-slate-600 transition hover:text-emerald-700"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
                {authLinks.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-sm font-medium text-slate-600 transition hover:text-emerald-700"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </FooterSection>

          <FooterSection title="Services">
            <ul className="space-y-3">
              {services.map((service) => (
                <li key={service} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span>{service}</span>
                </li>
              ))}
            </ul>
          </FooterSection>

          <FooterSection title="Contact Info">
            <ul className="space-y-4">
              {contactInfo.map((item) => (
                <li key={item.label} className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="text-sm leading-6 text-slate-600 transition hover:text-emerald-700"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="text-sm leading-6 text-slate-600">{item.value}</p>
                  )}
                </li>
              ))}
            </ul>
          </FooterSection>
        </div>

        <p className="pt-6 text-center text-sm text-slate-500">
          &copy; 2026 Guibone Accounting Services | All Rights Reserved
        </p>
      </div>
    </footer>
  );
}
