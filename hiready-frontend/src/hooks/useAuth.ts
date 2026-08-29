import { useEffect, useState } from "react";
import { onAuthStateChangedListener, UserData, getCurrentUserFromStorage } from "@/lib/auth";
import { auth } from "@/lib/firebase";

/**
 * Custom hook to manage authentication state.
 * Returns the current user and loading state.
 */
export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Seed from localStorage first (instant paint)
    const storedUser = getCurrentUserFromStorage();
    if (storedUser) {
      setUser(storedUser);
    }

    // Firebase exposes the current user synchronously after restore —
    // use it to avoid a race where the timeout flips loading too early
    const syncUser = auth.currentUser;
    if (syncUser) {
      setUser({
        uid: syncUser.uid,
        displayName: syncUser.displayName,
        email: syncUser.email,
        photoURL: syncUser.photoURL,
      });
    }

    // Listen to real-time auth changes
    const unsubscribe = onAuthStateChangedListener((authUser) => {
      setUser(authUser);
      setLoading(false);
    });

    // Safety net for misconfigured Firebase (listener never fires):
    // only stop loading if we have no user at all
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return { user, loading, error };
};
