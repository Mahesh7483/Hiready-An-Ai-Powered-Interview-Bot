# Firebase Google Authentication Setup Guide

## Overview
This guide walks you through setting up Google Authentication for HiREady using Firebase v9+.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project" and follow the setup wizard
3. Name your project (e.g., "HiREady")
4. Disable Google Analytics (optional, for simplicity)
5. Click "Create project" and wait for initialization

## Step 2: Register Your Web App

1. In Firebase Console, click the Web icon (</>) to create a web app
2. Enter your app name (e.g., "HiREady Web")
3. Check "Also set up Firebase Hosting for this app" (optional)
4. Click "Register app"
5. **Copy the Firebase configuration object** - you'll need these values

Your Firebase config should look like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123..."
};
```

## Step 3: Set Up Environment Variables

1. In the root of your project, create a `.env.local` file (if it doesn't exist)
2. Add your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
```

**⚠️ IMPORTANT:** 
- Add `.env.local` to your `.gitignore` to prevent exposing sensitive keys
- Never commit your `.env.local` file to version control

## Step 4: Enable Google Sign-In in Firebase

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Click on **Google**
3. Toggle **Enable** to ON
4. Select the **Support email** for your project
5. Click **Save**

## Step 5: Configure Google OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Navigate to **APIs & Services** > **OAuth consent screen**
4. Click **Create Consent Screen**
5. Select **External** user type
6. Fill in the required fields:
   - App name: "HiREady"
   - User support email: Your email
   - Developer contact: Your email
7. Add required scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
8. Complete the OAuth setup

## Step 6: Add Authorized Redirect URIs

In the same Firebase project settings:
1. Go to **Project Settings** > **Your Apps**
2. In the Firebase config panel, note your auth domain
3. Go to Google Cloud Console > **APIs & Services** > **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `http://localhost:5173` (for local development)
   - `http://localhost:3000` (alternative dev port)
   - Your production domain when ready

## Step 7: Install Dependencies

Firebase has already been installed. If you need to reinstall:

```bash
npm install firebase
```

## File Structure Created

The following files have been created/modified:

### New Files:
- `src/lib/firebase.ts` - Firebase initialization and configuration
- `src/lib/auth.ts` - Google authentication functions and utilities

### Modified Files:
- `src/pages/Login.tsx` - Updated with Google sign-in functionality
- `.env.local` - Add your Firebase credentials here

## Usage

### Sign In with Google

The login page now includes a "Continue with Google" button that:
1. Opens a Google popup window
2. Allows users to authenticate with their Google account
3. Retrieves user profile information (displayName, email, photoURL)
4. Stores user data in localStorage
5. Redirects to the dashboard on successful login

### User Data Retrieved

When a user signs in with Google, the following data is captured and stored:

```typescript
{
  uid: string;           // Firebase unique user ID
  displayName: string;   // User's full name from Google
  email: string;         // User's email address
  photoURL: string;      // User's profile picture URL
}
```

This data is stored in both:
- **Firebase Auth**: Managed by Firebase for authentication
- **localStorage**: For frontend state management and persistence

### Sign Out

Use the `signOut()` function from `src/lib/auth.ts` to sign out users:

```typescript
import { signOut } from "@/lib/auth";

const handleLogout = async () => {
  try {
    await signOut();
    // Clear state and redirect
  } catch (error) {
    console.error("Sign out failed:", error);
  }
};
```

### Listen to Auth State Changes

Monitor authentication state changes:

```typescript
import { onAuthStateChangedListener } from "@/lib/auth";

useEffect(() => {
  const unsubscribe = onAuthStateChangedListener((user) => {
    if (user) {
      console.log("User signed in:", user);
    } else {
      console.log("User signed out");
    }
  });

  return () => unsubscribe();
}, []);
```

## Common Issues & Solutions

### Issue: "auth/configuration-not-found"
**Solution:** Make sure your `.env.local` file is properly configured with all Firebase credentials. Restart your dev server after adding environment variables.

### Issue: Popup blocked by browser
**Solution:** The browser may block popups if the sign-in isn't triggered by user interaction. Make sure the button click directly calls `handleGoogleLogin()`.

### Issue: CORS or redirect URI errors
**Solution:** Verify that your domain is added to the authorized redirect URIs in Google Cloud Console. For localhost development, add `http://localhost:5173` and `http://localhost:3000`.

### Issue: User data not persisting after page refresh
**Solution:** This should work automatically thanks to `browserLocalPersistence` in firebase.ts. Check browser storage in DevTools (F12 > Application > Local Storage).

## Testing the Implementation

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Navigate to the login page

3. Click "Continue with Google"

4. Complete the Google sign-in flow

5. You should be redirected to the dashboard with a success toast notification

6. Refresh the page - you should still be logged in

## Next Steps

1. **Backend Integration**: Connect the frontend user data with your backend API
2. **User Profile**: Store additional user information in your database
3. **Protected Routes**: Create a route guard to protect dashboard and other pages
4. **Sign Out**: Implement sign-out functionality in your dashboard header
5. **Token Exchange**: If needed, exchange Firebase ID tokens with your backend for JWT

## Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Console](https://console.firebase.google.com)
- [Google Cloud Console](https://console.cloud.google.com)
- [Firebase v9+ Modular SDK](https://firebase.google.com/docs/web/modular-upgrade)

