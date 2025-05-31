// public/js/auth.js
import {
    auth,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    signInAnonymously
} from './firebaseService.js';
import { uiElements, showFeedback, typewriterScrambleEffect, loadInitialAppearance, getCurrentDesign, switchToView as switchViewManager, showLoadingOverlay, hideLoadingOverlay } from './uiManager.js'; // Added showLoadingOverlay, hideLoadingOverlay
import { loadGuestDataFromLocalStorage, clearGuestData, isGuestMode, setGuestMode, getUserId, setUserId } from './guestManager.js';
import { loadUserSpecificData, clearUserSpecificData, loadUserConfig, getApiKey, setApiKey } from './dataManager.js';

let currentAuthCallback = null;

async function authStateObserver(user) {
    // Hide loading overlay once auth state is resolved
    hideLoadingOverlay();

    if (user) {
        if(uiElements.appContainer) uiElements.appContainer.classList.remove('hidden');
        if(uiElements.loginContainer) uiElements.loginContainer.classList.add('hidden');
        setUserId(user.uid);

        if (user.isAnonymous) {
            setGuestMode(true);
            if(uiElements.userIdDisplay) uiElements.userIdDisplay.textContent = 'GUEST';
            if (uiElements.apiKeySection) uiElements.apiKeySection.classList.add('hidden');
            const taskCatContainer = document.getElementById('taskCategoryContainer');
            if (taskCatContainer) taskCatContainer.classList.add('hidden');
            setApiKey(null);
            loadGuestDataFromLocalStorage();
            showFeedback("Guest mode activated. Data is local.", false);
        } else {
            setGuestMode(false);
            if(uiElements.userIdDisplay) uiElements.userIdDisplay.textContent = user.displayName?.split(' ')[0].toUpperCase() || 'AGENT';
            if (uiElements.apiKeySection) uiElements.apiKeySection.classList.remove('hidden');
            const taskCatContainer = document.getElementById('taskCategoryContainer');
            if (taskCatContainer) taskCatContainer.classList.remove('hidden');
            await loadUserConfig(); // Load API key etc.
            showFeedback(`Welcome, ${uiElements.userIdDisplay.textContent}! System synced.`, false);
        }
        
        loadInitialAppearance(); // Ensure appearance is applied after login state is known

        if (currentAuthCallback) {
            try {
                await currentAuthCallback(true); // Indicates user is now logged in
            } catch (error) {
                console.error("Error in auth callback after login:", error);
                showFeedback("Error initializing app components.", true);
            }
        }
        
        const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
        switchViewManager(savedTab, getCurrentDesign(), true); // True for initial load (no title animation)

    } else {
        setUserId(null); 
        setGuestMode(false); 
        if(uiElements.appContainer) uiElements.appContainer.classList.add('hidden');
        if(uiElements.loginContainer) uiElements.loginContainer.classList.remove('hidden');
        
        if (currentAuthCallback) {
            try {
                await currentAuthCallback(false); 
            } catch (error) {
                console.error("Error in auth callback after logout:", error);
            }
        }
        setApiKey(null); 
        clearGuestData(); 
        // clearUserSpecificData is called by onAuthStatusChanged in main.js
        loadInitialAppearance();
        showFeedback("Disconnected. Awaiting authentication.", false);
    }
}

export function initializeAuth(authCb) {
    if (!auth) {
        console.error("Auth service is not available.");
        showFeedback("Authentication service error. Please refresh.", true);
        return;
    }
    currentAuthCallback = authCb;
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
