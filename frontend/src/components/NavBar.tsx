import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getStoredRole, logout } from "../api/client";
import { FYSelector } from "./FYSelector";
import { useFY } from "../context/FYContext";

const LINKS = [
  { to: "/upload", label: "Upload", ownerOnly: true },
  { to: "/dashboard", label: "Dashboard", ownerOnly: false },
  { to: "/transactions", label: "Transactions", ownerOnly: false },
  { to: "/tax", label: "Tax", ownerOnly: false },
];

export function NavBar() {
  const role = getStoredRole();
  const isOwner = role === "owner";
  const { fy, setFy } = useFY();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const visibleLinks = LINKS.filter((link) => !link.ownerOnly || isOwner);
  const currentLabel = visibleLinks.find((l) => l.to === location.pathname)?.label ?? "Menu";

  return (
    <nav className="border-border bg-surface-card/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="max-w-container mx-auto flex items-center justify-between px-4 py-2">
        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 sm:flex">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-surface-muted text-text font-medium"
                    : "text-text-secondary hover:text-text"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {/* Mobile: hamburger + current page label */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-text-secondary hover:bg-surface-muted hover:text-text rounded-md p-1.5"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            )}
          </button>
          <span className="text-text text-sm font-medium">{currentLabel}</span>
        </div>

        {/* Right side: FY selector + badge + logout */}
        <div className="flex items-center gap-2">
          <FYSelector value={fy} onChange={setFy} />
          {role === "ca" && (
            <span className="bg-badge-amber text-badge-amber-text hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline">
              Read Only
            </span>
          )}
          <button
            onClick={logout}
            className="border-thin border-border bg-surface-muted text-text-secondary hover:border-accent-red hover:text-accent-red hidden rounded-md px-3 py-1 text-xs font-medium transition-colors sm:inline-flex"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="border-border bg-surface-card border-t px-4 pb-3 pt-1 sm:hidden">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-surface-muted text-text font-medium"
                    : "text-text-secondary hover:text-text"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <div className="border-border mt-2 border-t pt-2">
            {role === "ca" && (
              <span className="bg-badge-amber text-badge-amber-text mb-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium">
                Read Only
              </span>
            )}
            <button
              onClick={logout}
              className="border-thin border-border bg-surface-muted text-accent-red block w-full rounded-md px-3 py-2 text-left text-xs font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
