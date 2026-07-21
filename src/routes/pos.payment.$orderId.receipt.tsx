// routes/pos.payment.$orderId.receipt.tsx — Receipt view + print screen
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { posApi, type ReceiptData } from "@/lib/pos-api";
import { Receipt } from "@/components/Receipt";
import { Loader2, ArrowLeft, Printer, Download, MessageCircle, Plus } from "lucide-react";

export const Route = createFileRoute("/pos/payment/$orderId/receipt")({
  head: () => ({ meta: [{ title: "Receipt · Zentro POS" }] }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await posApi.getReceipt(orderId);
        setReceipt(data);
      } catch (err: any) {
        setError(err?.message || "Failed to load receipt");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  function handlePrint() {
    window.print();
  }

  async function handleDownload() {
    if (!receiptRef.current || !receipt) return;
    setDownloading(true);
    try {
      const { domToPng } = await import("modern-screenshot");
      const dataUrl = await domToPng(receiptRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        timeout: 15000,
      });
      const link = document.createElement("a");
      link.download = `receipt-${receipt.receipt_number ?? receipt.order_id.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  }

  function handleWhatsApp() {
    if (!receipt) return;
    const text = `Receipt ${receipt.receipt_number} — NPR ${receipt.total.toLocaleString()} — Thank you!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <p>{error || "Receipt not found"}</p>
        <button
          onClick={() => navigate({ to: "/pos" as any })}
          className="mt-4 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-primary-foreground"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 print:space-y-0">
      {/* Action buttons — hidden when printing */}
      <div className="no-print flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/pos" as any })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </button>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Receipt
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download PNG
          </button>
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </button>
        </div>
      </div>

      {/* Receipt preview */}
      <div className="flex justify-center print:justify-start">
        <div ref={receiptRef} className="print:m-0 print:p-0">
          <Receipt
            receiptNumber={receipt.receipt_number}
            billType={receipt.payment_method === "credit" ? "Credit Bill" : "Order Bill"}
            merchantAddress={receipt.merchant_address ?? undefined}
            merchantPhone={receipt.merchant_phone ?? undefined}
            merchantLogo={receipt.merchant_logo}
            orderType={receipt.order_type as "dine_in" | "pickup"}
            tableName={receipt.table_name}
            roomName={receipt.room_name}
            cashierName={receipt.cashier_name}
            isWalkIn={receipt.is_walk_in}
            walkInName={receipt.walk_in_name ?? undefined}
            customerName={receipt.customer_name ?? undefined}
            items={receipt.items}
            subtotal={receipt.discount_amount ? receipt.total + receipt.discount_amount : receipt.total}
            total={receipt.total}
            paymentMethod={receipt.payment_method}
            cashReceived={receipt.cash_received}
            fonepayAmount={receipt.fonepay_amount}
            creditAccountName={receipt.customer_name ?? undefined}
            changeGiven={receipt.change}
            paidAt={receipt.paid_at}
            loyaltyPointsEarned={receipt.loyalty_points_earned ?? undefined}
            loyaltyTotalBalance={receipt.loyalty_total_balance ?? undefined}
            discountType={receipt.discount_type}
            discountValue={receipt.discount_value}
            discountAmount={receipt.discount_amount}
          />
        </div>
      </div>

      {/* Navigation buttons — hidden when printing */}
      <div className="no-print flex justify-center gap-3 print:hidden">
        <Link
          to="/pos"
          className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Orders
        </Link>
        <Link
          to="/pos/orders/new"
          search={{ type: "walk_in" }}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Order
        </Link>
      </div>
    </div>
  );
}
