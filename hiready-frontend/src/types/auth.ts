/**
 * Authentication Type Definitions
 * All TypeScript interfaces and types used in the Google Auth implementation
 */

/**
 * User Data from Google Authentication
 * This interface represents the user information retrieved from Firebase/Google
 */
export interface UserData {
  /** Firebase unique user ID */
  uid: string;

  /** User's full name from Google account */
  displayName: string | null;

  /** User's email address */
  email: string | null;

  /** User's profile picture URL from Google */
  photoURL: string | null;
}

/**
 * Auth State Hook Return Type
 * Returned by the useAuth() custom hook
 */
export interface UseAuthReturn {
  /** Currently authenticated user or null if not logged in */
  user: UserData | null;

  /** True while checking authentication state */
  loading: boolean;

  /** Error message if auth check fails */
  error: string | null;
}

/**
 * Authentication Error Types
 * Specific Firebase authentication errors
 */
export interface AuthError {
  code: string;
  message: string;
}

/**
 * Firebase Config Structure
 * Environment variables needed for Firebase initialization
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Example Usage:
 * 
 * // In a React component
 * import { useAuth } from "@/hooks/useAuth";
 * import type { UserData } from "@/types/auth";
 * 
 * export function MyComponent() {
 *   const { user, loading, error } = useAuth();
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *   if (!user) return <div>Not authenticated</div>;
 * 
 *   // User is logged in
 *   const displayName: string = user.displayName || "User";
 *   const email: string = user.email || "";
 *   const avatar: string | null = user.photoURL;
 * 
 *   return <div>Welcome, {displayName}!</div>;
 * }
 */

// Re-export from auth.ts for convenience
export { UserData as AuthUser } from "@/lib/auth";

/**
 * Common Firebase Error Codes
 * Reference for all possible Firebase authentication errors
 */
export const FirebaseErrorCodes = {
  // User authenication errors
  INVALID_CREDENTIALS: "auth/invalid-credential",
  USER_NOT_FOUND: "auth/user-not-found",
  WRONG_PASSWORD: "auth/wrong-password",
  EMAIL_ALREADY_IN_USE: "auth/email-already-in-use",
  WEAK_PASSWORD: "auth/weak-password",

  // OAuth errors
  POPUP_BLOCKED: "auth/popup-blocked",
  POPUP_CLOSED: "auth/popup-closed-by-user",
  CANCELLED_POPUP: "auth/cancelled-popup-request",
  OPERATION_NOT_ALLOWED: "auth/operation-not-allowed",

  // Network errors
  NETWORK_REQUEST_FAILED: "auth/network-request-failed",
  TOO_MANY_REQUESTS: "auth/too-many-requests",

  // Provider errors
  PROVIDER_ALREADY_LINKED: "auth/provider-already-linked",
  CREDENTIAL_ALREADY_IN_USE: "auth/credential-already-in-use",
  INVALID_PROVIDER_ID: "auth/invalid-provider-id",

  // Session errors
  SESSION_EXPIRED: "auth/session-expired",
  MISSING_SESSION_INFO: "auth/missing-session-info",
} as const;

/**
 * Firebase Authentication Configuration Example
 * Structure of the Firebase config object
 */
export const exampleFirebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAbC123XyZ...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456...",
};

/**
 * Example UserData Object
 * What the user object looks like after successful login
 */
export const exampleUserData: UserData = {
  uid: "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5",
  displayName: "John Doe",
  email: "john.doe@example.com",
  photoURL: "https://lh3.googleusercontent.com/a/...",
};

/**
 * LocalStorage Keys
 * Keys used to store data in browser localStorage
 */
export const STORAGE_KEYS = {
  USER_DATA: "user",
  AUTH_TOKEN: "auth_token",
  USER_PREFERENCES: "user_preferences",
} as const;

/**
 * Authentication State Machine
 * Possible states during authentication flow
 */
export enum AuthState {
  LOADING = "loading",
  AUTHENTICATED = "authenticated",
  UNAUTHENTICATED = "unauthenticated",
  ERROR = "error",
}

/**
 * Sign-In Provider Types
 * Currently supported providers (extensible for future additions)
 */
export enum AuthProvider {
  GOOGLE = "google.com",
  // Add more providers as needed
  // GITHUB = "github.com",
  // MICROSOFT = "microsoft.com",
  // EMAIL = "password",
}
