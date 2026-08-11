// routes/pos.retail-bill.$orderId.tsx — Retail counter-sale receipt + print
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { posApi } from "@/lib/pos-api";
import { Loader2, ArrowLeft, Printer, Store, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/pos/retail-bill/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    method: (search.method as "cash" | "fonepay") || "cash",
    received: Number(search.received) || 0,
    change: Number(search.change) || 0,
  }),
  head: () => ({ meta: [{ title: "Retail Receipt · Zentro POS" }] }),
  component: RetailBillPage,
});

interface RetailBillData {
  order_id: string;
  receipt_number: string;
  merchant_name: string;
  merchant_address: string | null;
  merchant_phone: string | null;
  merchant_logo: string | null;
  items: { name: string; quantity: number; price: number; subtotal: number }[];
  subtotal: number;
  total: number;
  created_at: string;
  notes: string | null;
}

function RetailBillPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { method, received, change } = useSearch({ from: "/pos/retail-bill/$orderId" });

  const [bill, setBill] = useState<RetailBillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await posApi.getRetailOrderForBill(orderId);
        setBill(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Receipt not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  function handlePrint() {
    window.print();
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
        {error || "Receipt not found"}
      </div>
    );
  }

  const customerName = bill.notes?.match(/Customer:\s*(.+)/)?.[1]?.trim() ?? null;

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
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-mist"
          >
            <Printer className="h-3 w-3" />
            Print Receipt
          </button>
          <Link
            to="/pos/orders/retail"
            className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ShoppingBag className="h-3 w-3" />
            New Retail Sale
          </Link>
        </div>
      </div>

      {error && (
        <div className="no-print rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Printable receipt */}
      <div className="receipt glass rounded-2xl p-6 print-preserve">
        {/* Merchant header */}
        <div className="border-b border-border pb-4 text-center">
          {bill.merchant_logo ? (
            <img
              src={bill.merchant_logo}
              alt="Bill"
              className="mx-auto h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
          )}
          <h2 className="font-display mt-2 text-2xl text-ink">{bill.merchant_name}</h2>
          <p className="mt-0.5 text-xs font-medium text-ink">Retail Sale Receipt</p>
          {bill.merchant_address && (
            <p className="mt-0.5 text-xs text-muted-foreground">{bill.merchant_address}</p>
          )}
          {bill.merchant_phone && (
            <p className="text-xs text-muted-foreground">{bill.merchant_phone}</p>
          )}
        </div>

        {/* Receipt info */}
        <div className="border-b border-border py-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Receipt #{bill.receipt_number}</span>
            <span>
              {new Date(bill.created_at).toLocaleDateString("en-NP", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}{" "}
              {new Date(bill.created_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Counter sale</span>
            <span className="font-medium text-ink">{method === "cash" ? "Cash" : "Fonepay"}</span>
          </div>
          {customerName && (
            <div className="mt-1 flex justify-between">
              <span>Customer</span>
              <span className="font-medium text-ink">{customerName}</span>
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
              <span className="w-12 text-center text-muted-foreground">{item.quantity}</span>
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
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span className="text-ink">TOTAL</span>
            <span className="text-ink">NPR {bill.total.toLocaleString()}</span>
          </div>
          {method === "cash" && received > 0 && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cash received</span>
                <span className="text-ink">NPR {received.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Change</span>
                <span className="font-medium text-ink">NPR {change.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 text-center text-[10px] text-muted-foreground">
          <p className="font-medium text-emerald-600">PAID</p>
          <p className="mt-1">Thank you for shopping with us!</p>
          <p className="mt-0.5">Powered by Zentro</p>
        </div>
      </div>
    </div>
  );
}
