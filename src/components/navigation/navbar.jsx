import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function Navbar({
  logoSrc,
  logoAlt = "Logo",
  title,
  badge,
  userName,
  avatarSrc,
  onToggleSidebar,
  showSidebarToggle = true,
  showSidebarToggleOnDesktop = false,
  rightContent,
  onLogout,
  profileItems,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRootRef = useRef(null);

  const initials = useMemo(() => {
    return (
      (userName || "")
        .toString()
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "U"
    );
  }, [userName]);

  const effectiveProfileItems = useMemo(() => {
    if (Array.isArray(profileItems) && profileItems.length > 0) return profileItems;

    const defaults = [{ key: "profile", label: "Profile" }];
    if (onLogout) defaults.push({ key: "logout", label: "Logout", tone: "danger", onClick: onLogout });
    return defaults;
  }, [profileItems, onLogout]);

  useEffect(() => {
    if (!profileOpen) return undefined;

    const handleDocClick = (event) => {
      if (!profileRootRef.current) return;
      if (!profileRootRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen) return undefined;

    const handleResize = () => setProfileOpen(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [profileOpen]);

  const onClickProfileItem = (item) => {
    item?.onClick?.();
    setProfileOpen(false);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 text-base sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {showSidebarToggle && (
            <button
              type="button"
              className={classNames(
                "inline-flex h-[2.25em] w-[2.25em] shrink-0 items-center justify-center rounded-[0.55em] border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                showSidebarToggleOnDesktop ? "" : "lg:hidden"
              )}
              onClick={onToggleSidebar}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-[1.2em] w-[1.2em]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}

          <div className="flex min-w-0 items-center gap-3">
            {logoSrc && (
              <img
                src={logoSrc}
                alt={logoAlt}
                className="h-[2em] w-[2em] shrink-0 rounded-[0.55em] object-contain ring-1 ring-slate-200"
              />
            )}
            <div className="min-w-0">
              {title && (
                <div className="truncate text-[0.95em] font-semibold text-slate-800">
                  {title}
                </div>
              )}
              {badge && (
                <span className="mt-0.5 inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.72em] font-medium text-slate-600">
                  {badge}
                </span>
              )}
            </div>
          </div>
        </div>

        <div ref={profileRootRef} className="relative flex shrink-0 items-center gap-2 text-[0.95em] sm:gap-3">
          {rightContent && (
            <div className="flex items-center gap-2 text-[1em]">
              {rightContent}
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-[0.12em] pl-[0.12em] pr-2 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Open profile menu"
          >
            <span className="inline-flex h-[2.25em] w-[2.25em] items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 p-[0.12em]">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={userName || "Profile"}
                  className="h-full w-full rounded-full border border-white/15 object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center rounded-full bg-white/10 text-[1.05em] font-semibold text-white">
                  {initials}
                </span>
              )}
            </span>
            <ChevronDown
              className={classNames(
                "h-4 w-4 text-slate-500 transition-transform duration-200",
                profileOpen ? "rotate-180" : ""
              )}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[3em] z-50 w-[12em] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {effectiveProfileItems.map((item) => {
                const isDanger = (item?.tone || "default") === "danger";
                return (
                  <button
                    key={item?.key || item?.label}
                    type="button"
                    onClick={() => onClickProfileItem(item)}
                    className={classNames(
                      "flex h-[2.3em] w-full items-center gap-2 px-3 text-[0.95em] transition",
                      isDanger
                        ? "text-rose-600 hover:bg-rose-50"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                    aria-label={item?.label}
                  >
                    {item?.icon ? (
                      <span className="inline-flex h-[1em] w-[1em] items-center justify-center text-current">
                        {item.icon}
                      </span>
                    ) : null}
                    <span>{item?.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
