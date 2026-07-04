import { redirect } from "@tanstack/react-router";
import { authReady } from "@/lib/supabase-auth-ready";

export async function requireAuth() {
  if (typeof window === "undefined") return;

  const session = await authReady;

  if (!session) {
    const { supabase } = await import("@/lib/supabase");
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s) return;
  }

  if (!session) {
    throw redirect({
      to: "/auth/" as any,
      search: { redirect: window.location.pathname },
    });
  }
}

export async function requireMerchantAuth() {
  if (typeof window === "undefined") return;

  const session = await authReady;

  if (!session) {
    const { supabase } = await import("@/lib/supabase");
    const { data: { session: s } } = await supabase.auth.getSession();
    if (s) return;
  }

  if (!session) {
    throw redirect({
      to: "/auth/merchant" as any,
      search: { redirect: window.location.pathname },
    });
  }
}