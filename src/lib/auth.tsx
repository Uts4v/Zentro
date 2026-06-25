import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  streak: number;
  tier: string;
  role?: "customer" | "merchant";
};

type MerchantProfile = {
  id: string;
  user_id: string;
  store_name: string;
  store_slug: string | null;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_approved: boolean;
  created_at: string;
};

type SignUpMeta = {
  role?: "customer" | "merchant";
  store_name?: string;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  merchantProfile: MerchantProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, meta?: SignUpMeta) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshMerchantProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                     = useState<User | null>(null);
  const [session, setSession]               = useState<Session | null>(null);
  const [profile, setProfile]               = useState<Profile | null>(null);
  const [merchantProfile, setMerchantProfile] = useState<MerchantProfile | null>(null);
  const [loading, setLoading]               = useState(true);

  // Track in-flight fetches so we don't set loading=false prematurely
  const pendingFetches = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setProfile(data as Profile ?? {
        id: userId, full_name: null, avatar_url: null,
        points: 0, streak: 0, tier: "Bronze",
      });
    } catch {
      setProfile({ id: userId, full_name: null, avatar_url: null, points: 0, streak: 0, tier: "Bronze" });
    }
  }, []);

  // Always fetch merchant profile by user_id — don't rely on user_metadata.role
  // because that metadata may not be set for older accounts or OAuth signups
  const fetchMerchantProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("merchant_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      // data is null if not a merchant — that's fine
      setMerchantProfile(data as MerchantProfile ?? null);
    } catch {
      setMerchantProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshMerchantProfile = useCallback(async () => {
    if (user?.id) await fetchMerchantProfile(user.id);
  }, [user, fetchMerchantProfile]);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION first, then any subsequent events.
    // We use this as the single source of truth — no separate getSession() call.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Both fetches must complete before loading = false
          pendingFetches.current = 2;

          fetchProfile(s.user.id).finally(() => {
            pendingFetches.current -= 1;
            if (pendingFetches.current === 0) setLoading(false);
          });

          // Always check merchant_profiles — never gate on user_metadata.role
          fetchMerchantProfile(s.user.id).finally(() => {
            pendingFetches.current -= 1;
            if (pendingFetches.current === 0) setLoading(false);
          });
        } else {
          // Signed out
          setProfile(null);
          setMerchantProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchMerchantProfile]);

  const signUp = useCallback(async (
    email: string, password: string, name: string, meta?: SignUpMeta
  ) => {
    const role = meta?.role || "customer";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role, ...(meta?.store_name ? { store_name: meta.store_name } : {}) } },
    });
    if (error) return { error: error.message };

    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      await supabase.from("profiles").upsert({
        id: u.id, full_name: name, points: 0, streak: 0, tier: "Bronze", role,
      });
      if (role === "merchant" && meta?.store_name) {
        await supabase.from("merchant_profiles").insert({
          user_id: u.id,
          store_name: meta.store_name,
          store_slug: meta.store_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          is_approved: false,
        });
      }
    }
    return { error: null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setMerchantProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, profile, merchantProfile, loading,
      signUp, signIn, signOut, refreshProfile, refreshMerchantProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}