import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export const authReady: Promise<Session | null> =
  typeof window === "undefined"
    ? Promise.resolve(null)
    : new Promise((resolve) => {
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
            subscription.unsubscribe();
            resolve(session);
          }
        });

        setTimeout(() => {
          subscription.unsubscribe();
          resolve(null);
        }, 3000);
      });