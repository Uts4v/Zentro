import { redirect } from "@tanstack/react-router";
import { authReady } from "@/lib/supabase-auth-ready";
import { supabase } from "@/lib/supabase";

export async function requireMerchant() {
  // Skip on SSR — no session available server-side, client will re-run on hydration
  if (typeof window === "undefined") return;

  const redirectPath = window.location.pathname;
  const session = await authReady;

  if (!session) {
    throw redirect({ to: "/auth/merchant", search: { redirect: redirectPath } });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profile?.role !== "merchant") {
    throw redirect({ to: "/auth/merchant", search: { redirect: redirectPath } });
  }
}