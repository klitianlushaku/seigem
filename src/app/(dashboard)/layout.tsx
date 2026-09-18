/**
 * Public dashboard shell.
 *
 * The dashboard itself is visible to guests, but actions that require an
 * authenticated session (such as uploading material or managing the account)
 * redirect the user to /login when they actually try to use them.
 */
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
