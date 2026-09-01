import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";
import { API_BASE_URL, getAuthHeaders } from "./api";

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Configure provider to request specific scopes
googleProvider.addScope("profile");
googleProvider.addScope("email");

export interface UserData {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Exchanges the Firebase ID token for a backend JWT so Google users get the
 * same authenticated access (resume analysis, AI, proctor logs) as email users.
 */
async function exchangeFirebaseToken(idToken: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/google`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    throw new Error(
      `Cannot reach the API server (${API_BASE_URL}). Check that the backend is running and try again.`
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Google sign-in failed");
  }

  const data = await res.json();
  if (!data.token) throw new Error("Sign-in did not return a session token");
  return data.token;
}

/**
 * Sign in with Google using Firebase Authentication.
 * Opens a popup window for the user to authenticate, then mints a backend JWT.
 */
export const signInWithGoogle = async (): Promise<UserData> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userData: UserData = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };

    // Mint a backend session from the Firebase identity
    const idToken = await user.getIdToken();
    const token = await exchangeFirebaseToken(idToken);

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));

    return userData;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    // Handle specific error codes
    if (err.code === "auth/popup-closed-by-user") {
      throw new Error("Sign-in popup was closed");
    } else if (err.code === "auth/popup-blocked") {
      throw new Error("Sign-in popup was blocked by browser");
    } else if (err.code === "auth/cancelled-popup-request") {
      throw new Error("Sign-in was cancelled");
    }
    throw new Error(err.message || "Google sign-in failed");
  }
};

/**
 * Sign out from Firebase and clear the backend session
 */
export const signOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  } catch (error: unknown) {
    const err = error as { message?: string };
    throw new Error(err.message || "Sign out failed");
  }
};

/**
 * Get current user from localStorage
 * This is useful for checking logged-in state on page load
 */
export const getCurrentUserFromStorage = (): UserData | null => {
  try {
    const userJson = localStorage.getItem("user");
    return userJson ? (JSON.parse(userJson) as UserData) : null;
  } catch (error) {
    console.error("Failed to parse stored user data:", error);
    return null;
  }
};

/**
 * Listen to auth state changes
 * Useful for updating UI when user signs in/out
 */
export const onAuthStateChangedListener = (
  callback: (user: UserData | null) => void
) => {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      const userData: UserData = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      };
      callback(userData);
    } else {
      callback(null);
    }
  });
};
