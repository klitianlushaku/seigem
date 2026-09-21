"use client";

/**
 * Dashboard top bar.
 *
 * Right-aligned notification button and the account menu, matching the
 * approved design. The account menu carries the logout action.
 *
 * Both popovers close on outside click and on Escape.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { BellIcon, ChevronDownIcon, MenuIcon } from "@/components/ui/icons";

/** Derives up to two initials for the avatar. */
function initialsFor(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";

  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

/**
 * The name the greeting addresses the user by.
 *
 * The first token of the display name is used, falling back to the local part
 * of the email so a user who never set a name is still greeted personally.
 * Returns "" when neither is available, and the caller drops the comma.
 */
function firstNameFor(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "";
  return source.split(/[\s@._-]+/).filter(Boolean)[0] ?? "";
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, signOut, pending } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const loginHref = `/login?next=${encodeURIComponent("/dashboard")}`;

  const containerRef = useRef<HTMLDivElement>(null);

  // Close both popovers on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !noticesOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setNoticesOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setNoticesOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, noticesOpen]);

  const displayName = user?.displayName ?? null;
  const email = user?.email ?? null;
  const firstName = firstNameFor(displayName, email);

  // The greeting belongs to the dashboard itself. Other pages in the shell keep
  // the header to the account controls, which is what their own headings expect.
  const isDashboard = pathname === "/dashboard";

  return (
    <header className="dash-panel flex shrink-0 flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile: open the navigation drawer. Hidden once the rail is visible. */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Hap menynë"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-content lg:hidden"
        >
          <MenuIcon size={20} />
        </button>

        {isDashboard ? (
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              {/*
                A visitor who is not signed in has not been here before, so
                "welcome back" is wrong for them. They get a plain welcome and
                an invitation instead.
              */}
              {user
                ? `Mirë se u ktheve${firstName ? `, ${firstName}` : ""} 👋`
                : "Mirë se vjen në Seigem 👋"}
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted">
              {user
                ? "Sot është një ditë e mirë për të mësuar diçka të re."
                : "Shiko më poshtë si funksionon — pastaj provoje vetë."}
            </p>
          </div>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="ml-auto flex items-center gap-3 sm:gap-4"
      >
        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNoticesOpen((open) => !open);
              setMenuOpen(false);
            }}
            aria-haspopup="true"
            aria-expanded={noticesOpen}
            aria-label="Njoftime"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-content"
          >
            <BellIcon size={19} />
          </button>

          {noticesOpen ? (
            <div
              role="dialog"
              aria-label="Njoftime"
              className="dash-panel absolute right-0 z-20 mt-2 w-64 rounded-xl p-4 text-sm"
            >
              <p className="font-medium">Njoftime</p>
              <p className="mt-1 text-xs text-muted">
                Nuk ka njoftime të reja.
              </p>
            </div>
          ) : null}
        </div>

        {/* Account menu: avatar, name, optional email underneath. */}
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setNoticesOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-surface-2"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                {initialsFor(displayName, email)}
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-[12rem] truncate text-sm font-medium leading-4">
                  {displayName ?? "Llogaria"}
                </span>
                {email ? (
                  <span className="block max-w-[12rem] truncate text-[11px] leading-4 text-muted">
                    {email}
                  </span>
                ) : null}
              </span>
              <ChevronDownIcon size={16} />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="dash-panel absolute right-0 z-20 mt-2 w-64 rounded-xl p-2"
              >
                <div className="border-b border-line px-3 pb-2 pt-1">
                  {displayName ? (
                    <p className="truncate text-sm font-medium">{displayName}</p>
                  ) : null}
                  {email ? (
                    <p className="truncate text-xs text-muted">{email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  disabled={pending}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-content disabled:opacity-60"
                >
                  {pending ? "Duke u shkëputur…" : "Shkëputu"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-soft"
          >
            Hyr
          </Link>
        )}

        {/* Today's quota, shown on the right as in the reference. */}
        <p className="hidden text-right text-[11px] leading-4 text-muted xl:block">
          Mëso sot,
          <br />
          ndërto nesër
        </p>
      </div>
    </header>
  );
}
