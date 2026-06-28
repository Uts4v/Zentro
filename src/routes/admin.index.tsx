import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Dashboard
      </p>
      <h1 className="font-display mt-2 text-4xl text-ink">Overview</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Welcome to the Zentro admin panel.
      </p>
    </div>
  );
}