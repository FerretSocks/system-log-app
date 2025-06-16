// public/js/main.js

// Firebase services
import { auth, db } from './firebaseService.js'; // Assuming firebaseService initializes and exports these

// UI and Core Logic Modules
import { uiElements, switchToView, initializeAppearanceControls, getCurrentDesign, showFeedback, populateAiPersonalitiesDropdown } from './uiManager.js'; // Added populateAiPersonalitiesDropdown
// import { playSound } from './soundManager.js'; // playSound import removed
import { initializeAuth, handleSignIn, handleGuestSignIn, handleSignOut } from './auth.js';
import { isGuestMode, getUserId as getAuthUserId } from './guestManager.js';
import { loadUserSpecificData, clearUserSpecificData, saveApiKey } from './dataManager.js'; // Removed getApiKey, setApiKey as they are internal to dataManager

// Feature Modules
import * as taskManager from './taskManager.js';
import * as journalManager from './journalManager.js';
import * as systemManager from './systemManager.js';
import * as workoutManager from './workoutManager.js'; // <-- NEW: Import workout manager
import * as aiService from './aiService.js';
import { AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY } from './aiConstants.js'; // Import AI constants
import { debounce } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    async function onAuthStatusChanged(isLoggedIn) {
        if (isLoggedIn) {
            const currentUserId = getAuthUserId(); 
            taskManager.initializeTaskReferences(currentUserId); 
            journalManager.initializeJournalReferences(currentUserId); 
            workoutManager.initializeWorkoutReferences(currentUserId);
            await loadUserSpecificData(isGuestMode(), taskManager, journalManager, systemManager, workoutManager);
            
            // --- FIX: This block ensures the correct view's content is loaded on app start ---
            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, getCurrentDesign(), true);
            if (savedTab === 'workout') {
                workoutManager.loadWorkoutView();
            }
            if (savedTab === 'journal') {
                 if (!journalManager.getHasJournalLoaded()) {
                    journalManager.loadJournal(isGuestMode());
                 }
            }
             if (savedTab === 'system') {
                if (!systemManager.getHasSystemDataLoaded()){
                    systemManager.loadSystemData(isGuestMode());
                }
            }
            // --- END OF FIX ---

        } else {
            // Clear data for all managers
            taskManager.clearTaskData();
            journalManager.clearJournalData();
            systemManager.clearSystemData();
            workoutManager.clearWorkoutData(); 
            // Clear general user-specific data (like API key from memory)
            clearUserSpecificData(taskManager, journalManager, systemManager);
        }
    }

    function handleDesignChange() {
        const activeTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
        switchToView(activeTab, getCurrentDesign(), false); // Pass currentDesign
    }

    function initApp() {
        // Initialize UI components first
        systemManager.initializeSystemPanel(handleDesignChange); 
        
        if (uiElements.aiPersonalitySelect) {
            populateAiPersonalitiesDropdown(AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY);
        } else {
            console.warn("AI Personality select element not found during initApp.");
        }
        
        initializeAuth(onAuthStatusChanged);
        setupEventListeners();
        console.log("System Log application initialized with AI personalities.");
    }

    function setupEventListeners() {
        if (uiElements.signInBtn) uiElements.signInBtn.addEventListener('click', () => { handleSignIn(); });
        if (uiElements.guestSignInBtn) uiElements.guestSignInBtn.addEventListener('click', () => { handleGuestSignIn(); });
        if (uiElements.signOutBtn) uiElements.signOutBtn.addEventListener('click', () => { handleSignOut(); });

        if (uiElements.tasksTabBtn) uiElements.tasksTabBtn.addEventListener('click', () => { switchToView('tasks', getCurrentDesign()); });
        if (uiElements.journalTabBtn) {
            uiElements.journalTabBtn.addEventListener('click', () => {
                if (!journalManager.getHasJournalLoaded() && !isGuestMode()) {
                    journalManager.loadJournal(false); 
                } else if (isGuestMode() && !journalManager.getHasJournalLoaded()) {
                    journalManager.loadJournal(true);
                }
                switchToView('journal', getCurrentDesign());
            });
        }
        if (uiElements.workoutTabBtn) {
            uiElements.workoutTabBtn.addEventListener('click', () => {
                if (!workoutManager.getHasWorkoutLoaded()) {
                    workoutManager.loadWorkoutView();
                }
                switchToView('workout', getCurrentDesign());
            });
        }
        if (uiElements.systemTabBtn) {
            uiElements.systemTabBtn.addEventListener('click', () => {
                if (!systemManager.getHasSystemDataLoaded() && !isGuestMode()) {
                    systemManager.loadSystemData(false);
                } else if (isGuestMode()){
                     systemManager.loadSystemData(true);
                }
                switchToView('system', getCurrentDesign());
            });
        }

        if (uiElements.addTaskBtn) uiElements.addTaskBtn.addEventListener('click', () => { taskManager.addTask(); });
        if (uiElements.taskInput) uiElements.taskInput.addEventListener('keypress', e => { if (e.key === 'Enter') { taskManager.addTask(); } });
        if (uiElements.categorySelect) uiElements.categorySelect.addEventListener('change', (e) => taskManager.handleCategoryChange(e.target.value));
        
        if (uiElements.manageCategoriesBtn) {
            uiElements.manageCategoriesBtn.addEventListener('click', () => { 
                if(uiElements.categoryManagerModal) {
                    uiElements.categoryManagerModal.classList.remove('hidden');
                    requestAnimationFrame(() => uiElements.categoryManagerModal.classList.add('modal-visible'));
                }
            });
        }
        if (uiElements.closeCategoryManagerBtn) {
            uiElements.closeCategoryManagerBtn.addEventListener('click', () => { 
                if(uiElements.categoryManagerModal) uiElements.categoryManagerModal.classList.remove('modal-visible');
            });
        }
        if (uiElements.addCategoryBtn) uiElements.addCategoryBtn.addEventListener('click', () => { taskManager.addCategory(); });
        if (uiElements.newCategoryInput) uiElements.newCategoryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { taskManager.addCategory(); } });
        
        if (uiElements.addJournalBtn) uiElements.addJournalBtn.addEventListener('click', () => { journalManager.addJournalLog(); });
        if (uiElements.journalSearch) {
            uiElements.journalSearch.addEventListener('input', debounce(() => journalManager.handleJournalSearch(), 300));
        }

        if (uiElements.saveApiKeyBtn) {
            uiElements.saveApiKeyBtn.addEventListener('click', async () => {
                if (uiElements.apiKeyInput) await saveApiKey(uiElements.apiKeyInput.value);
            });
        }

        if (uiElements.closeAiChatBtn) uiElements.closeAiChatBtn.addEventListener('click', () => { aiService.closeAiChat(); });
        if (uiElements.aiChatSendBtn) uiElements.aiChatSendBtn.addEventListener('click', () => { aiService.sendAiChatMessage(); });
        if (uiElements.aiChatInput) uiElements.aiChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') { aiService.sendAiChatMessage(); e.preventDefault(); } });
    }

    initApp();
});