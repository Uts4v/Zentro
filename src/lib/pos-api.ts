// lib/pos-api.ts
// POS system API functions: staff, shifts, credit, and POS order processing

import { supabase } from "@/lib/supabase";
import type { MerchantProfile } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaffAccount {
  id: string;
  user_id: string | null;
  merchant_id: string;
  full_name: string;
  email: string;
  role: "cashier" | "manager" | "kitchen";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashShift {
  id: string;
  merchant_id: string;
  opened_by: string;
  closed_by: string | null;
  status: "open" | "closed";
  opening_cash: number;
  closing_cash_actual: number | null;
  cash_difference: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  worker_name: string | null;
  created_at: string;
  // Joined fields
  opener_name?: string;
  closer_name?: string;
}

export interface CashDrop {
  id: string;
  shift_id: string;
  merchant_id: string;
  recorded_by: string;
  amount: number;
  direction: "drop" | "payout";
  reason: string;
  created_at: string;
  // Joined
  recorder_name?: string;
}

export interface ShiftSummary {
  opening_cash: number;
  cash_sales: number;
  fonepay_sales: number;
  credit_charges: number;
  split_sales: number;
  cash_drops: number;
  cash_payouts: number;
  total_orders: number;
  walk_in_orders: number;
}

export interface CreditAccount {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  credit_limit: number;
  balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  credit_account_id: string;
  merchant_id: string;
  type: "charge" | "payment";
  amount: number;
  balance_after: number;
  order_id: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
}

export interface WalkInOrderPayload {
  merchant_id: string;
  table_id?: string | null;
  items: {
    menu_item_id: string;
    quantity: number;
    name: string;
    price: number;
    points_per_item: number;
  }[];
  notes?: string;
  order_type: "dine_in" | "pickup";
  walk_in_name?: string;
  discount_type?: "amount" | "percent" | null;
  discount_value?: number | null;
}

export interface PaymentResult {
  receipt_number: string;
  order_id: string;
  payment_method: string;
  total: number;
  cash_received: number;
  fonepay_amount: number;
  change: number;
  credit_new_balance: number | null;
}

export interface ReceiptData {
  receipt_number: string;
  order_id: string;
  payment_method: string;
  total: number;
  cash_received: number;
  fonepay_amount: number;
  change: number;
  credit_new_balance: number | null;
  // Joined from order
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
  paid_at: string;
  loyalty_points_earned: number | null;
  loyalty_total_balance: number | null;
  discount_type: "amount" | "percent" | null;
  discount_value: number | null;
  discount_amount: number | null;
}

// ── Cached identity helpers (fixes N+1 performance issue) ───────────────────

let _cachedUserId: string | null = null;
let _cachedMerchantProfile: MerchantProfile | null = null;
let _cachedMerchantUserId: string | null = null;

export async function getCurrentUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user) {
    _cachedUserId = user.id;
    return user.id;
  }

  if (error?.status === 403 || error?.status === 401) {
    const {
      data: { session: refreshed },
    } = await supabase.auth.refreshSession();
    if (refreshed?.user) {
      _cachedUserId = refreshed.user.id;
      return refreshed.user.id;
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    _cachedUserId = session.user.id;
    return session.user.id;
  }

  throw new Error("Not authenticated");
}

export function clearIdentityCache() {
  _cachedUserId = null;
  _cachedMerchantProfile = null;
  _cachedMerchantUserId = null;
}

export async function getMerchantProfileCached(): Promise<MerchantProfile> {
  const userId = await getCurrentUserId();
  if (_cachedMerchantProfile && _cachedMerchantUserId === userId) {
    return _cachedMerchantProfile;
  }
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Merchant profile not found");
  _cachedMerchantProfile = data as MerchantProfile;
  _cachedMerchantUserId = userId;
  return _cachedMerchantProfile;
}

// ── Shift API ────────────────────────────────────────────────────────────────

export const shiftApi = {
  currentShift: async (): Promise<CashShift | null> => {
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase
      .from("cash_shifts")
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    let openerName = "Unknown";
    if (data.opened_by) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name").eq("id", data.opened_by).maybeSingle();
      openerName = prof?.full_name ?? "Unknown";
    }
    return { ...data, opener_name: openerName } as CashShift;
  },

  openShift: async (
    openingCash: number,
    notes?: string,
    workerName?: string
  ): Promise<CashShift> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase.rpc("open_shift", {
      p_merchant_id: merchant.id,
      p_staff_user_id: userId,
      p_opening_cash: openingCash,
      p_notes: notes ?? "",
      p_worker_name: workerName ?? null,
    });
    if (error) throw new Error(error.message);
    // Fetch the created shift
    const { data: shift } = await supabase
      .from("cash_shifts")
      .select("*")
      .eq("id", data)
      .single();
    return shift as CashShift;
  },

  recordCashMovement: async (
    shiftId: string,
    amount: number,
    direction: "drop" | "payout",
    reason: string
  ): Promise<CashDrop> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase
      .from("cash_drops")
      .insert({
        shift_id: shiftId,
        merchant_id: merchant.id,
        recorded_by: userId,
        amount,
        direction,
        reason,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CashDrop;
  },

  getShiftDrops: async (shiftId: string): Promise<CashDrop[]> => {
    const { data, error } = await supabase
      .from("cash_drops")
      .select("*, profiles:recorded_by(full_name)")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((d: any) => ({
      ...d,
      recorder_name: d.profiles?.full_name ?? "Unknown",
    })) as CashDrop[];
  },

  getShiftSummary: async (shiftId: string): Promise<ShiftSummary> => {
    const { data, error } = await supabase.rpc("get_shift_summary", {
      p_shift_id: shiftId,
    });
    if (error) throw new Error(error.message);
    return data as ShiftSummary;
  },

  closeShift: async (
    shiftId: string,
    actualCash: number,
    notes?: string
  ): Promise<void> => {
    const userId = await getCurrentUserId();
    const { error } = await supabase.rpc("close_shift", {
      p_shift_id: shiftId,
      p_actual_cash: actualCash,
      p_closed_by: userId,
      p_notes: notes ?? null,
    });
    if (error) throw new Error(error.message);
  },

  shiftHistory: async (): Promise<CashShift[]> => {
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase
      .from("cash_shifts")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("opened_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Resolve names separately to avoid ambiguous FK joins
    const userIds = new Set<string>();
    (data ?? []).forEach((s: any) => {
      if (s.opened_by) userIds.add(s.opened_by);
      if (s.closed_by) userIds.add(s.closed_by);
    });
    const nameMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name").in("id", [...userIds]);
      (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
    }
    return (data ?? []).map((s: any) => ({
      ...s,
      opener_name: nameMap[s.opened_by] ?? "Unknown",
      closer_name: s.closed_by ? (nameMap[s.closed_by] ?? null) : null,
    })) as CashShift[];
  },
};

// ── Credit API ───────────────────────────────────────────────────────────────

export const creditApi = {
  list: async (): Promise<CreditAccount[]> => {
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase
      .from("credit_accounts")
      .select("*")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as CreditAccount[];
  },

  create: async (input: {
    full_name: string;
    phone?: string;
    email?: string;
    credit_limit?: number;
    notes?: string;
    customer_id?: string;
  }): Promise<CreditAccount> => {
    const merchant = await getMerchantProfileCached();
    const { data, error } = await supabase
      .from("credit_accounts")
      .insert({
        merchant_id: merchant.id,
        customer_id: input.customer_id ?? null,
        full_name: input.full_name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        credit_limit: input.credit_limit ?? 5000,
        notes: input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CreditAccount;
  },

  update: async (
    id: string,
    input: {
      full_name?: string;
      phone?: string;
      email?: string;
      credit_limit?: number;
      notes?: string;
    }
  ): Promise<CreditAccount> => {
    const { data, error } = await supabase
      .from("credit_accounts")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CreditAccount;
  },

  getTransactions: async (
    creditAccountId: string,
    limit = 50
  ): Promise<CreditTransaction[]> => {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("credit_account_id", creditAccountId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as CreditTransaction[];
  },

  recordPayment: async (
    creditAccountId: string,
    amount: number,
    notes?: string
  ): Promise<number> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfileCached();

    // Get current balance
    const { data: account } = await supabase
      .from("credit_accounts")
      .select("balance")
      .eq("id", creditAccountId)
      .single();

    if (!account) throw new Error("Credit account not found");

    const newBalance = Math.max(0, account.balance - amount);

    // Update balance
    const { error: updateErr } = await supabase
      .from("credit_accounts")
      .update({ balance: newBalance })
      .eq("id", creditAccountId);
    if (updateErr) throw new Error(updateErr.message);

    // Record transaction
    const { error: txErr } = await supabase
      .from("credit_transactions")
      .insert({
        credit_account_id: creditAccountId,
        merchant_id: merchant.id,
        type: "payment",
        amount,
        balance_after: newBalance,
        notes: notes ?? null,
        recorded_by: userId,
      });
    if (txErr) throw new Error(txErr.message);

    return newBalance;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from("credit_accounts")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};

// ── POS API ──────────────────────────────────────────────────────────────────

export const posApi = {
  createWalkInOrder: async (payload: WalkInOrderPayload) => {
    const userId = await getCurrentUserId();

    // Calculate totals
    const subtotal = payload.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const pointsEarned = payload.items.reduce(
      (sum, item) => sum + item.points_per_item * item.quantity,
      0
    );

    // Calculate discount
    let discountAmount = 0;
    if (payload.discount_type && payload.discount_value) {
      if (payload.discount_type === "amount") {
        discountAmount = Math.min(payload.discount_value, subtotal);
      } else if (payload.discount_type === "percent") {
        discountAmount = Math.round(subtotal * Math.min(payload.discount_value, 100) / 100);
      }
    }
    const totalAmount = subtotal - discountAmount;

    // Get table name snapshot if dine-in
    let tableNameSnapshot = "";
    if (payload.order_type === "dine_in" && payload.table_id) {
      const { data: table } = await supabase
        .from("merchant_tables")
        .select("name")
        .eq("id", payload.table_id)
        .maybeSingle();
      tableNameSnapshot = table?.name ?? "";
    }

    // Insert order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: null,
        merchant_id: payload.merchant_id,
        status: "pending",
        total_amount: totalAmount,
        points_earned: pointsEarned,
        notes: payload.notes ?? "",
        order_type: payload.order_type,
        table_id: payload.table_id ?? null,
        table_name_snapshot: tableNameSnapshot,
        is_walk_in: true,
        walk_in_name: payload.walk_in_name ?? null,
        processed_by: userId,
        payment_status: "unpaid",
        discount_type: payload.discount_type ?? null,
        discount_value: payload.discount_value ?? null,
        discount_amount: discountAmount || null,
      })
      .select()
      .single();
    if (orderErr) throw new Error(orderErr.message);

    // Insert order items
    const { error: itemsErr } = await supabase.from("order_items").insert(
      payload.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
      }))
    );
    if (itemsErr) throw new Error(itemsErr.message);

    return order;
  },

  processPayment: async (payload: {
    orderId: string;
    paymentMethod: "cash" | "fonepay" | "split" | "credit";
    cashReceived?: number;
    fonepayAmount?: number;
    creditAccountId?: string;
  }): Promise<PaymentResult> => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.rpc("process_payment", {
      p_order_id: payload.orderId,
      p_payment_method: payload.paymentMethod,
      p_cash_received: payload.cashReceived ?? 0,
      p_fonepay_amount: payload.fonepayAmount ?? 0,
      p_credit_account_id: payload.creditAccountId ?? null,
      p_staff_user_id: userId,
    });
    if (error) throw new Error(error.message);
    return data as PaymentResult;
  },

  updateOrderDiscount: async (
    orderId: string,
    discountType: "amount" | "percent" | null,
    discountValue: number | null
  ): Promise<{
    subtotal: number;
    discount_amount: number;
    total: number;
    discount_type: string | null;
    discount_value: number | null;
  }> => {
    const { data, error } = await supabase.rpc("update_order_discount", {
      p_order_id: orderId,
      p_discount_type: discountType,
      p_discount_value: discountValue,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  getOrderForBill: async (orderId: string) => {
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "*, order_items(*), merchant:merchant_profiles(store_name, address, phone, logo_url), table:merchant_tables(name)"
      )
      .eq("id", orderId)
      .single();
    if (error) throw new Error(error.message);

    let cashierName = "System";
    if (order.processed_by) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.processed_by)
        .maybeSingle();
      cashierName = prof?.full_name ?? "Unknown";
    }

    let customerName = null;
    if (order.customer_id) {
      const { data: cust } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.customer_id)
        .maybeSingle();
      customerName = cust?.full_name ?? null;
    }

    const merchant = order.merchant as any;
    const items = (order.order_items ?? []).map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
    }));

    return {
      order_id: order.id,
      receipt_number: order.receipt_number,
      merchant_name: merchant?.store_name ?? "Store",
      merchant_address: merchant?.address ?? null,
      merchant_phone: merchant?.phone ?? null,
      merchant_logo: merchant?.logo_url ?? null,
      order_type: order.order_type,
      table_name: order.table_name_snapshot || order.table?.name || null,
      cashier_name: cashierName,
      is_walk_in: order.is_walk_in,
      walk_in_name: order.walk_in_name,
      customer_name: customerName,
      items,
      subtotal: items.reduce((s, i) => s + i.subtotal, 0),
      discount_type: order.discount_type ?? null,
      discount_value: order.discount_value ?? null,
      discount_amount: order.discount_amount ? Number(order.discount_amount) : 0,
      total: Number(order.total_amount),
      status: order.status,
      payment_status: order.payment_status,
      created_at: order.created_at,
    };
  },

  getReceipt: async (orderId: string): Promise<ReceiptData> => {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        "*, order_items(*), merchant:merchant_profiles(store_name, address, phone, logo_url), table:merchant_tables(name)"
      )
      .eq("id", orderId)
      .single();
    if (orderErr) throw new Error(orderErr.message);

    // Get cashier name from profiles
    let cashierName = "System";
    if (order.processed_by) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.processed_by)
        .maybeSingle();
      cashierName = prof?.full_name ?? "Unknown";
    }

    // Get customer name if not walk-in
    let customerName = null;
    if (order.customer_id) {
      const { data: cust } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", order.customer_id)
        .maybeSingle();
      customerName = cust?.full_name ?? null;
    }

    const merchant = order.merchant as any;
    const items = (order.order_items ?? []).map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
    }));

    return {
      receipt_number: order.receipt_number,
      order_id: order.id,
      payment_method: order.payment_method,
      total: Number(order.total_amount),
      cash_received: Number(order.cash_received ?? 0),
      fonepay_amount: Number(order.fonepay_amount ?? 0),
      change:
        order.payment_method === "cash"
          ? Number(order.cash_received ?? 0) - Number(order.total_amount)
          : 0,
      credit_new_balance: null,
      merchant_name: merchant?.store_name ?? "Store",
      merchant_address: merchant?.address ?? null,
      merchant_phone: merchant?.phone ?? null,
      merchant_logo: merchant?.logo_url ?? null,
      order_type: order.order_type,
      table_name: order.table_name_snapshot || order.table?.name || null,
      cashier_name: cashierName,
      is_walk_in: order.is_walk_in,
      walk_in_name: order.walk_in_name,
      customer_name: customerName,
      items,
      paid_at: order.paid_at,
      loyalty_points_earned: order.points_earned,
      loyalty_total_balance: null,
      discount_type: order.discount_type ?? null,
      discount_value: order.discount_value ?? null,
      discount_amount: order.discount_amount ?? null,
    };
  },
};

// ── Report API ──────────────────────────────────────────────────────────────

export interface ShiftReportData {
  shift: CashShift;
  summary: ShiftSummary;
  drops: CashDrop[];
  orders: {
    id: string;
    receipt_number: string | null;
    total_amount: number;
    payment_method: string | null;
    payment_status: string;
    walk_in_name: string | null;
    created_at: string;
  }[];
  merchant_name: string;
  merchant_address: string | null;
  merchant_phone: string | null;
}

export interface DailyReportData {
  date: string;
  shifts: {
    id: string;
    worker_name: string | null;
    opener_name: string;
    closer_name: string | null;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash_actual: number | null;
    cash_difference: number | null;
    status: string;
  }[];
  totals: {
    total_orders: number;
    total_sales: number;
    cash_sales: number;
    fonepay_sales: number;
    credit_sales: number;
    split_sales: number;
    total_discount: number;
    opening_cash: number;
    closing_cash: number;
    cash_difference: number;
    cash_drops: number;
    cash_payouts: number;
  };
  merchant_name: string;
  merchant_address: string | null;
  merchant_phone: string | null;
}

export const reportApi = {
  getShiftReport: async (shiftId: string): Promise<ShiftReportData> => {
    const merchant = await getMerchantProfileCached();

    // Get shift
    const { data: shift, error: shiftErr } = await supabase
      .from("cash_shifts")
      .select("*")
      .eq("id", shiftId)
      .single();
    if (shiftErr) throw new Error(shiftErr.message);

    // Get summary
    const summary = await shiftApi.getShiftSummary(shiftId);

    // Get drops
    const drops = await shiftApi.getShiftDrops(shiftId);

    // Get orders paid during this shift
    const { data: orders } = await supabase
      .from("orders")
      .select("id, receipt_number, total_amount, payment_method, payment_status, walk_in_name, created_at, paid_at, discount_amount")
      .eq("merchant_id", merchant.id)
      .eq("payment_status", "paid")
      .gte("paid_at", shift.opened_at)
      .lte("paid_at", shift.closed_at ?? new Date().toISOString())
      .order("paid_at", { ascending: true });

    // Resolve names
    let openerName = "Unknown";
    let closerName: string | null = null;
    const userIds = new Set<string>();
    if (shift.opened_by) userIds.add(shift.opened_by);
    if (shift.closed_by) userIds.add(shift.closed_by);
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name").in("id", [...userIds]);
      (profiles ?? []).forEach((p: any) => {
        if (p.id === shift.opened_by) openerName = p.full_name ?? "Unknown";
        if (p.id === shift.closed_by) closerName = p.full_name ?? null;
      });
    }

    return {
      shift: { ...shift, opener_name: openerName, closer_name: closerName } as CashShift,
      summary,
      drops,
      orders: (orders ?? []).map((o: any) => ({
        id: o.id,
        receipt_number: o.receipt_number,
        total_amount: Number(o.total_amount),
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        walk_in_name: o.walk_in_name,
        created_at: o.created_at,
      })),
      merchant_name: merchant.store_name,
      merchant_address: merchant.address,
      merchant_phone: merchant.phone,
    };
  },

  getDailyReport: async (dateStr?: string): Promise<DailyReportData> => {
    const merchant = await getMerchantProfileCached();
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    // Get all shifts for the day
    const { data: shifts } = await supabase
      .from("cash_shifts")
      .select("*")
      .eq("merchant_id", merchant.id)
      .gte("opened_at", dayStart)
      .lte("opened_at", dayEnd)
      .order("opened_at", { ascending: true });

    // Resolve names
    const userIds = new Set<string>();
    (shifts ?? []).forEach((s: any) => {
      if (s.opened_by) userIds.add(s.opened_by);
      if (s.closed_by) userIds.add(s.closed_by);
    });
    const nameMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name").in("id", [...userIds]);
      (profiles ?? []).forEach((p: any) => { nameMap[p.id] = p.full_name ?? "Unknown"; });
    }

    // Get all orders for the day
    const { data: orders } = await supabase
      .from("orders")
      .select("id, total_amount, payment_method, payment_status, discount_amount, cash_received, created_at, paid_at")
      .eq("merchant_id", merchant.id)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true });

    // Get all cash drops for the day
    const shiftIds = (shifts ?? []).map((s: any) => s.id);
    let allDrops: any[] = [];
    if (shiftIds.length > 0) {
      const { data: drops } = await supabase
        .from("cash_drops")
        .select("*")
        .in("shift_id", shiftIds);
      allDrops = drops ?? [];
    }

    // Calculate totals
    const paidOrders = (orders ?? []).filter((o: any) => o.payment_status === "paid");
    const totalSales = paidOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0);
    const cashSales = paidOrders
      .filter((o: any) => o.payment_method === "cash")
      .reduce((s: number, o: any) => s + Number(o.total_amount), 0);
    const fonepaySales = paidOrders
      .filter((o: any) => o.payment_method === "fonepay")
      .reduce((s: number, o: any) => s + Number(o.total_amount), 0);
    const creditSales = paidOrders
      .filter((o: any) => o.payment_method === "credit")
      .reduce((s: number, o: any) => s + Number(o.total_amount), 0);
    const splitSales = paidOrders
      .filter((o: any) => o.payment_method === "split")
      .reduce((s: number, o: any) => s + Number(o.total_amount), 0);
    const totalDiscount = paidOrders.reduce(
      (s: number, o: any) => s + Number(o.discount_amount ?? 0), 0
    );

    const openingCash = (shifts ?? []).reduce(
      (s: number, sh: any) => s + Number(sh.opening_cash), 0
    );
    const closingCash = (shifts ?? [])
      .filter((sh: any) => sh.closing_cash_actual != null)
      .reduce((s: number, sh: any) => s + Number(sh.closing_cash_actual), 0);
    const cashDiff = (shifts ?? [])
      .filter((sh: any) => sh.cash_difference != null)
      .reduce((s: number, sh: any) => s + Number(sh.cash_difference), 0);
    const cashDrops = allDrops
      .filter((d: any) => d.direction === "drop")
      .reduce((s: number, d: any) => s + Number(d.amount), 0);
    const cashPayouts = allDrops
      .filter((d: any) => d.direction === "payout")
      .reduce((s: number, d: any) => s + Number(d.amount), 0);

    return {
      date: targetDate,
      shifts: (shifts ?? []).map((s: any) => ({
        id: s.id,
        worker_name: s.worker_name,
        opener_name: nameMap[s.opened_by] ?? "Unknown",
        closer_name: s.closed_by ? (nameMap[s.closed_by] ?? null) : null,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opening_cash: Number(s.opening_cash),
        closing_cash_actual: s.closing_cash_actual != null ? Number(s.closing_cash_actual) : null,
        cash_difference: s.cash_difference != null ? Number(s.cash_difference) : null,
        status: s.status,
      })),
      totals: {
        total_orders: paidOrders.length,
        total_sales: totalSales,
        cash_sales: cashSales,
        fonepay_sales: fonepaySales,
        credit_sales: creditSales,
        split_sales: splitSales,
        total_discount: totalDiscount,
        opening_cash: openingCash,
        closing_cash: closingCash,
        cash_difference: cashDiff,
        cash_drops: cashDrops,
        cash_payouts: cashPayouts,
      },
      merchant_name: merchant.store_name,
      merchant_address: merchant.address,
      merchant_phone: merchant.phone,
    };
  },
};
