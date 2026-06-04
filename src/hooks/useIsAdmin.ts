import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    setIsAdmin(Boolean(data));
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  return { isAdmin, loading, refresh };
}

export async function claimAdminIfFirst() {
  const { data, error } = await supabase.rpc("claim_admin_if_first");
  if (error) throw error;
  return Boolean(data);
}
