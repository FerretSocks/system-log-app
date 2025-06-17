// public/js/dataManager.js
import { db, doc, getDoc, setDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getUserId, isGuestMode } from './guestManager.js';

let apiKey = null;
let userSpecificDataLoaded = false;

export async function loadUserConfig() {
    const currentUserId = getUserId();
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
            if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = getApiKey() || '';
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
    if (typeof keyToSave !== 'string' ) {
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

export async function loadUserSpecificData(isCurrentlyGuest, taskMgr, journalMgr, systemMgr, workoutMgr) {
    console.log(`Loading data for ${isCurrentlyGuest ? 'guest' : 'authenticated user'}`);
    userSpecificDataLoaded = false;

    if (isCurrentlyGuest) {
        taskMgr.loadTasks(true);
        journalMgr.loadJournal(true);
        systemMgr.loadSystemData(true);
        // **FIX**: Do not load the workout view here. Only initialize its references.
        workoutMgr.initializeWorkoutReferences(getUserId());
    } else {
        // For authenticated users, loadUserConfig is already called by authStateObserver in auth.js
        taskMgr.initializeTaskReferences();
        journalMgr.initializeJournalReferences();
        workoutMgr.initializeWorkoutReferences(getUserId());

        await taskMgr.loadCategoriesAndTasks();
        // **NOTE**: Journal and System data can be pre-fetched, but workout view cannot.
        journalMgr.setHasJournalLoaded(false); // Set to false so it loads on first click
        systemMgr.setHasSystemDataLoaded(false); // Set to false so it loads on first click
    }
    userSpecificDataLoaded = true;
}

export function clearUserSpecificData(taskMgr, journalMgr, systemMgr, workoutMgr) {
    if (taskMgr) taskMgr.clearTaskData();
    if (journalMgr) journalMgr.clearJournalData();
    if (systemManager) systemMgr.clearSystemData();
    if (workoutMgr) workoutMgr.clearWorkoutData();
    setApiKey(null);
    if (uiElements.apiKeyInput) uiElements.apiKeyInput.value = '';
    userSpecificDataLoaded = false;
    console.log("User-specific data cleared.");
}

export function isUserDataLoaded() {
    return userSpecificDataLoaded;
}