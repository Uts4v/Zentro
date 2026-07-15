// routes/pos.bill.$orderId.tsx — Pre-payment bill/invoice with discount editing and print
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { posApi } from "@/lib/pos-api";
import {
  Loader2,
  ArrowLeft,
  Printer,
  CreditCard,
  Pencil,
  Check,
  X,
  Store,
} from "lucide-react";

export const Route = createFileRoute("/pos/bill/$orderId")({
  head: () => ({ meta: [{ title: "Bill · Zentro POS" }] }),
  component: BillPage,
});

interface BillData {
  order_id: string;
  receipt_number: string | null;
  merchant_name: string;
  merchant_address: string | null;
  merchant_phone: string | null;
  merchant_logo: string | null;
  order_type: string;
  table_name: string | null;
  cashier_name: string;
  is_walk_in: boolean;
  walk_in_name: string | null;
  customer_name: string | null;
  items: { name: string; quantity: number; price: number; subtotal: number }[];
  subtotal: number;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  discount_amount: number;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

function BillPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const billRef = useRef<HTMLDivElement>(null);

  const [bill, setBill] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Discount editing state
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<"amount" | "percent">(
    "amount"
  );
  const [discountValue, setDiscountValue] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);

  const fetchBill = useCallback(async () => {
    try {
      const data = await posApi.getOrderForBill(orderId);
      setBill(data);
      if (data.discount_type) setDiscountType(data.discount_type);
      if (data.discount_value) setDiscountValue(String(data.discount_value));
    } catch {
      setError("Order not found");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchBill();
  }, [fetchBill]);

  function handlePrint() {
    window.print();
  }

  async function handleSaveDiscount() {
    if (!bill) return;
    setSavingDiscount(true);
    try {
      const val = parseFloat(discountValue) || 0;
      const result = await posApi.updateOrderDiscount(
        bill.order_id,
        val > 0 ? discountType : null,
        val > 0 ? val : null
      );
      setBill((prev) =>
        prev
          ? {
              ...prev,
              discount_type: result.discount_type as "amount" | "percent" | null,
              discount_value: result.discount_value,
              discount_amount: result.discount_amount,
              total: result.total,
              subtotal: result.subtotal,
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

  function handleStartEditDiscount() {
    setEditingDiscount(true);
    setDiscountType(bill?.discount_type ?? "amount");
    setDiscountValue(bill?.discount_value ? String(bill.discount_value) : "");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        {error || "Order not found"}
      </div>
    );
  }

  const isUnpaid = bill.payment_status !== "paid";
  const discountPct =
    bill.discount_type === "percent" && bill.discount_value
      ? bill.discount_value
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Non-print header */}
      <div className="no-print flex items-center justify-between">
        <button
          onClick={() => navigate({ to: "/pos" as any })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </button>
        <div className="flex gap-2">
          {isUnpaid && (
            <button
              onClick={handleStartEditDiscount}
              disabled={editingDiscount}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
              {bill.discount_amount > 0 ? "Edit Discount" : "Add Discount"}
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
          >
            <Printer className="h-3 w-3" />
            Print Bill
          </button>
          {isUnpaid && (
            <button
              onClick={() =>
                navigate({
                  to: `/pos/payment/${bill.order_id}` as any,
                })
              }
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <CreditCard className="h-3 w-3" />
              Pay Now
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="no-print rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Discount editor */}
      {editingDiscount && (
        <div className="no-print glass rounded-2xl p-5">
          <h3 className="text-sm font-medium text-ink">Apply Discount</h3>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Type
              </label>
              <div className="mt-1.5 flex gap-2">
                <button
                  onClick={() => setDiscountType("amount")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    discountType === "amount"
                      ? "bg-ink text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-mist"
                  }`}
                >
                  Amount (NPR)
                </button>
                <button
                  onClick={() => setDiscountType("percent")}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    discountType === "percent"
                      ? "bg-ink text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-mist"
                  }`}
                >
                  Percent (%)
                </button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {discountType === "amount" ? "Amount (NPR)" : "Percent (%)"}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "amount" ? "NPR" : "%"}
                min="0"
                max={discountType === "percent" ? 100 : undefined}
                className="mt-1.5 h-10 w-full rounded-xl bg-mist px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <button
                onClick={() => {
                  setEditingDiscount(false);
                  setDiscountValue(
                    bill.discount_value ? String(bill.discount_value) : ""
                  );
                }}
                className="grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-mist"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={handleSaveDiscount}
                disabled={savingDiscount}
                className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingDiscount ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable bill */}
      <div ref={billRef} className="receipt glass rounded-2xl p-6 print-preserve">
        {/* Merchant header */}
        <div className="border-b border-border pb-4 text-center">
          {bill.merchant_logo ? (
            <img
              src={bill.merchant_logo}
              alt={bill.merchant_name}
              className="mx-auto h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
          )}
          <h2 className="font-display mt-2 text-2xl text-ink">
            {bill.merchant_name}
          </h2>
          {bill.merchant_address && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {bill.merchant_address}
            </p>
          )}
          {bill.merchant_phone && (
            <p className="text-xs text-muted-foreground">
              {bill.merchant_phone}
            </p>
          )}
        </div>

        {/* Bill info */}
        <div className="border-b border-border py-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Bill #{bill.receipt_number || bill.order_id.slice(0, 8)}</span>
            <span>
              {new Date(bill.created_at).toLocaleDateString("en-NP", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>
              {bill.order_type === "dine_in" ? "Dine-in" : bill.order_type === "delivery" ? "Delivery" : "Pickup"}
              {bill.table_name ? ` · ${bill.table_name}` : ""}
            </span>
            <span>Cashier: {bill.cashier_name}</span>
          </div>
          {(bill.walk_in_name || bill.customer_name) && (
            <div className="mt-1 flex justify-between">
              <span>Customer</span>
              <span className="font-medium text-ink">
                {bill.walk_in_name || bill.customer_name}
              </span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="border-b border-border py-3">
          <div className="mb-2 flex text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Item</span>
            <span className="w-12 text-center">Qty</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-20 text-right">Amount</span>
          </div>
          {bill.items.map((item, i) => (
            <div key={i} className="flex items-center py-1 text-xs">
              <span className="flex-1 font-medium text-ink">{item.name}</span>
              <span className="w-12 text-center text-muted-foreground">
                {item.quantity}
              </span>
              <span className="w-20 text-right text-muted-foreground">
                NPR {item.price.toLocaleString()}
              </span>
              <span className="w-20 text-right font-medium text-ink">
                NPR {item.subtotal.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="space-y-1.5 border-b border-border py-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-ink">NPR {bill.subtotal.toLocaleString()}</span>
          </div>
          {bill.discount_amount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-emerald-600">
                Discount
                {bill.discount_type === "percent" && bill.discount_value
                  ? ` (${bill.discount_value}%)`
                  : ""}
              </span>
              <span className="font-medium text-emerald-600">
                -NPR {bill.discount_amount.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span className="text-ink">TOTAL</span>
            <span className="text-ink">NPR {bill.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 text-center text-[10px] text-muted-foreground">
          {isUnpaid ? (
            <p className="font-medium text-amber-600">NOT YET PAID</p>
          ) : (
            <p className="font-medium text-emerald-600">PAID</p>
          )}
          <p className="mt-1">Thank you for your visit!</p>
          <p className="mt-0.5">Powered by Zentro</p>
        </div>
      </div>

      {/* Bottom actions (non-print) */}
      <div className="no-print flex gap-2">
        {isUnpaid && (
          <button
            onClick={() =>
              navigate({
                to: `/pos/payment/${bill.order_id}` as any,
              })
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Pay Now — NPR {bill.total.toLocaleString()}
          </button>
        )}
      </div>
    </div>
  );
}
