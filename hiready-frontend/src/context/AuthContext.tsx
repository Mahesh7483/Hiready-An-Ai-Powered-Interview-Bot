import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { onAuthStateChangedListener, UserData, getCurrentUserFromStorage } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { SESSION_EVENT } from "@/lib/session";

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(() => getCurrentUserFromStorage());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check initial Firebase user synchronously if present
    const syncUser = auth.currentUser;
    if (syncUser) {
      setUser({
        uid: syncUser.uid,
        displayName: syncUser.displayName,
        email: syncUser.email,
        photoURL: syncUser.photoURL,
      });
    }

    const unsubscribe = onAuthStateChangedListener((authUser) => {
      if (authUser) {
        setUser(authUser);
      } else {
        const stored = getCurrentUserFromStorage();
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!stored || !token) {
          setUser(null);
        } else {
          setUser(stored);
        }
      }
      setLoading(false);
    });

    // Email login, signup, logout and a 401 all write the session outside
    // Firebase, so Firebase never reports them. Re-read storage when they
    // announce a change, or when another tab signs in or out.
    const syncFromStorage = () => {
      const stored = getCurrentUserFromStorage();
      const token = localStorage.getItem("token");
      setUser(stored && token ? stored : null);
    };
    window.addEventListener(SESSION_EVENT, syncFromStorage);
    window.addEventListener("storage", syncFromStorage);

    return () => {
      unsubscribe();
      window.removeEventListener(SESSION_EVENT, syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const value = useMemo(() => ({ user, loading, error }), [user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
};
