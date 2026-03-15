import {
  signInWithPopup,
  GoogleAuthProvider,
  User,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";

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
 * Sign in with Google using Firebase Authentication
 * Opens a popup window for user to authenticate
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

    // Save user data to localStorage
    localStorage.setItem("user", JSON.stringify(userData));

    return userData;
  } catch (error: any) {
    // Handle specific error codes
    if (error.code === "auth/popup-closed-by-user") {
      throw new Error("Sign-in popup was closed");
    } else if (error.code === "auth/popup-blocked") {
      throw new Error("Sign-in popup was blocked by browser");
    } else if (error.code === "auth/cancelled-popup-request") {
      throw new Error("Sign-in was cancelled");
    }
    throw new Error(error.message || "Google sign-in failed");
  }
};

/**
 * Sign out from Firebase
 */
export const signOut = async (): Promise<void> => {
  try {
    await firebaseSignOut(auth);
    localStorage.removeItem("user");
  } catch (error: any) {
    throw new Error(error.message || "Sign out failed");
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
