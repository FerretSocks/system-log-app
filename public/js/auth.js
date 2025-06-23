// public/js/auth.js
import {
    auth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    signInAnonymously
} from './firebaseService.js';
// Removed specific uiManager and guestManager imports from here,
// as auth.js will now pass the raw Firebase user object to main.js
// for centralized handling.
import { uiElements, showFeedback, typewriterScrambleEffect, showLoadingOverlay, hideLoadingOverlay } from './uiManager.js'; // Retain only what's needed for loading overlay and feedback

let currentAuthCallback = null;
let onAuthInitCallback = null; // NEW: Callback for initial auth state processing completion

async function authStateObserver(user) {
    // Hide loading overlay once auth state is resolved. This remains here as auth.js controls auth process display.
    hideLoadingOverlay();

    // The core logic for setting user ID, guest mode, and updating initial UI
    // is now moved to onAuthStatusChanged in main.js.
    // auth.js now primarily focuses on the Firebase auth state and passing it.
    
    if (currentAuthCallback) {
        try {
            await currentAuthCallback(user); // NEW: Pass the 'user' object (or null) to the callback
        } catch (error) {
            console.error("Error in auth callback after login/logout:", error);
            // Optionally show feedback if this callback fails, though main.js should handle most.
        }
    }

    // NEW: After the initial auth state is processed by the main app,
    // call the init callback if it exists. This ensures main.js proceeds safely.
    if (onAuthInitCallback) {
        onAuthInitCallback();
        onAuthInitCallback = null; // Call once
    }
}

// NEW: Add onInitCb parameter to initializeAuth
export function initializeAuth(authCb, onInitCb) {
    if (!auth) {
        console.error("Auth service is not available.");
        showFeedback("Authentication service error. Please refresh.", true);
        return;
    }
    currentAuthCallback = authCb;
    onAuthInitCallback = onInitCb; // Store the initialisation callback
    onAuthStateChanged(auth, authStateObserver);
}

export async function handleSignIn() {
    console.log("auth.js: handleSignIn called");
    if (!auth) {
        console.error("Auth service is not available for sign-in.");
        showFeedback("Authentication service error.", true);
        return;
    }
    await showLoadingOverlay("AUTHENTICATING..."); // Show loading message
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
        // authStateObserver will handle the rest, including hiding the overlay
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        showFeedback(`Sign-in failed: ${error.message}`, true);
        hideLoadingOverlay(); // Hide overlay on error
    }
}

export async function handleGuestSignIn() {
    console.log("auth.js: handleGuestSignIn called");
    if (!auth) {
        console.error("Auth service is not available for guest sign-in.");
        showFeedback("Authentication service error.", true);
        return;
    }
    await showLoadingOverlay("ACCESSING GUEST MODE..."); // Show loading message
    try {
        await signInAnonymously(auth);
        // authStateObserver will handle the rest
    } catch (error) {
        console.error("Anonymous sign-in error:", error);
        showFeedback("Error logging in as guest.", true);
        hideLoadingOverlay(); // Hide overlay on error
    }
    // No finally needed here as authStateObserver will call hideLoadingOverlay
}

export async function handleSignOut() {
    if (!auth) {
        console.error("Auth service is not available for sign-out.");
        return;
    }
    await showLoadingOverlay("DISCONNECTING..."); // Show loading message
    try {
        await firebaseSignOut(auth);
        // authStateObserver will handle UI changes and data cleanup
    } catch (error) {
        console.error("Sign Out Error:", error);
        showFeedback("Error signing out.", true);
        hideLoadingOverlay(); // Hide overlay on error
    }
}