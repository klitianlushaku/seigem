"use client";

/**
 * Dashboard shell.
 *
 * Provides the persistent left rail and the top bar around every protected
 * page. On small screens the rail becomes a dismissible drawer so the layout
 * stays usable on a phone.
 */
import { useEffect, useState, type ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import { CloseIcon } from "@/components/ui/icons";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer on Escape, and lock body scroll while it is open.
  useEffect(() => {
    if (!drawerOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Mbyll menynë"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/70"
          />
          <div className="absolute inset-y-0 left-0 w-64">
            <button
              type="button"
              aria-label="Mbyll menynë"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-content"
            >
              <CloseIcon size={18} />
            </button>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 px-3 py-4 sm:px-4">{children}</main>
      </div>
    </div>
  );
}
