import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Users, Crown, ShoppingBag } from "lucide-react";

type UserProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  points: number;
  streak: number;
  tier: string;
  role: string;
  created_at?: string;
};

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "customer")
      .order("points", { ascending: false });

    if (error) console.error("Failed to fetch users:", error);
    else setUsers((data as UserProfile[]) ?? []);
    setLoading(false);
  }

  const filtered = users.filter((u) =>
    search === "" ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const tierStyles: Record<string, string> = {
    Bronze:   "bg-amber-50 text-amber-700 border-amber-200",
    Silver:   "bg-slate-50 text-slate-600 border-slate-200",
    Gold:     "bg-yellow-50 text-yellow-700 border-yellow-200",
    Platinum: "bg-sky-50 text-sky-700 border-sky-200",
  };

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
      <h1 className="font-display mt-2 text-4xl text-ink">Users</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        All customer accounts — {users.length} total.
      </p>

      {/* Search */}
      <div className="mt-6">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full max-w-sm rounded-xl bg-mist px-4 text-sm text-ink outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ember/40"
        />
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No users found.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {filtered.map((user) => (
            <div key={user.id} className="flex items-center gap-4 rounded-2xl border border-border bg-background p-4">
              {/* Avatar */}
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium text-primary-foreground">
                {user.full_name?.charAt(0).toUpperCase() ?? "?"}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  {user.full_name ?? "Anonymous"}
                </p>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="h-3 w-3" />
                    {user.points} pts
                  </span>
                  <span>🔥 {user.streak} streak</span>
                </div>
              </div>

              {/* Tier badge */}
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                tierStyles[user.tier] ?? "bg-mist text-muted-foreground border-border"
              }`}>
                <Crown className="mr-1 inline h-3 w-3" />
                {user.tier}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}