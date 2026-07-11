// api.ts
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  price: string;
  image_url: string;
  category: string;
  is_available: boolean;
  is_featured: boolean;
  loyalty_reward: boolean;
  points_per_item: number;
  emoji: string;
  created_at: string;
  updated_at: string;
}

export type MenuItemInput = Omit<MenuItem, "id" | "merchant_id" | "created_at" | "updated_at">;

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  price: string;
  quantity: number;
  subtotal: string;
}

export interface Order {
  id: string;
  customer_id: string;
  merchant_id: string;
  status: OrderStatus;
  total_amount: string;
  points_earned: number;
  notes: string;
  order_type?: "dine_in" | "pickup" | "delivery";
  table_id?: string | null;
  table_name_snapshot?: string;
  created_at: string;
  updated_at: string;
  order_items: OrderItem[];
  profiles?: { full_name: string | null };
  merchant_profiles?: { store_name: string };
}

export interface CreateOrderPayload {
  merchant_id: string;
  items: {
    menu_item_id: string;
    quantity: number;
    name: string;
    price: number;
    points_per_item: number;
  }[];
  notes?: string;
  order_type?: "dine_in" | "pickup" | "delivery";
  table_token?: string;
}

export interface MerchantProfile {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  is_approved: boolean;
  is_open: boolean;
  punches_to_free?: number;
  punch_card_bg_color?: string;
  punch_card_bg_image?: string | null;
  punch_card_stamp_emoji?: string;
  punch_card_stamp_mode?: "orders" | "streak";
  table_ordering_enabled?: boolean;
  allow_pickup?: boolean;
  allow_delivery?: boolean;
  allow_dine_in?: boolean;
}

export interface MerchantTable {
  id: string;
  merchant_id: string;
  name: string;
  table_number: number;
  public_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PunchCard {
  id: string;
  customer_id: string;
  merchant_id: string;
  punch_count: number;
  lifetime_punches: number;
  punches_to_free: number;
  free_reward_available: boolean;
  created_at: string;
  updated_at: string;
  punch_card_bg_color?: string;
  punch_card_bg_image?: string | null;
  punch_card_stamp_emoji?: string;
  punch_card_stamp_mode?: "orders" | "streak";
}

export interface CustomerProfile {
  id: string;
  full_name: string | null;
  loyalty_points: number;
  streak_days: number;
  tier: string;
  total_orders: number;
}

export interface Mission {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  icon: string;
  target_count: number;
  reward_points: number;
  mission_type: "order_count" | "spend_amount" | "visit_streak";
  is_active: boolean;
  created_at: string;
}

export interface MissionView {
  id: string;
  title: string;
  description: string;
  icon: string;
  target_count: number;
  current_count: number;
  reward_points: number;
  is_completed: boolean;
  mission_type: "order_count" | "spend_amount" | "visit_streak";
}

export interface Reward {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  emoji: string;
  points_cost: number;
  stock: number;
  is_active: boolean;
  created_at: string;
}

export interface Redemption {
  id: string;
  customer_id: string;
  reward_id: string;
  points_spent: number;
  code: string;
  status: "pending" | "confirmed" | "expired";
  expires_at: string;
  confirmed_at: string | null;
  created_at: string;
}

export interface LoyaltyRules {
  id: string;
  merchant_id: string;
  points_per_npr: number;
  streak_multiplier: number;
  welcome_bonus: number;
  birthday_bonus: number;
  streak_min_amount: number;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string> {
  // Primary: hit the Auth server and validate the JWT.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) return user.id;

  // JWT expired or stale — attempt a silent token refresh.
  if (error?.status === 403 || error?.status === 401) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    if (refreshed?.user) return refreshed.user.id;
  }

  // Last resort: read from localStorage without hitting the Auth server.
  // Works offline or when the Auth server is temporarily rejecting tokens,
  // but the token may be expired — only use as a fallback.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

  throw new Error("Not authenticated");
}

async function getMerchantProfile(userId: string): Promise<MerchantProfile> {
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Merchant profile not found");
  return data as MerchantProfile;
}

// ── Menu Items ────────────────────────────────────────────────────────────────

export const menuApi = {
  myItems: async (): Promise<MenuItem[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MenuItem[];
  },

  create: async (input: Partial<MenuItemInput>): Promise<MenuItem> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ ...input, merchant_id: merchant.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MenuItem;
  },

  update: async (id: string, input: Partial<MenuItemInput>): Promise<MenuItem> => {
    const { data, error } = await supabase
      .from("menu_items")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MenuItem;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  toggleAvailability: async (id: string): Promise<MenuItem> => {
    const { data: current, error: fetchErr } = await supabase
      .from("menu_items")
      .select("is_available")
      .eq("id", id)
      .single();
    if (fetchErr || !current) throw new Error("Item not found");
    const { data, error } = await supabase
      .from("menu_items")
      .update({ is_available: !current.is_available, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MenuItem;
  },

  forMerchant: async (merchantId: string): Promise<MenuItem[]> => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_available", true)
      .order("category");
    if (error) throw new Error(error.message);
    return (data ?? []) as MenuItem[];
  },
};

// ── Orders ────────────────────────────────────────────────────────────────────

export const orderApi = {
  myOrders: async (): Promise<Order[]> => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), merchant_profiles(store_name)")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Order[];
  },

  storeOrders: async (filterStatus?: string): Promise<Order[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    let query = supabase
      .from("orders")
      .select("*, order_items(*), profiles(full_name)")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (filterStatus) query = query.eq("status", filterStatus);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Order[];
  },

  create: async (payload: CreateOrderPayload): Promise<Order> => {
    const userId = await getCurrentUserId();

    // Dine-in orders go through the secure RPC
    if (payload.order_type === "dine_in" && payload.table_token) {
      const itemsJson = payload.items.map((i) => ({
        menu_item_id: i.menu_item_id,
        quantity: i.quantity,
        name: i.name,
        price: i.price,
        points_per_item: i.points_per_item ?? 0,
      }));

      const { data: orderId, error: rpcErr } = await supabase.rpc(
        "create_dine_in_order",
        {
          p_customer_id: userId,
          p_merchant_id: payload.merchant_id,
          p_table_token: payload.table_token,
          p_items: itemsJson,
          p_notes: payload.notes ?? "",
        }
      );
      if (rpcErr || !orderId) throw new Error(rpcErr?.message ?? "Failed to create dine-in order");

      // Fetch the full order with items
      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("*, order_items(*), profiles(full_name), merchant_profiles(store_name)")
        .eq("id", orderId)
        .single();
      if (fetchErr || !order) throw new Error(fetchErr?.message ?? "Failed to fetch order");

      // Notify merchant
      const { data: merchant } = await supabase
        .from("merchant_profiles")
        .select("user_id, store_name")
        .eq("id", payload.merchant_id)
        .single();
      if (merchant) {
        await supabase.from("notifications").insert({
          recipient_id: merchant.user_id,
          recipient_role: "merchant",
          type: "new_order",
          title: "New Dine-in Order!",
          body: `Table order placed at ${merchant.store_name}.`,
          data: { customer_id: userId, merchant_id: payload.merchant_id, order_id: orderId },
          is_read: false,
        });
      }

      return order as Order;
    }

    // Standard pickup/delivery order
    const total = payload.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const pointsEarned = payload.items.reduce(
      (sum, i) => sum + (i.points_per_item ?? 0) * i.quantity,
      0
    );

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: userId,
        merchant_id: payload.merchant_id,
        status: "pending",
        total_amount: total,
        points_earned: pointsEarned,
        notes: payload.notes ?? "",
        order_type: payload.order_type ?? "pickup",
      })
      .select()
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Failed to create order");

    const orderItems = payload.items.map((i) => ({
      order_id: order.id,
      menu_item_id: i.menu_item_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.price * i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsErr) throw new Error(itemsErr.message);

    const { data: merchant, error: merchantErr } = await supabase
      .from("merchant_profiles")
      .select("user_id, store_name")
      .eq("id", payload.merchant_id)
      .single();
    if (!merchantErr && merchant) {
      await supabase.from("notifications").insert({
        recipient_id: merchant.user_id,
        recipient_role: "merchant",
        type: "new_order",
        title: "New Order!",
        body: `A new order has been placed at ${merchant.store_name}.`,
        data: { customer_id: userId, merchant_id: payload.merchant_id, order_id: order.id },
        is_read: false,
      });
    }

    return { ...order, order_items: orderItems } as Order;
  },

  updateStatus: async (id: string, status: OrderStatus): Promise<Order> => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, order_items(*), profiles(full_name)")
      .single();
    if (error) throw new Error(error.message);

    if (status === "confirmed") {
      if (data.points_earned > 0) {
        await (supabase.rpc as any)("increment_points", {
          user_id: data.customer_id,
          pts: data.points_earned,
        }).throwOnError();
      }

      const { data: merchantProfile } = await supabase
        .from("merchant_profiles")
        .select("punch_card_stamp_mode")
        .eq("id", data.merchant_id)
        .single();

      const stampMode = merchantProfile?.punch_card_stamp_mode ?? "orders";

      if (stampMode === "orders") {
        await (supabase.rpc as any)("increment_punch_card", {
          p_customer_id: data.customer_id,
          p_merchant_id: data.merchant_id,
        }).throwOnError();
      }

      await (supabase.rpc as any)("try_increment_streak", {
        p_customer_id: data.customer_id,
        p_merchant_id: data.merchant_id,
        p_order_total: parseFloat(data.total_amount),
      }).throwOnError();

      if (stampMode === "streak") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("streak, last_streak_at")
          .eq("id", data.customer_id)
          .single();

        if (profile?.last_streak_at) {
          const hoursSinceStreak = (Date.now() - new Date(profile.last_streak_at).getTime()) / 3_600_000;
          if (hoursSinceStreak < 24) {
            await (supabase.rpc as any)("increment_punch_card", {
              p_customer_id: data.customer_id,
              p_merchant_id: data.merchant_id,
            }).throwOnError();
          }
        }
      }

      // Advance mission progress + award reward points on completion
      await (supabase.rpc as any)("advance_mission_progress", {
        p_customer_id: data.customer_id,
        p_merchant_id: data.merchant_id,
        p_order_total: parseFloat(data.total_amount),
      }).then(({ error }: any) => {
        if (error) console.error("Mission progress error:", error.message);
      });
    }

    return data as Order;
  },

  cancel: async (id: string): Promise<Order> => {
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, order_items(*)")
      .single();
    if (error) throw new Error(error.message);
    return data as Order;
  },

  get: async (id: string): Promise<Order> => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), profiles(full_name), merchant_profiles(store_name)")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return data as Order;
  },
};

// ── Merchant Profile ──────────────────────────────────────────────────────────

export const merchantApi = {
  me: async (): Promise<MerchantProfile> => {
    const userId = await getCurrentUserId();
    return getMerchantProfile(userId);
  },
  list: async (): Promise<MerchantProfile[]> => {
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("*")
    .eq("is_approved", true)
    .eq("is_open", true)
    .order("store_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as MerchantProfile[];
},

  get: async (id: string): Promise<MerchantProfile> => {
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle(); // was .single()
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Merchant not found");
  return data as MerchantProfile;
},

  update: async (input: Partial<MerchantProfile>): Promise<MerchantProfile> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("merchant_profiles")
      .update(input)
      .eq("id", merchant.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MerchantProfile;
  },
};

// ── Customer ──────────────────────────────────────────────────────────────────

export const customerApi = {
  profile: async (): Promise<CustomerProfile> => {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, points, streak, tier, last_streak_at, streak_free_earned")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) throw new Error(error?.message ?? "Profile not found");

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId)
      .eq("status", "completed");

    return {
      id: data.id,
      full_name: data.full_name,
      loyalty_points: data.points ?? 0,
      streak_days: data.streak ?? 0,
      tier: data.tier ?? "Bronze",
      total_orders: count ?? 0,
      last_streak_at: (data as any).last_streak_at ?? null,
      streak_free_earned: (data as any).streak_free_earned ?? false,
    };
  },

  getPunchCard: async (merchantId: string): Promise<PunchCard | null> => {
    const userId = await getCurrentUserId();

    const [cardResult, merchantResult] = await Promise.all([
      supabase
        .from("punch_cards")
        .select("*")
        .eq("customer_id", userId)
        .eq("merchant_id", merchantId)
        .maybeSingle(),
      supabase
        .from("merchant_profiles")
        .select("punch_card_bg_color, punch_card_bg_image, punch_card_stamp_emoji, punch_card_stamp_mode, punches_to_free")
        .eq("id", merchantId)
        .single(),
    ]);

    if (cardResult.error) throw new Error(cardResult.error.message);
    if (merchantResult.error) throw new Error(merchantResult.error.message);

    const merchant = merchantResult.data;
    const punchDefaults = {
      punch_card_bg_color: merchant?.punch_card_bg_color ?? "#ffffff",
      punch_card_bg_image: merchant?.punch_card_bg_image ?? null,
      punch_card_stamp_emoji: merchant?.punch_card_stamp_emoji ?? "✓",
      punch_card_stamp_mode: merchant?.punch_card_stamp_mode ?? "orders",
      punches_to_free: merchant?.punches_to_free ?? 5,
    };

    if (!cardResult.data) {
      return {
        id: "",
        customer_id: userId,
        merchant_id: merchantId,
        punch_count: 0,
        lifetime_punches: 0,
        free_reward_available: false,
        created_at: "",
        updated_at: "",
        ...punchDefaults,
      };
    }

    return {
      ...cardResult.data,
      punch_count: cardResult.data.punch_count ?? 0,
      lifetime_punches: cardResult.data.lifetime_punches ?? 0,
      free_reward_available: cardResult.data.free_reward_available ?? false,
      ...punchDefaults,
    } as PunchCard;
  },

  useFreeReward: async (merchantId: string): Promise<void> => {
    const userId = await getCurrentUserId();
    await (supabase.rpc as any)("use_free_reward", {
      p_customer_id: userId,
      p_merchant_id: merchantId,
    }).throwOnError();
  },

  claimFreeReward: async (merchantId: string): Promise<void> => {
    const userId = await getCurrentUserId();

    const { data: merchant, error: mErr } = await supabase
      .from("merchant_profiles")
      .select("user_id, store_name")
      .eq("id", merchantId)
      .single();
    if (mErr || !merchant) throw new Error("Merchant not found");

    await (supabase.rpc as any)("use_free_reward", {
      p_customer_id: userId,
      p_merchant_id: merchantId,
    }).throwOnError();

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({
        customer_id: userId,
        merchant_id: merchantId,
        status: "pending",
        total_amount: 0,
        points_earned: 0,
        notes: "Punch card reward claimed",
      })
      .select()
      .single();
    if (oErr || !order) throw new Error(oErr?.message ?? "Failed to create order");

    const { error: nErr } = await supabase
      .from("notifications")
      .insert({
        recipient_id: merchant.user_id,
        recipient_role: "merchant",
        type: "punch_card_reward",
        title: "Punch card reward claimed!",
        body: `A customer just claimed their punch card reward at ${merchant.store_name}.`,
        data: { customer_id: userId, merchant_id: merchantId, order_id: order.id },
        is_read: false,
      });
    if (nErr) throw new Error(nErr.message);
  },
};

// ── Missions ──────────────────────────────────────────────────────────────────

export const missionApi = {
  myMissions: async (): Promise<MissionView[]> => {
    const userId = await getCurrentUserId();

    const { data: missions, error: mErr } = await supabase
      .from("missions")
      .select("*")
      .eq("is_active", true);
    if (mErr) throw new Error(mErr.message);

    const { data: progress } = await supabase
      .from("customer_missions")
      .select("*")
      .eq("customer_id", userId);

    const progressMap = new Map((progress ?? []).map((p) => [p.mission_id, p]));

    return (missions ?? []).map((m) => {
      const p = progressMap.get(m.id);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        icon: m.icon,
        target_count: m.target_count,
        current_count: p?.current_count ?? 0,
        reward_points: m.reward_points,
        is_completed: p?.is_completed ?? false,
        mission_type: m.mission_type,
      };
    });
  },

  merchantMissions: async (): Promise<Mission[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Mission[];
  },

  create: async (input: Omit<Mission, "id" | "merchant_id" | "created_at">): Promise<Mission> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("missions")
      .insert({ ...input, merchant_id: merchant.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Mission;
  },

  update: async (id: string, input: Partial<Mission>): Promise<Mission> => {
    const { data, error } = await supabase
      .from("missions")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Mission;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from("missions").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

// ── Rewards ───────────────────────────────────────────────────────────────────

export const rewardApi = {
  list: async (merchantId?: string): Promise<Reward[]> => {
    let query = supabase.from("rewards").select("*").eq("is_active", true);
    if (merchantId) query = query.eq("merchant_id", merchantId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Reward[];
  },

  redeem: async (rewardId: string): Promise<Redemption> => {
    const userId = await getCurrentUserId();

    const { data: reward, error: rErr } = await supabase
      .from("rewards")
      .select("*")
      .eq("id", rewardId)
      .single();
    if (rErr || !reward) throw new Error("Reward not found");

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("points")
      .eq("id", userId)
      .single();
    if (pErr || !profile) throw new Error("Profile not found");
    if (profile.points < reward.points_cost) throw new Error("Not enough points");

    await (supabase.rpc as any)("deduct_points", {
      target_user_id: userId,
      amount: reward.points_cost,
    }).throwOnError();

    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: redemption, error: redErr } = await supabase
      .from("redemptions")
      .insert({
        customer_id: userId,
        reward_id: rewardId,
        points_spent: reward.points_cost,
        status: "pending",
        code,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (redErr || !redemption) throw new Error(redErr?.message ?? "Redemption failed");

    // Create a lightweight order for the merchant so they can see the
    // redeemed reward in their orders list and hand it to the customer.
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_id: userId,
          merchant_id: reward.merchant_id,
          status: "pending",
          total_amount: 0,
          points_earned: 0,
          notes: `Redeemed reward: ${reward.name}`,
        })
        .select()
        .single();

      if (orderErr || !order) {
        // Don't fail the entire redemption if order creation fails,
        // but log the error to help debugging.
        console.warn("Failed to create reward order:", orderErr);
      } else {
        await supabase.from("order_items").insert([
          {
            order_id: order.id,
            menu_item_id: null,
            name: `Reward: ${reward.name}`,
            price: 0,
            quantity: 1,
            subtotal: 0,
          },
        ]);
      }
    } catch (e) {
      console.warn("Error creating reward order:", e);
    }

    return redemption as Redemption;
  },
};

// ── Loyalty Rules + Merchant Rewards ─────────────────────────────────────────

export const loyaltyApi = {
  getRules: async (): Promise<LoyaltyRules> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);

    const { data, error } = await supabase
      .from("loyalty_rules")
      .select("*")
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!data) {
      return {
        id: "",
        merchant_id: merchant.id,
        points_per_npr: 1,
        streak_multiplier: 1.5,
        welcome_bonus: 50,
        birthday_bonus: 100,
        streak_min_amount: 100,
        updated_at: new Date().toISOString(),
      };
    }
    return data as LoyaltyRules;
  },

  saveRules: async (
    input: Pick<
      LoyaltyRules,
      "points_per_npr" | "streak_multiplier" | "welcome_bonus" | "birthday_bonus" | "streak_min_amount"
    >
  ): Promise<LoyaltyRules> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("loyalty_rules")
      .upsert(
        { ...input, merchant_id: merchant.id, updated_at: new Date().toISOString() },
        { onConflict: "merchant_id" }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as LoyaltyRules;
  },

  getRewards: async (): Promise<Reward[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("rewards")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Reward[];
  },

  createReward: async (input: Omit<Reward, "id" | "merchant_id" | "created_at">): Promise<Reward> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("rewards")
      .insert({ ...input, merchant_id: merchant.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Reward;
  },

  updateReward: async (id: string, input: Partial<Reward>): Promise<Reward> => {
    const { data, error } = await supabase
      .from("rewards")
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Reward;
  },

  deleteReward: async (id: string): Promise<void> => {
    const { error } = await supabase.from("rewards").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  generateRedemptionToken: async (rewardId: string): Promise<{ token: string; redemption_id: string }> => {
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("redemptions")
      .insert({
        reward_id: rewardId,
        status: "pending",
        code: token,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { token, redemption_id: data.id };
  },

  confirmRedemption: async (code: string): Promise<{ customer_name: string; points_deducted: number }> => {
    const { data: redemption, error: rErr } = await supabase
      .from("redemptions")
      .select("*, rewards(points_cost, name), customer_id")
      .eq("code", code)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!redemption) throw new Error("Invalid or expired code");

    const pointsCost = (redemption.rewards as any)?.points_cost ?? 0;

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("points, full_name")
      .eq("id", redemption.customer_id)
      .single();
    if (pErr || !profile) throw new Error("Customer profile not found");
    if (profile.points < pointsCost) throw new Error("Customer has insufficient points");

    await (supabase.rpc as any)("deduct_points", {
      target_user_id: redemption.customer_id,
      amount: pointsCost,
    }).throwOnError();

    await supabase
      .from("redemptions")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", redemption.id);

    return {
      customer_name: profile.full_name ?? "Customer",
      points_deducted: pointsCost,
    };
  },

  getRedemptions: async (): Promise<Redemption[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("redemptions")
      .select("*, rewards!inner(merchant_id, name)")
      .eq("rewards.merchant_id", merchant.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Redemption[];
  },
};

// ── Notifications ─────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  recipient_id: string;
  recipient_role: "customer" | "merchant";
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export const notificationApi = {
  list: async (limit = 30): Promise<AppNotification[]> => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AppNotification[];
  },

  markRead: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  markAllRead: async (): Promise<void> => {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);
    if (error) throw new Error(error.message);
  },
};

// ── Tables ───────────────────────────────────────────────────────────────────

export const tableApi = {
  list: async (): Promise<MerchantTable[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("merchant_tables")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("table_number");
    if (error) throw new Error(error.message);
    return (data ?? []) as MerchantTable[];
  },

  create: async (name: string, table_number: number): Promise<MerchantTable> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("merchant_tables")
      .insert({ merchant_id: merchant.id, name, table_number })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MerchantTable;
  },

  bulkGenerate: async (count: number, prefix: string): Promise<MerchantTable[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);

    // Get existing table numbers
    const { data: existing } = await supabase
      .from("merchant_tables")
      .select("table_number")
      .eq("merchant_id", merchant.id);
    const existingNumbers = new Set((existing ?? []).map((t) => t.table_number));

    const rows: { merchant_id: string; name: string; table_number: number }[] = [];
    let nextNum = 1;
    for (let i = 0; i < count && rows.length < count; i++) {
      while (existingNumbers.has(nextNum)) nextNum++;
      rows.push({ merchant_id: merchant.id, name: `${prefix} ${nextNum}`, table_number: nextNum });
      existingNumbers.add(nextNum);
      nextNum++;
    }

    if (rows.length === 0) return [];

    const { data, error } = await supabase
      .from("merchant_tables")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);
    return (data ?? []) as MerchantTable[];
  },

  update: async (id: string, name: string): Promise<MerchantTable> => {
    const { data, error } = await supabase
      .from("merchant_tables")
      .update({ name })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MerchantTable;
  },

  setActive: async (id: string, is_active: boolean): Promise<MerchantTable> => {
    const { data, error } = await supabase
      .from("merchant_tables")
      .update({ is_active })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MerchantTable;
  },

  regenerateToken: async (id: string): Promise<MerchantTable> => {
    // The default value on the column handles token generation via SQL
    const newToken = "TBL-" + upper(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(8)))).slice(0, 8).toUpperCase());
    const { data, error } = await supabase
      .from("merchant_tables")
      .update({ public_token: newToken })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as MerchantTable;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase.from("merchant_tables").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

function upper(s: string): string {
  return s.toUpperCase();
}

export const publicTableApi = {
  resolve: async (
    merchantSlug: string,
    tableToken: string
  ): Promise<{
    merchant: Pick<MerchantProfile, "id" | "store_name" | "store_slug" | "logo_url">;
    table: Pick<MerchantTable, "id" | "name" | "table_number" | "public_token">;
  }> => {
    // 1. Find merchant by slug
    const { data: merchant, error: mErr } = await supabase
      .from("merchant_profiles")
      .select("id, store_name, store_slug, logo_url, is_approved, is_open, table_ordering_enabled")
      .eq("store_slug", merchantSlug)
      .maybeSingle();
    if (mErr || !merchant) throw new Error("Merchant not found");
    if (!merchant.is_approved) throw new Error("Merchant is not approved");
    if (!merchant.is_open) throw new Error("Merchant is currently closed");
    if (!merchant.table_ordering_enabled) throw new Error("Table ordering is not enabled");

    // 2. Find table by token + merchant
    const { data: table, error: tErr } = await supabase
      .from("merchant_tables")
      .select("id, name, table_number, public_token")
      .eq("public_token", tableToken)
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .maybeSingle();
    if (tErr || !table) throw new Error("Invalid or inactive table");

    return {
      merchant: {
        id: merchant.id,
        store_name: merchant.store_name,
        store_slug: merchant.store_slug,
        logo_url: merchant.logo_url,
      },
      table,
    };
  },
};
// ── Retail ────────────────────────────────────────────────────────────────────

export interface RetailProduct {
  id: string;
  merchant_id: string;
  name: string;
  description: string;
  price: string;
  image_url: string;
  category: string;
  emoji: string;
  stock: number;
  weight_grams: number | null;
  is_available: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export type RetailProductInput = Omit<RetailProduct, "id" | "merchant_id" | "created_at" | "updated_at">;

export interface RetailOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: string;
  quantity: number;
  subtotal: string;
}

export interface RetailOrder {
  id: string;
  customer_id: string;
  merchant_id: string;
  status: OrderStatus;
  total_amount: string;
  notes: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  created_at: string;
  updated_at: string;
  retail_order_items: RetailOrderItem[];
  profiles?: { full_name: string | null };
  merchant_profiles?: { store_name: string };
}

export interface CreateRetailOrderPayload {
  merchant_id: string;
  items: {
    product_id: string;
    quantity: number;
    name: string;
    price: number;
  }[];
  notes?: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
}

export const retailApi = {
  // Merchant — manage products
  myProducts: async (): Promise<RetailProduct[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("retail_products")
      .select("*")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RetailProduct[];
  },

  createProduct: async (input: Partial<RetailProductInput>): Promise<RetailProduct> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("retail_products")
      .insert({ ...input, merchant_id: merchant.id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as RetailProduct;
  },

  updateProduct: async (id: string, input: Partial<RetailProductInput>): Promise<RetailProduct> => {
    const { data, error } = await supabase
      .from("retail_products")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as RetailProduct;
  },

  deleteProduct: async (id: string): Promise<void> => {
    const { error } = await supabase.from("retail_products").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  toggleProduct: async (id: string): Promise<RetailProduct> => {
    const { data: current, error: fetchErr } = await supabase
      .from("retail_products")
      .select("is_available")
      .eq("id", id)
      .single();
    if (fetchErr || !current) throw new Error("Product not found");
    const { data, error } = await supabase
      .from("retail_products")
      .update({ is_available: !current.is_available, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as RetailProduct;
  },

  // Customer — browse products
  forMerchant: async (merchantId: string): Promise<RetailProduct[]> => {
    const { data, error } = await supabase
      .from("retail_products")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_available", true)
      .order("category");
    if (error) throw new Error(error.message);
    return (data ?? []) as RetailProduct[];
  },

  allAvailable: async (): Promise<RetailProduct[]> => {
    const { data, error } = await supabase
      .from("retail_products")
      .select("*, merchant_profiles(store_name)")
      .eq("is_available", true)
      .order("category");
    if (error) throw new Error(error.message);
    return (data ?? []) as RetailProduct[];
  },

  // Orders — customer
  createOrder: async (payload: CreateRetailOrderPayload): Promise<RetailOrder> => {
    const userId = await getCurrentUserId();
    const total = payload.items.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data: order, error: orderErr } = await supabase
      .from("retail_orders")
      .insert({
        customer_id: userId,
        merchant_id: payload.merchant_id,
        status: "pending",
        total_amount: total,
        notes: payload.notes ?? "",
        shipping_name: payload.shipping_name,
        shipping_phone: payload.shipping_phone,
        shipping_address: payload.shipping_address,
      })
      .select()
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Failed to create order");

    const items = payload.items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.price * i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("retail_order_items").insert(items);
    if (itemsErr) throw new Error(itemsErr.message);

    return { ...order, retail_order_items: items } as RetailOrder;
  },

  myOrders: async (): Promise<RetailOrder[]> => {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("retail_orders")
      .select("*, retail_order_items(*), merchant_profiles(store_name)")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RetailOrder[];
  },

  // Orders — merchant
  storeOrders: async (): Promise<RetailOrder[]> => {
    const userId = await getCurrentUserId();
    const merchant = await getMerchantProfile(userId);
    const { data, error } = await supabase
      .from("retail_orders")
      .select("*, retail_order_items(*), profiles!retail_orders_customer_profile_fkey(full_name)")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RetailOrder[];
  },

  updateOrderStatus: async (id: string, status: OrderStatus): Promise<RetailOrder> => {
    const { data, error } = await supabase
      .from("retail_orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, retail_order_items(*), profiles!retail_orders_customer_profile_fkey(full_name)")
      .single();
    if (error) throw new Error(error.message);
    return data as RetailOrder;
  },
};