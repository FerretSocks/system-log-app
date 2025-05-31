// public/js/dataManager.js
import { db, doc, getDoc, setDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getUserId, isGuestMode } from './guestManager.js'; // Added isGuestMode here

let apiKey = null;
let userSpecificDataLoaded = false;

export async function loadUserConfig() {
    const currentUserId = getUserId();
    // Line 11 where the error occurred is below, now `isGuestMode` will be defined
    if (!currentUserId || isGuestMode()) { 
        console.log("Guest mode or no user ID, skipping user config load for API key.");
        setApiKey(null);
        if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = '';
        return;
    }

    const configRef = doc(db, `users/${currentUserId}/configuration/api`);
    try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists() && configSnap.data().geminiApiKey) {
            setApiKey(configSnap.data().geminiApiKey);
            if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = getApiKey() || ''; // Ensure value is not undefined
            console.log("User API key loaded.");
        } else {
            setApiKey(null);
            if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = '';
            console.log("No API key found for user.");
        }
    } catch (error) {
        console.error("Error loading user config:", error);
        showFeedback("Error loading user configuration.", true);
        setApiKey(null);
        if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = '';
    }
}

export async function saveApiKey(keyToSave) {
    const currentUserId = getUserId();
    if (!currentUserId || isGuestMode()) {
        showFeedback("API Key cannot be saved in guest mode or if not logged in.", true);
        return;
    }
    // Basic validation for the key itself can be added here if needed
    if (typeof keyToSave !== 'string' ) { // Allow empty string to clear the key
        showFeedback("Invalid API Key format.", true);
        return;
    }

    const configRef = doc(db, `users/${currentUserId}/configuration/api`);
    try {
        await setDoc(configRef, { geminiApiKey: keyToSave });
        setApiKey(keyToSave);
        showFeedback("API Key saved securely.");
    } catch (error) {
        console.error("Error saving API Key:", error);
        showFeedback("Error: Could not save API Key.", true);
    }
}

export function getApiKey() {
    return apiKey;
}

export function setApiKey(key) {
    apiKey = key;
}

export async function loadUserSpecificData(isCurrentlyGuest, taskMgr, journalMgr, systemMgr) {
    console.log(`Loading data for ${isCurrentlyGuest ? 'guest' : 'authenticated user'}`);
    userSpecificDataLoaded = false; 

    if (isCurrentlyGuest) {
        taskMgr.loadTasks(true);
        journalMgr.loadJournal(true);
        systemMgr.loadSystemData(true); 
    } else {
        // For authenticated users, loadUserConfig is already called by authStateObserver in auth.js
        // We proceed to load other user-specific data.
        taskMgr.initializeTaskReferences(); // Initialize with current (non-guest) userId
        journalMgr.initializeJournalReferences(); // Initialize with current (non-guest) userId
        // systemManager.initializeSystemReferences(); // If needed in future

        await taskMgr.loadCategoriesAndTasks(); // This loads categories then tasks for authenticated user
        journalMgr.loadJournal(false); 
        journalMgr.setHasJournalLoaded(true); // Mark as loaded
        systemMgr.loadSystemData(false); 
        systemMgr.setHasSystemDataLoaded(true); // Mark as loaded
    }
    userSpecificDataLoaded = true;
}

export function clearUserSpecificData(taskMgr, journalMgr, systemMgr) {
    if (taskMgr) taskMgr.clearTaskData();
    if (journalMgr) journalMgr.clearJournalData();
    if (systemMgr) systemMgr.clearSystemData();
    setApiKey(null);
    if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = ''; // Clear API key field
    userSpecificDataLoaded = false;
    console.log("User-specific data cleared.");
}

export function isUserDataLoaded() {
    return userSpecificDataLoaded;
}