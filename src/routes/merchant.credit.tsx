// routes/merchant.credit.tsx — Credit accounts management (merchant view)
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
  Pencil,
  Trash2,
  Eye,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Receipt,
} from "lucide-react";

export const Route = createFileRoute("/merchant/credit")({
  head: () => ({ meta: [{ title: "Credit Accounts · Merchant" }] }),
  component: MerchantCredit,
});

function MerchantCredit() {
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

  // Edit account modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
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

  // Summary stats
  const summary = useMemo(() => {
    const totalOutstanding = accounts.reduce((s, a) => s + a.balance, 0);
    const totalLimit = accounts.reduce((s, a) => s + a.credit_limit, 0);
    const nearLimit = accounts.filter((a) => {
      if (a.credit_limit === 0) return false;
      const usage = (a.balance / a.credit_limit) * 100;
      return usage > 80 && a.balance < a.credit_limit;
    }).length;
    const atLimit = accounts.filter((a) => a.balance >= a.credit_limit).length;
    return { totalOutstanding, totalLimit, nearLimit, atLimit };
  }, [accounts]);

  // Filtered accounts
  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) =>
        a.full_name.toLowerCase().includes(q) ||
        a.phone?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q)
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

  // Open edit modal
  function openEditModal(acc: CreditAccount) {
    setEditName(acc.full_name);
    setEditPhone(acc.phone ?? "");
    setEditEmail(acc.email ?? "");
    setEditLimit(String(acc.credit_limit));
    setEditNotes(acc.notes ?? "");
    setShowEditModal(true);
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
      resetNewForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Edit account
  async function handleEditAccount() {
    if (!selectedAccount) return;
    if (!editName.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await creditApi.update(selectedAccount.id, {
        full_name: editName,
        phone: editPhone || undefined,
        email: editEmail || undefined,
        credit_limit: parseFloat(editLimit) || 5000,
        notes: editNotes || undefined,
      });
      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a))
      );
      setSelectedAccount(updated);
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Delete account
  async function handleDeleteAccount(acc: CreditAccount) {
    if (acc.balance !== 0) return;
    if (!confirm(`Delete credit account for ${acc.full_name}? This cannot be undone.`)) return;
    setError(null);
    setSubmitting(true);
    try {
      await creditApi.delete(acc.id);
      setAccounts((prev) => prev.filter((a) => a.id !== acc.id));
      setSelectedAccount(null);
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
      const updated = { ...selectedAccount, balance: newBalance };
      setSelectedAccount(updated);
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === selectedAccount.id ? { ...a, balance: newBalance } : a
        )
      );
      setShowPayModal(false);
      setPayAmount("");
      setPayNotes("");
      const txs = await creditApi.getTransactions(selectedAccount.id);
      setTransactions(txs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetNewForm() {
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setNewLimit("5000");
    setNewNotes("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Account detail view ──────────────────────────────────────────────────
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
              {selectedAccount.email && (
                <p className="text-xs text-muted-foreground">
                  {selectedAccount.email}
                </p>
              )}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => openEditModal(selectedAccount)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-mist"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {selectedAccount.balance === 0 && (
                <button
                  onClick={() => handleDeleteAccount(selectedAccount)}
                  disabled={submitting}
                  className="rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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
          {selectedAccount.notes && (
            <p className="mt-3 text-xs text-muted-foreground">
              {selectedAccount.notes}
            </p>
          )}
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
                            tx.type === "charge"
                              ? "text-rose-600"
                              : "text-emerald-600"
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

        {/* Edit account modal */}
        {showEditModal && (
          <Modal onClose={() => setShowEditModal(false)}>
            <h3 className="font-display text-xl text-ink">Edit Account</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Customer name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Phone
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Credit limit (NPR)
                </label>
                <input
                  type="number"
                  value={editLimit}
                  onChange={(e) => setEditLimit(e.target.value)}
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-ember/40"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="regular customer, pays every Sunday"
                  className="mt-1.5 h-12 w-full rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-mist"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditAccount}
                  disabled={submitting || !editName.trim()}
                  className="flex-1 rounded-xl bg-ink py-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Account list view ────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <button
        onClick={() => navigate({ to: "/merchant" as any })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </button>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total outstanding
          </p>
          <p className="mt-1 font-display text-xl text-ink">
            NPR {summary.totalOutstanding.toLocaleString()}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total credit limit
          </p>
          <p className="mt-1 font-display text-xl text-ink">
            NPR {summary.totalLimit.toLocaleString()}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Near limit
          </p>
          <p className="mt-1 font-display text-xl text-amber-600">
            {summary.nearLimit}
          </p>
        </div>
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            At limit
          </p>
          <p className="mt-1 font-display text-xl text-rose-600">
            {summary.atLimit}
          </p>
        </div>
      </div>

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
          placeholder="Search by name, phone, or email..."
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
          const usage = acc.credit_limit
            ? (acc.balance / acc.credit_limit) * 100
            : 0;
          const nearLimit = usage > 80 && acc.balance < acc.credit_limit;
          const atLimit = acc.balance >= acc.credit_limit;
          return (
            <div
              key={acc.id}
              className="glass flex items-center justify-between rounded-xl p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-ink">{acc.full_name}</p>
                  {atLimit && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                      At limit
                    </span>
                  )}
                  {nearLimit && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      Near limit
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  NPR {acc.balance.toLocaleString()} / NPR{" "}
                  {acc.credit_limit.toLocaleString()}
                </p>
                {acc.phone && (
                  <p className="text-[11px] text-muted-foreground/70">
                    {acc.phone}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => viewAccount(acc)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-mist"
                  title="View details"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setSelectedAccount(acc);
                    setShowPayModal(true);
                    setPayAmount(String(acc.balance));
                  }}
                  className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  title="Record payment"
                >
                  Pay
                </button>
                <button
                  onClick={() => openEditModal(acc)}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-mist"
                  title="Edit account"
                >
                  <Pencil className="h-3.5 w-3.5" />
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
                onClick={() => {
                  setShowNewModal(false);
                  resetNewForm();
                }}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
