// routes/pos.credit.tsx — Credit accounts (POS view for managers)
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  creditApi,
  type CreditAccount,
  type CreditTransaction,
} from "@/lib/pos-api";
import {
  Loader2,
  ArrowLeft,
  Search,
  Plus,
  Eye,
  CreditCard,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";

export const Route = createFileRoute("/pos/credit")({
  head: () => ({ meta: [{ title: "Credit Accounts · Zentro POS" }] }),
  component: CreditPage,
});

function CreditPage() {
  const { merchantProfile } = useAuth();
  const navigate = useNavigate();
  const merchant = merchantProfile;

  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // New account modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLimit, setNewLimit] = useState("5000");
  const [newNotes, setNewNotes] = useState("");

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "fonepay">("cash");
  const [payNotes, setPayNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Fetch accounts
  useEffect(() => {
    if (!merchant) return;
    creditApi
      .list()
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [merchant]);

  // Filtered accounts
  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) ||
        a.phone?.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  // View account details
  async function viewAccount(acc: CreditAccount) {
    setSelectedAccount(acc);
    setTxLoading(true);
    try {
      const txs = await creditApi.getTransactions(acc.id);
      setTransactions(txs);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }

  // Create account
  async function handleCreateAccount() {
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const acc = await creditApi.create({
        full_name: newName,
        phone: newPhone || undefined,
        email: newEmail || undefined,
        credit_limit: parseFloat(newLimit) || 5000,
        notes: newNotes || undefined,
      });
      setAccounts((prev) => [...prev, acc]);
      setShowNewModal(false);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewLimit("5000");
      setNewNotes("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Record payment
  async function handleRecordPayment() {
    if (!selectedAccount) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setError("Amount must be positive");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const newBalance = await creditApi.recordPayment(
        selectedAccount.id,
        amt,
        payNotes || undefined
      );
      setSelectedAccount({ ...selectedAccount, balance: newBalance });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === selectedAccount.id ? { ...a, balance: newBalance } : a
        )
      );
      setShowPayModal(false);
      setPayAmount("");
      setPayNotes("");
      // Refresh transactions
      const txs = await creditApi.getTransactions(selectedAccount.id);
      setTransactions(txs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Account detail view
  if (selectedAccount) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button
          onClick={() => setSelectedAccount(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to credit accounts
        </button>

        {error && (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="glass rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-2xl text-ink">
                {selectedAccount.full_name}
              </h2>
              {selectedAccount.phone && (
                <p className="text-xs text-muted-foreground">
                  {selectedAccount.phone}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                setShowPayModal(true);
                setPayAmount(String(selectedAccount.balance));
              }}
              className="rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Record Payment
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat
              label="Credit limit"
              value={`NPR ${selectedAccount.credit_limit.toLocaleString()}`}
            />
            <Stat
              label="Current balance"
              value={`NPR ${selectedAccount.balance.toLocaleString()}`}
            />
            <Stat
              label="Available credit"
              value={`NPR ${(
                selectedAccount.credit_limit - selectedAccount.balance
              ).toLocaleString()}`}
            />
            <Stat
              label="Usage"
              value={`${Math.round(
                (selectedAccount.balance / selectedAccount.credit_limit) * 100
              )}%`}
            />
          </div>
        </div>

        {/* Transaction history */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-medium text-ink">Transaction History</h3>
          {txLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No transactions yet
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {transactions.map((tx) => {
                const isExpanded = expandedTxId === tx.id;
                const hasOrder = tx.type === "charge" && tx.order;
                return (
                  <div key={tx.id}>
                    <div
                      className={`flex items-center justify-between rounded-xl bg-mist px-3 py-2 text-xs ${hasOrder ? "cursor-pointer hover:bg-mist/80" : ""}`}
                      onClick={() => {
                        if (hasOrder) {
                          setExpandedTxId(isExpanded ? null : tx.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${
                            tx.type === "charge" ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {tx.type === "charge" ? "+" : "−"}NPR{" "}
                          {tx.amount.toLocaleString()}
                        </span>
                        {tx.order?.receipt_number && (
                          <span className="flex items-center gap-0.5 rounded bg-mist px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Receipt className="h-2.5 w-2.5" />
                            {tx.order.receipt_number}
                          </span>
                        )}
                        {tx.notes && (
                          <span className="text-muted-foreground">
                            {tx.notes}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString("en-CA")}
                        </span>
                        {hasOrder && (
                          isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )
                        )}
                      </div>
                    </div>
                    {isExpanded && tx.order && (
                      <div className="ml-3 mt-1 rounded-lg border border-border bg-white/50 px-3 py-2 text-xs">
                        <div className="mb-1.5 flex items-center justify-between text-muted-foreground">
                          <span>
                            {tx.order.order_type === "dine_in"
                              ? `Dine-in${tx.order.table_name_snapshot ? ` · ${tx.order.table_name_snapshot}` : ""}`
                              : tx.order.order_type === "delivery"
                                ? "Delivery"
                                : "Pickup"}
                            {tx.order.walk_in_name && ` · ${tx.order.walk_in_name}`}
                          </span>
                          <span>
                            {new Date(tx.order.created_at).toLocaleString("en-CA", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {tx.order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <span className="text-ink">
                                {item.quantity}× {item.name}
                              </span>
                              <span className="text-muted-foreground">
                                NPR {item.subtotal.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 font-medium text-ink">
                          <span>Total</span>
                          <span>NPR {tx.order.total_amount.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment modal */}
        {showPayModal && (
          <Modal onClose={() => setShowPayModal(false)}>
            <h3 className="font-display text-xl text-ink">
              Record Payment — {selectedAccount.full_name}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Current balance
                </label>
                <p className="mt-1 text-lg font-medium text-ink">
                  NPR {selectedAccount.balance.toLocaleString()} owed
                </p>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Payment amount
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                />
                <button
                  onClick={() => setPayAmount(String(selectedAccount.balance))}
                  className="mt-1.5 text-xs text-ember hover:underline"
                >
                  Pay full balance: NPR {selectedAccount.balance.toLocaleString()}
                </button>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Payment method
                </label>
                <div className="mt-1.5 flex gap-2">
                  {(["cash", "fonepay"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPayMethod(m)}
                      className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-medium capitalize transition-colors ${
                        payMethod === m
                          ? "bg-ink text-primary-foreground"
                          : "border border-border text-muted-foreground hover:bg-mist"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Notes
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="paid in cash on Sunday visit"
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
                />
              </div>
              {payAmount && (
                <div>
                  <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    New balance after payment
                  </label>
                  <p className="mt-1 text-lg font-medium text-emerald-600">
                    NPR{" "}
                    {Math.max(
                      0,
                      selectedAccount.balance - (parseFloat(payAmount) || 0)
                    ).toLocaleString()}
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={submitting || !payAmount}
                  className="flex-1 rounded-xl bg-ink py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    "Confirm Payment"
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // Account list view
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button
        onClick={() => navigate({ to: "/pos" as any })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to orders
      </button>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Credit Accounts</h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Account
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="h-10 w-full rounded-xl bg-mist pl-9 pr-3 text-xs text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
        />
      </div>

      {error && (
        <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((acc) => {
          const usage = (acc.balance / acc.credit_limit) * 100;
          const nearLimit = usage > 80;
          const atLimit = acc.balance >= acc.credit_limit;
          return (
            <div key={acc.id} className="glass flex items-center justify-between rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-ink">{acc.full_name}</p>
                  {atLimit && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                      At limit
                    </span>
                  )}
                  {nearLimit && !atLimit && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      Near limit
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  NPR {acc.balance.toLocaleString()} / NPR{" "}
                  {acc.credit_limit.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => viewAccount(acc)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-mist"
                >
                  View
                </button>
                <button
                  onClick={() => {
                    setSelectedAccount(acc);
                    setShowPayModal(true);
                    setPayAmount(String(acc.balance));
                  }}
                  className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Pay
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No credit accounts found
          </p>
        )}
      </div>

      {/* New Account Modal */}
      {showNewModal && (
        <Modal onClose={() => setShowNewModal(false)}>
          <h3 className="font-display text-xl text-ink">New Credit Account</h3>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Customer name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Phone
              </label>
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Email (optional)
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Credit limit
              </label>
              <input
                type="number"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Notes
              </label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="regular customer, pays every Sunday"
                className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAccount}
                disabled={submitting || !newName.trim()}
                className="flex-1 rounded-xl bg-ink py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-mist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
