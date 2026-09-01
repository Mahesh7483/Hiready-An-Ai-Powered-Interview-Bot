import { useContext } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { UserData } from "@/lib/auth";

/**
 * Custom hook to access shared authentication state from AuthContext.
 */
export const useAuth = (): { user: UserData | null; loading: boolean; error: string | null } => {
  try {
    return useAuthContext();
  } catch {
    // Fallback in case component is rendered outside AuthProvider (e.g. isolated test)
    return { user: null, loading: false, error: null };
  }
};

