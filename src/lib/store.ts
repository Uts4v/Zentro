// lib/store.ts 
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { orderApi } from "@/lib/api";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  emoji: string;
  points_per_item: number;
  is_available?: boolean;
  image_url?: string | null;
};

export type CartItem = { itemId: string; qty: number };

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  pointsEarned: number;
  merchantId?: string;
  merchantName?: string;
  notes?: string;
};

type State = {
  cart: CartItem[];
  orders: Order[];
  points: number;
  streak: number;
  customerName: string;
  selectedMerchantId: string | null;
  setSelectedMerchant: (id: string | null) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  clearCart: () => void;
  placeOrder: (menuItems: MenuItem[], notes?: string) => Promise<string>;
  updateOrderStatus: (id: string, s: OrderStatus) => void;
  setOrders: (orders: Order[]) => void;
  setPoints: (pts: number) => void;
  setStreak: (s: number) => void;
  setCustomerName: (name: string) => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      cart: [],
      orders: [],
      points: 0,
      streak: 0,
      customerName: "",
      selectedMerchantId: null,

      setSelectedMerchant: (id) => set({ selectedMerchantId: id }),

      add: (id) =>
        set((s) => {
          const ex = s.cart.find((c) => c.itemId === id);
          return ex
            ? { cart: s.cart.map((c) => (c.itemId === id ? { ...c, qty: c.qty + 1 } : c)) }
            : { cart: [...s.cart, { itemId: id, qty: 1 }] };
        }),

      remove: (id) =>
        set((s) => ({
          cart: s.cart
            .map((c) => (c.itemId === id ? { ...c, qty: c.qty - 1 } : c))
            .filter((c) => c.qty > 0),
        })),

      // FIX: only clear cart, NOT selectedMerchantId — loyalty page needs it
      clearCart: () => set({ cart: [] }),

      placeOrder: async (menuItems: MenuItem[], notes = "") => {
        const { cart, selectedMerchantId } = get();
        if (!selectedMerchantId) throw new Error("No merchant selected");
        if (cart.length === 0) throw new Error("Cart is empty");

        const items = cart.map((c) => {
  const item = menuItems.find((m) => m.id === c.itemId);
  if (!item) throw new Error(`Item ${c.itemId} not found`);
  return {
    menu_item_id: c.itemId,
    quantity: c.qty,
    name: item.name,
    price: item.price,
    points_per_item: item.points_per_item ?? 0, // ← add this
  };
});

        const apiOrder = await orderApi.create({
          merchant_id: selectedMerchantId,
          items,
          notes,
        });

        const order: Order = {
          id: apiOrder.id,
          items: cart,
          total: parseFloat(apiOrder.total_amount),
          status: apiOrder.status as OrderStatus,
          createdAt: apiOrder.created_at,
          customerName: apiOrder.profiles?.full_name ?? "",
          pointsEarned: apiOrder.points_earned,
          merchantId: apiOrder.merchant_id,
          merchantName: apiOrder.merchant_profiles?.store_name,
          notes: apiOrder.notes,
        };

        set((s) => ({
          orders: [order, ...s.orders],
          cart: [],
          // FIX: removed selectedMerchantId: null — keep merchant selected
          // so the loyalty page can immediately load the punch card
        }));

        return order.id;
      },

      updateOrderStatus: (id, status) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
        })),

      setOrders: (orders) => set({ orders }),
      setPoints: (pts) => set({ points: pts }),
      setStreak: (s) => set({ streak: s }),
      setCustomerName: (name) => set({ customerName: name }),
    }),
    {
      name: "zentro-store",
      partialize: (state) => ({
        cart: state.cart,
        selectedMerchantId: state.selectedMerchantId,
        points: state.points,
        streak: state.streak,
        customerName: state.customerName,
      }),
    }
  )
);

export const cartTotal = (cart: CartItem[], menuItems?: MenuItem[]) =>
  cart.reduce((sum, c) => {
    const i = menuItems?.find((m) => m.id === c.itemId);
    return i ? sum + i.price * c.qty : sum;
  }, 0);

export const cartPoints = (cart: CartItem[], menuItems?: MenuItem[]) =>
  cart.reduce((sum, c) => {
    const i = menuItems?.find((m) => m.id === c.itemId);
    return i ? sum + (i.points_per_item || 0) * c.qty : sum;
  }, 0);