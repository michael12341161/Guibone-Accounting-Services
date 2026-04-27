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
  profileDisplayName,
  avatarSrc,
  onToggleSidebar,
  showSidebarToggle = true,
  showSidebarToggleOnDesktop = false,
  rightContent,
  onLogout,
  profileItems,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuStyle, setProfileMenuStyle] = useState({ top: 88, right: 16 });
  const profileRootRef = useRef(null);
  const profileButtonRef = useRef(null);

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

  const resolvedProfileDisplayName = useMemo(() => {
    return String(profileDisplayName || userName || "User").trim() || "User";
  }, [profileDisplayName, userName]);

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

  useEffect(() => {
    if (!profileOpen) return undefined;

    const updateProfileMenuPosition = () => {
      if (!profileButtonRef.current) return;

      const rect = profileButtonRef.current.getBoundingClientRect();
      const viewportPadding = 12;

      setProfileMenuStyle({
        top: Math.max(viewportPadding, rect.bottom + 10),
        right: Math.max(viewportPadding, window.innerWidth - rect.right),
      });
    };

    updateProfileMenuPosition();
    window.addEventListener("resize", updateProfileMenuPosition);
    window.addEventListener("scroll", updateProfileMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateProfileMenuPosition);
      window.removeEventListener("scroll", updateProfileMenuPosition, true);
    };
  }, [profileOpen]);

  const onClickProfileItem = (item) => {
    item?.onClick?.();
    setProfileOpen(false);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
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
                className="h-[2em] w-[2em] shrink-0 rounded-[0.55em] object-contain ring-1 ring-slate-200 dark:ring-slate-700"
              />
            )}
            <div className="min-w-0">
              {title && (
                <div className="truncate text-[0.95em] font-semibold text-slate-800 dark:text-slate-100">
                  {title}
                </div>
              )}
              {badge && (
                <span className="mt-0.5 inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.72em] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
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
            ref={profileButtonRef}
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className={classNames(
              "inline-flex items-center gap-2 rounded-full border py-[0.12em] pl-[0.12em] pr-2 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
              profileOpen
                ? "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-[var(--theme-hover)] dark:text-slate-100 dark:hover:bg-[var(--theme-hover)]"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[var(--theme-surface)] dark:text-slate-200 dark:hover:bg-[var(--theme-hover)]"
            )}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            aria-label="Open profile menu"
          >
            <span className="inline-flex h-[2.25em] w-[2.25em] items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 p-[0.12em]">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={resolvedProfileDisplayName}
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
                "h-4 w-4 text-slate-500 transition-transform duration-200 dark:text-slate-300",
                profileOpen ? "rotate-180" : ""
              )}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>

          {profileOpen && (
            <div
              className="fixed z-[70] w-[14.5rem] max-w-[calc(100vw-0.75rem)] overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_28px_80px_-40px_rgba(0,0,0,0.9)]"
              style={{
                top: `${profileMenuStyle.top}px`,
                right: `${profileMenuStyle.right}px`,
              }}
            >
              <div className="px-3 pb-2.5 pt-3.5 text-center">
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 via-slate-100 to-white p-1 shadow-sm ring-1 ring-slate-200 dark:from-slate-700 dark:via-slate-800 dark:to-slate-950 dark:ring-slate-700">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={resolvedProfileDisplayName}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-[2rem] font-semibold text-white shadow-sm">
                      {initials}
                    </span>
                  )}
                </div>
                <p className="mx-auto mt-2 max-w-[9rem] text-[0.95rem] font-medium leading-5 text-slate-700 dark:text-slate-200">
                  {resolvedProfileDisplayName}
                </p>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800" />

              <div className="py-1">
                {effectiveProfileItems.map((item) => {
                  const isDanger = (item?.tone || "default") === "danger";
                  return (
                    <React.Fragment key={item?.key || item?.label}>
                      {item?.separatorBefore ? <div className="my-1 border-t border-slate-200 dark:border-slate-800" /> : null}
                      <button
                        type="button"
                        onClick={() => onClickProfileItem(item)}
                        className={classNames(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.95rem] transition",
                          isDanger
                            ? "text-slate-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-[var(--theme-hover)] dark:hover:text-rose-200"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
                        )}
                        aria-label={item?.label}
                      >
                        {item?.icon ? (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
                            {item.icon}
                          </span>
                        ) : null}
                        <span>{item?.label}</span>
                      </button>

                      {item?.badgeLabel ? (
                        <div className="flex justify-center px-3 pb-1.5 pt-0.5">
                          <span className="inline-flex items-center rounded-[1rem] bg-white px-2 py-1 text-[0.74rem] font-medium uppercase leading-none tracking-[0.02em] text-rose-500 dark:bg-slate-900 dark:text-rose-300">
                            {item.badgeLabel}
                          </span>
                        </div>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
