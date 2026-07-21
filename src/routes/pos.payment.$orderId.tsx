// routes/pos.payment.$orderId.tsx — Payment processing + inline receipt after payment
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { orderApi, type Order } from "@/lib/api";
import { posApi, creditApi, type CreditAccount, type ReceiptData } from "@/lib/pos-api";
import { Receipt } from "@/components/Receipt";
import { Loader2, ArrowLeft, Banknote, Smartphone, Split, CreditCard, Pencil, Check, X, Printer, Download, Plus } from "lucide-react";

export const Route = createFileRoute("/pos/payment/$orderId")({
  head: () => ({ meta: [{ title: "Payment · Zentro POS" }] }),
  component: PaymentPage,
});

type PaymentMethod = "cash" | "fonepay" | "split" | "credit";

function PaymentPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { merchantProfile } = useAuth();
  const merchant = merchantProfile;
  const receiptRef = useRef<HTMLDivElement>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [fonepayAmount, setFonepayAmount] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitFonepay, setSplitFonepay] = useState("");
  const [creditAccounts, setCreditAccounts] = useState<CreditAccount[]>([]);
  const [selectedCreditId, setSelectedCreditId] = useState<string>("");
  const [creditSearch, setCreditSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);

  // Receipt state — shown inline after payment
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const total = order ? Number(order.total_amount) : 0;
  const orderSubtotal = order?.order_items
    ? order.order_items.reduce((s, i) => s + Number(i.subtotal), 0)
    : total;
  const discountAmt = order?.discount_amount ? Number(order.discount_amount) : 0;

  // Fetch order
  useEffect(() => {
    (async () => {
      try {
        const data = await orderApi.get(orderId);
        setOrder(data);
        setFonepayAmount(String(Number(data.total_amount)));
        // If already paid, load receipt directly
        if (data.payment_status === "paid") {
          loadReceipt();
        }
      } catch {
        setError("Order not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  async function loadReceipt() {
    setLoadingReceipt(true);
    try {
      const data = await posApi.getReceipt(orderId);
      setReceipt(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load receipt");
    } finally {
      setLoadingReceipt(false);
    }
  }

  // Fetch credit accounts
  useEffect(() => {
    if (method === "credit" || method === "split") {
      creditApi.list().then(setCreditAccounts).catch(() => {});
    }
  }, [method]);

  const cashChange = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - total);
  }, [cashReceived, total]);

  const isCashSufficient = (parseFloat(cashReceived) || 0) >= total;

  const splitCovered =
    (parseFloat(splitCash) || 0) + (parseFloat(splitFonepay) || 0);
  const splitRemaining = Math.max(0, total - splitCovered);
  const splitChange = Math.max(0, splitCovered - total);

  const selectedCredit = creditAccounts.find((c) => c.id === selectedCreditId);
  const creditOverLimit =
    selectedCredit && selectedCredit.balance + total > selectedCredit.credit_limit;

  const filteredCreditAccounts = useMemo(() => {
    if (!creditSearch) return creditAccounts;
    const q = creditSearch.toLowerCase();
    return creditAccounts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [creditAccounts, creditSearch]);

  async function handleSaveDiscount() {
    if (!order) return;
    setSavingDiscount(true);
    try {
      const val = parseFloat(discountValue) || 0;
      const result = await posApi.updateOrderDiscount(
        order.id,
        val > 0 ? discountType : null,
        val > 0 ? val : null
      );
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              discount_type: result.discount_type as any,
              discount_value: result.discount_value,
              discount_amount: String(result.discount_amount),
              total_amount: String(result.total),
            }
          : prev
      );
      setEditingDiscount(false);
    } catch (err: any) {
      setError(err.message || "Failed to update discount");
    } finally {
      setSavingDiscount(false);
    }
  }

  async function handlePayment() {
    if (!order) return;
    setError(null);
    setSubmitting(true);

    try {
      let cashR = 0;
      let foneR = 0;
      let creditId: string | undefined;

      if (method === "cash") {
        cashR = parseFloat(cashReceived) || 0;
      } else if (method === "fonepay") {
        foneR = parseFloat(fonepayAmount) || total;
      } else if (method === "split") {
        cashR = parseFloat(splitCash) || 0;
        foneR = parseFloat(splitFonepay) || 0;
        creditId = selectedCreditId || undefined;
      } else if (method === "credit") {
        creditId = selectedCreditId;
      }

      await posApi.processPayment({
        orderId: order.id,
        paymentMethod: method,
        cashReceived: cashR,
        fonepayAmount: foneR,
        creditAccountId: creditId,
      });

      // Mark order as paid locally
      setOrder((prev) => prev ? { ...prev, payment_status: "paid" } : prev);

      // Load receipt inline
      await loadReceipt();
    } catch (err: any) {
      setError(err.message || "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

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
      link.download = `receipt-${receipt.receipt_number ?? orderId.slice(0, 8)}.png`;
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Order not found
      </div>
    );
  }

  // ── RECEIPT VIEW (after payment) ──────────────────────────────────────────
  if (receipt || loadingReceipt) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 print:space-y-0">
        <div className="no-print flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/pos" as any })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to orders
          </button>
          {receipt && (
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
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
                Download
              </button>
            </div>
          )}
        </div>

        {loadingReceipt && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {receipt && (
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
        )}

        <div className="no-print flex justify-center gap-3">
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

  // ── PAYMENT VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button
        onClick={() => navigate({ to: "/pos" as any })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to orders
      </button>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Order summary */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              Order #{order.receipt_number || order.id.slice(0, 8)}
            </p>
            <p className="mt-1 text-sm font-medium text-ink">
              {order.order_type === "dine_in"
                ? order.table_name_snapshot || "Table"
                : "Pickup"}{" "}
              · {order.order_type === "dine_in" ? "Dine-in" : "Pickup"}
            </p>
            {order.walk_in_name && (
              <p className="text-xs text-muted-foreground">
                {order.walk_in_name} (Walk-in)
              </p>
            )}
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
            {order.status.toUpperCase()}
          </span>
        </div>

        <div className="mt-4 space-y-1.5 border-t border-border pt-4">
          {order.order_items?.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-ink">
                {item.name} ×{item.quantity}
              </span>
              <span className="text-muted-foreground">
                NPR {Number(item.subtotal).toLocaleString()}
              </span>
            </div>
          ))}
          {discountAmt > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-emerald-600">
                Discount
                {order.discount_type === "percent"
                  ? ` (${order.discount_value}%)`
                  : ""}
              </span>
              <span className="font-medium text-emerald-600">
                -NPR {discountAmt.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-medium">
            <span className="text-ink">TOTAL</span>
            <span className="text-ink">NPR {total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Discount editor */}
      {!editingDiscount && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingDiscount(true);
              setDiscountType((order?.discount_type as "amount" | "percent") ?? "amount");
              setDiscountValue(order?.discount_value ? String(order.discount_value) : "");
            }}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
          >
            <Pencil className="h-3 w-3" />
            {discountAmt > 0 ? "Edit Discount" : "Add Discount"}
          </button>
        </div>
      )}
      {editingDiscount && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Apply Discount
          </p>
          <div className="mt-2 flex items-end gap-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => setDiscountType("amount")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  discountType === "amount"
                    ? "bg-ink text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-mist"
                }`}
              >
                NPR
              </button>
              <button
                onClick={() => setDiscountType("percent")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  discountType === "percent"
                    ? "bg-ink text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-mist"
                }`}
              >
                %
              </button>
            </div>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "amount" ? "NPR" : "%"}
              className="flex-1 h-9 rounded-lg bg-mist px-3 text-xs text-ink outline-none focus:ring-2 focus:ring-ember/40"
            />
            <button
              onClick={() => setEditingDiscount(false)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-mist"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleSaveDiscount}
              disabled={savingDiscount}
              className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingDiscount ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Payment method selector */}
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { key: "cash", label: "Cash", icon: Banknote },
            { key: "fonepay", label: "Fonepay", icon: Smartphone },
            { key: "split", label: "Split", icon: Split },
            { key: "credit", label: "Credit", icon: CreditCard },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMethod(key)}
            className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-colors ${
              method === key
                ? "bg-ink text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-mist"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Payment forms */}
      <div className="glass rounded-2xl p-5">
        {method === "cash" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">Cash Payment</h3>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </label>
              <p className="mt-1 text-lg font-medium text-ink">
                NPR {total.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Cash received
              </label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
              <div className="mt-2 flex gap-2">
                {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, 1000].map(
                  (amt) => (
                    <button
                      key={amt}
                      onClick={() => setCashReceived(String(amt))}
                      className="rounded-lg bg-mist px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      {amt}
                    </button>
                  )
                )}
              </div>
            </div>
            {cashReceived && (
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Change
                </label>
                <p
                  className={`mt-1 text-lg font-medium ${
                    isCashSufficient ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  NPR {cashChange.toLocaleString()}
                </p>
                {!isCashSufficient && (
                  <p className="text-xs text-rose-500">Amount insufficient</p>
                )}
              </div>
            )}
          </div>
        )}

        {method === "fonepay" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">Fonepay Payment</h3>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </label>
              <p className="mt-1 text-lg font-medium text-ink">
                NPR {total.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Fonepay amount
              </label>
              <input
                type="number"
                value={fonepayAmount}
                onChange={(e) => setFonepayAmount(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
          </div>
        )}

        {method === "split" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">Split Payment</h3>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </label>
              <p className="mt-1 text-lg font-medium text-ink">
                NPR {total.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Fonepay
              </label>
              <input
                type="number"
                value={splitFonepay}
                onChange={(e) => setSplitFonepay(e.target.value)}
                placeholder="0"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Cash
              </label>
              <input
                type="number"
                value={splitCash}
                onChange={(e) => setSplitCash(e.target.value)}
                placeholder="0"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Covered so far</span>
              <span className="font-medium text-ink">
                NPR {splitCovered.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Remaining</span>
              <span
                className={`font-medium ${
                  splitRemaining === 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                NPR {splitRemaining.toLocaleString()}
              </span>
            </div>
            {splitCovered > total && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Change</span>
                <span className="font-medium text-emerald-600">
                  NPR {splitChange.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}

        {method === "credit" && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-ink">
              Charge to Credit Account
            </h3>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Search credit account
              </label>
              <input
                type="text"
                value={creditSearch}
                onChange={(e) => setCreditSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {filteredCreditAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedCreditId(acc.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                    selectedCreditId === acc.id
                      ? "bg-ink text-primary-foreground"
                      : "hover:bg-mist"
                  }`}
                >
                  <div>
                    <p className="font-medium">{acc.full_name}</p>
                    <p className="opacity-60">
                      NPR {acc.balance.toLocaleString()} / NPR{" "}
                      {acc.credit_limit.toLocaleString()}
                    </p>
                  </div>
                  {acc.balance + total > acc.credit_limit && (
                    <span className="text-[10px] text-rose-400">Near limit</span>
                  )}
                </button>
              ))}
            </div>
            {selectedCredit && (
              <div className="rounded-xl bg-mist p-3 text-xs space-y-1">
                <p className="font-medium text-ink">{selectedCredit.full_name}</p>
                <p>
                  Current balance: NPR {selectedCredit.balance.toLocaleString()}{" "}
                  owed
                </p>
                <p>This charge: NPR {total.toLocaleString()}</p>
                <p>
                  New balance: NPR{" "}
                  {(selectedCredit.balance + total).toLocaleString()}
                </p>
                <p>Limit: NPR {selectedCredit.credit_limit.toLocaleString()}</p>
                <p>
                  Remaining limit: NPR{" "}
                  {(
                    selectedCredit.credit_limit -
                    selectedCredit.balance -
                    total
                  ).toLocaleString()}
                </p>
                {creditOverLimit && (
                  <p className="text-rose-600">
                    This charge exceeds {selectedCredit.full_name}'s credit limit
                    of NPR {selectedCredit.credit_limit.toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Process button */}
      <button
        onClick={handlePayment}
        disabled={
          submitting ||
          (method === "cash" && !isCashSufficient) ||
          (method === "split" && splitCovered < total) ||
          (method === "credit" && (!selectedCreditId || creditOverLimit))
        }
        className="grid h-14 w-full place-items-center rounded-2xl bg-ink text-sm font-medium text-primary-foreground shadow-ember transition-all hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Process Payment"
        )}
      </button>
    </div>
  );
}
