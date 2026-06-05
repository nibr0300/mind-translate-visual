import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ADMIN_EVENT = "admin-role-changed";

export function useIsAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (authLoading) return;
    setLoading(true);
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    setIsAdmin(Boolean(data));
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const onChange = () => refresh();
    window.addEventListener(ADMIN_EVENT, onChange);
    return () => {
      window.removeEventListener(ADMIN_EVENT, onChange);
    };
  }, [user?.id, authLoading]);

  return { isAdmin, loading, refresh };
}

export async function claimAdminIfFirst() {
  const { data, error } = await supabase.rpc("claim_admin_if_first");
  if (error) throw error;
  window.dispatchEvent(new Event(ADMIN_EVENT));
  return Boolean(data);
}
