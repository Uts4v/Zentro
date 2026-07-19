// routes/merchant.shifts.$shiftId.report.tsx — Shift report with print/download
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { reportApi, type ShiftReportData } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Printer, Download } from "lucide-react";

export const Route = createFileRoute("/merchant/shift-report/$shiftId")({
  head: () => ({ meta: [{ title: "Shift Report · Zentro" }] }),
  component: ShiftReportPage,
});

function ShiftReportPage() {
  const { shiftId } = Route.useParams();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [report, setReport] = useState<ShiftReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    reportApi
      .getShiftReport(shiftId)
      .then(setReport)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [shiftId]);

  function handlePrint() {
    window.print();
  }

  async function handleDownload() {
    if (!reportRef.current || !report) return;
    setDownloading(true);
    try {
      const { domToPng } = await import("modern-screenshot");
      const dataUrl = await domToPng(reportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        timeout: 15000,
      });
      const link = document.createElement("a");
      link.download = `shift-report-${report.shift.opened_at.slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        {error || "Report not found"}
      </div>
    );
  }

  const { shift, summary, drops, orders, merchant_name, merchant_address, merchant_phone } = report;
  const expectedInDrawer =
    summary.opening_cash + summary.cash_sales + summary.cash_drops - summary.cash_payouts;

  const openedAt = new Date(shift.opened_at);
  const closedAt = shift.closed_at ? new Date(shift.closed_at) : null;
  const durationMs = closedAt ? closedAt.getTime() - openedAt.getTime() : Date.now() - openedAt.getTime();
  const durationHrs = Math.floor(durationMs / 3600000);
  const durationMins = Math.floor((durationMs % 3600000) / 60000);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/merchant/shifts" })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to shifts
        </button>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
          >
            <Printer className="h-3 w-3" />
            Print Report
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download PNG
          </button>
        </div>
      </div>

      {/* Report */}
      <div ref={reportRef} className="receipt glass rounded-2xl p-6">
        {/* Header */}
        <div className="border-b border-border pb-3 text-center">
          <h2 className="font-display text-xl text-ink">{merchant_name}</h2>
          {merchant_address && <p className="text-[10px] text-muted-foreground">{merchant_address}</p>}
          {merchant_phone && <p className="text-[10px] text-muted-foreground">Tel: {merchant_phone}</p>}
          <p className="mt-2 text-sm font-semibold text-ink">SHIFT REPORT</p>
        </div>

        {/* Shift info */}
        <div className="border-b border-border py-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opened by</span>
            <span className="text-ink">{shift.worker_name || shift.opener_name}</span>
          </div>
          {shift.closer_name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Closed by</span>
              <span className="text-ink">{shift.closer_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Opened at</span>
            <span className="text-ink">
              {openedAt.toLocaleDateString("en-NP")} {openedAt.toLocaleTimeString("en-NP", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {closedAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Closed at</span>
              <span className="text-ink">
                {closedAt.toLocaleDateString("en-NP")} {closedAt.toLocaleTimeString("en-NP", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="text-ink">{durationHrs}h {durationMins}m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-medium ${shift.status === "open" ? "text-emerald-600" : "text-muted-foreground"}`}>
              {shift.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Cash summary */}
        <div className="border-b border-border py-3 text-xs">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Cash Summary</p>
          <div className="space-y-1">
            <Row label="Opening cash" value={`NPR ${summary.opening_cash.toLocaleString()}`} />
            <Row label="Cash sales" value={`NPR ${summary.cash_sales.toLocaleString()}`} />
            <Row label="Cash drops" value={`+NPR ${summary.cash_drops.toLocaleString()}`} />
            <Row label="Cash payouts" value={`-NPR ${summary.cash_payouts.toLocaleString()}`} />
            <div className="border-t border-border pt-1 mt-1">
              <Row label="Expected in drawer" value={`NPR ${expectedInDrawer.toLocaleString()}`} bold />
            </div>
            {shift.closing_cash_actual != null && (
              <>
                <Row label="Actual counted" value={`NPR ${shift.closing_cash_actual.toLocaleString()}`} />
                <div className="border-t border-border pt-1 mt-1">
                  <Row
                    label="Difference"
                    value={`NPR ${(shift.cash_difference ?? 0).toLocaleString()}`}
                    bold
                    valueColor={
                      (shift.cash_difference ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sales breakdown */}
        <div className="border-b border-border py-3 text-xs">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Sales Breakdown</p>
          <div className="space-y-1">
            <Row label="Cash" value={`NPR ${summary.cash_sales.toLocaleString()}`} />
            <Row label="Fonepay" value={`NPR ${summary.fonepay_sales.toLocaleString()}`} />
            <Row label="Credit" value={`NPR ${summary.credit_charges.toLocaleString()}`} />
            <Row label="Split" value={`NPR ${summary.split_sales.toLocaleString()}`} />
            <div className="border-t border-border pt-1 mt-1">
              <Row label="Total orders" value={String(summary.total_orders)} bold />
              <Row label="Walk-in orders" value={String(summary.walk_in_orders)} />
              <Row label="Total revenue" value={`NPR ${summary.total_orders > 0 ? (summary.cash_sales + summary.fonepay_sales + summary.credit_charges + summary.split_sales).toLocaleString() : 0}`} bold />
            </div>
          </div>
        </div>

        {/* Cash movements */}
        {drops.length > 0 && (
          <div className="border-b border-border py-3 text-xs">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Cash Movements</p>
            <div className="space-y-1">
              {drops.map((d) => (
                <div key={d.id} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {d.direction === "drop" ? "+" : "-"}NPR {d.amount.toLocaleString()} — {d.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order list */}
        {orders.length > 0 && (
          <div className="py-3 text-xs">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Orders ({orders.length})
            </p>
            <div className="space-y-0.5">
              {orders.map((o) => (
                <div key={o.id} className="flex justify-between">
                  <span className="text-muted-foreground">
                    #{o.receipt_number || o.id.slice(0, 6)}
                    {o.walk_in_name ? ` — ${o.walk_in_name}` : ""}
                  </span>
                  <span className="text-ink">
                    NPR {o.total_amount.toLocaleString()}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({o.payment_method})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
          Generated {new Date().toLocaleString("en-NP")} · Powered by Zentro
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${valueColor ?? "text-ink"}`}>{value}</span>
    </div>
  );
}
