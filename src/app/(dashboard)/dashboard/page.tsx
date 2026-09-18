"use client";

/**
 * `/dashboard` — the single screen the app opens on.
 *
 * There is no separate landing page; unauthenticated visitors are redirected to
 * /login by the layout guard, and everyone else lands here.
 */
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default function DashboardPage() {
  return <DashboardOverview />;
}
