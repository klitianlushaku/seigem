import { cn } from "@/lib/utils/cn";

export function Toast({
  children,
  tone = "info",
  onDismiss,
}: {
  children: React.ReactNode;
  tone?: "error" | "success" | "info";
  onDismiss: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "fixed bottom-4 right-4 z-50 flex w-[min(25rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl",
        tone === "error"
          ? "border-danger/50 bg-danger text-white"
          : tone === "success"
            ? "border-success/50 bg-success text-ink"
            : "border-line-strong bg-surface text-content",
      )}
    >
      <span className="min-w-0 flex-1 leading-5">{children}</span>
      <button
        type="button"
        aria-label="Mbyll njoftimin"
        onClick={onDismiss}
        className="shrink-0 text-lg leading-5 opacity-80 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}