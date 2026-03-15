import { useEffect, useState } from "react";
import { onAuthStateChangedListener, UserData, getCurrentUserFromStorage } from "@/lib/auth";

/**
 * Custom hook to manage authentication state
 * Returns the current user and loading state
 *
 * @example
 * const { user, loading, error } = useAuth();
 * if (loading) return <LoadingSpinner />;
 * if (!user) return <Navigate to="/login" />;
 */
export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to get user from localStorage first (faster)
    const storedUser = getCurrentUserFromStorage();
    if (storedUser) {
      setUser(storedUser);
    }

    // Listen to real-time auth changes
    const unsubscribe = onAuthStateChangedListener((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    // Set loading to false after initial check
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return { user, loading, error };
};
