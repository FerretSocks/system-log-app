// public/js/main.js

// Firebase services
import { auth, db } from './firebaseService.js';

// UI and Core Logic Modules
import { uiElements, switchToView, initializeAppearanceControls, getCurrentDesign, showFeedback, populateAiPersonalitiesDropdown } from './uiManager.js';
import { initializeAuth, handleSignIn, handleGuestSignIn, handleSignOut } from './auth.js';
import { isGuestMode, getUserId as getAuthUserId } from './guestManager.js';
import { loadUserSpecificData, clearUserSpecificData, saveApiKey } from './dataManager.js';

// Feature Modules
import * as taskManager from './taskManager.js';
import * as journalManager from './journalManager.js';
import * as systemManager from './systemManager.js';
import * as workoutManager from './workoutManager.js';
import * as aiService from './aiService.js';
import { AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY } from './aiConstants.js';
import { debounce } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    async function onAuthStatusChanged(isLoggedIn) {
        if (isLoggedIn) {
            const currentUserId = getAuthUserId();
            taskManager.initializeTaskReferences(currentUserId);
            journalManager.initializeJournalReferences(currentUserId);
            workoutManager.initializeWorkoutReferences(currentUserId);
            await loadUserSpecificData(isGuestMode(), taskManager, journalManager, systemManager, workoutManager);

            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, getCurrentDesign(), true);

            // Trigger boot-up animation for Mecha theme
            if (getCurrentDesign() === 'design-mecha-manual' && uiElements.appContainer) {
                uiElements.appContainer.classList.add('booting-up');
                // Remove the class after the animation finishes to prevent re-triggering
                setTimeout(() => {
                    uiElements.appContainer.classList.remove('booting-up');
                }, 1500); // Duration should be longer than the animation sequence
            }

            // Conditionally load content for the active tab after login
            if (savedTab === 'journal' && !journalManager.getHasJournalLoaded()) {
                journalManager.loadJournal(isGuestMode());
            }
             if (savedTab === 'system' && !systemManager.getHasSystemDataLoaded()){
                systemManager.loadSystemData(isGuestMode());
            }
            if (savedTab === 'workout' && !workoutManager.getHasWorkoutLoaded()) {
                workoutManager.loadWorkoutView();
            }

        } else {
            taskManager.clearTaskData();
            journalManager.clearJournalData();
            systemManager.clearSystemData();
            workoutManager.clearWorkoutData();
            clearUserSpecificData(taskManager, journalManager, systemManager, workoutManager);
        }
    }

    function handleDesignChange() {
        const activeTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
        switchToView(activeTab, getCurrentDesign(), false);
    }

    function initApp() {
        systemManager.initializeSystemPanel(handleDesignChange);
        
        if (uiElements.aiPersonalitySelect) {
            populateAiPersonalitiesDropdown(AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY);
        } else {
            console.warn("AI Personality select element not found during initApp.");
        }
        
        initializeAuth(onAuthStatusChanged);
        setupEventListeners();
        console.log("System Log application initialized.");
    }

    function setupEventListeners() {
        if (uiElements.signInBtn) uiElements.signInBtn.addEventListener('click', () => { handleSignIn(); });
        if (uiElements.guestSignInBtn) uiElements.guestSignInBtn.addEventListener('click', () => { handleGuestSignIn(); });
        if (uiElements.signOutBtn) uiElements.signOutBtn.addEventListener('click', () => { handleSignOut(); });

        if (uiElements.tasksTabBtn) uiElements.tasksTabBtn.addEventListener('click', () => { switchToView('tasks', getCurrentDesign()); });
        
        if (uiElements.journalTabBtn) {
            uiElements.journalTabBtn.addEventListener('click', () => {
                switchToView('journal', getCurrentDesign());
                if (!journalManager.getHasJournalLoaded()) {
                    journalManager.loadJournal(isGuestMode());
                }
            });
        }
        
        if (uiElements.workoutTabBtn) {
            uiElements.workoutTabBtn.addEventListener('click', () => {
                switchToView('workout', getCurrentDesign());
                if (!workoutManager.getHasWorkoutLoaded()) {
                    workoutManager.loadWorkoutView();
                }
            });
        }
        
        if (uiElements.systemTabBtn) {
            uiElements.systemTabBtn.addEventListener('click', () => {
                switchToView('system', getCurrentDesign());
                if (!systemManager.getHasSystemDataLoaded()){
                    systemManager.loadSystemData(isGuestMode());
                }
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
        if (uiElements.vitaminTrackerBtn) uiElements.vitaminTrackerBtn.addEventListener('click', () => { journalManager.logVitaminsTaken(); });
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