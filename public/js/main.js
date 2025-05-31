// public/js/main.js

// Firebase services (initialized when firebaseService.js is imported)
import { auth, db } from './firebaseService.js';

// UI and Core Logic Modules
import { uiElements, switchToView, initializeAppearanceControls, getCurrentDesign, showFeedback, typewriterScrambleEffect, loadInitialAppearance } from './uiManager.js';
import { playSound } from './soundManager.js';
import { initializeAuth, handleSignIn, handleGuestSignIn, handleSignOut } from './auth.js';
import { isGuestMode, getUserId as getAuthUserId } from './guestManager.js';
import { loadUserSpecificData, clearUserSpecificData, saveApiKey, getApiKey, setApiKey } from './dataManager.js';

// Feature Modules
import * as taskManager from './taskManager.js';
import * as journalManager from './journalManager.js';
import * as systemManager from './systemManager.js';
import * as aiService from './aiService.js';
import { DESIGNS } from './uiConstants.js';
import { debounce } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    async function onAuthStatusChanged(isLoggedIn) {
        if (isLoggedIn) {
            const currentUserId = getAuthUserId();
            taskManager.initializeTaskReferences(currentUserId);
            journalManager.initializeJournalReferences(currentUserId);
            await loadUserSpecificData(isGuestMode(), taskManager, journalManager, systemManager);
        } else {
            taskManager.clearTaskData();
            journalManager.clearJournalData();
            systemManager.clearSystemData();
            clearUserSpecificData(taskManager, journalManager, systemManager);
        }
    }
    
    function handleDesignChange() {
        const activeTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
        switchToView(activeTab, getCurrentDesign(), false);
    }

    function initApp() {
        loadInitialAppearance(); 
        initializeAppearanceControls(handleDesignChange); 
        systemManager.initializeSystemPanel(handleDesignChange); 
        initializeAuth(onAuthStatusChanged);
        setupEventListeners(); 
        console.log("System Log application initialized with debounced search and modal updates.");
    }

    function setupEventListeners() {
        console.log("setupEventListeners called");

        // Authentication Buttons
        if (uiElements.signInBtn) {
            uiElements.signInBtn.addEventListener('click', () => {
                playSound('clickSound');
                handleSignIn();
            });
        }
        if (uiElements.guestSignInBtn) {
            uiElements.guestSignInBtn.addEventListener('click', () => {
                playSound('clickSound');
                handleGuestSignIn();
            });
        }
        if (uiElements.signOutBtn) {
            uiElements.signOutBtn.addEventListener('click', () => {
                playSound('clickSound');
                handleSignOut();
            });
        }

        // Tab Navigation
        if (uiElements.tasksTabBtn) {
            uiElements.tasksTabBtn.addEventListener('click', () => {
                playSound('clickSound');
                switchToView('tasks', getCurrentDesign());
            });
        }
        if (uiElements.journalTabBtn) {
            uiElements.journalTabBtn.addEventListener('click', () => {
                playSound('clickSound');
                if (!journalManager.getHasJournalLoaded() && !isGuestMode()) {
                    journalManager.loadJournal(false);
                } else if (isGuestMode()) {
                    journalManager.loadJournal(true);
                }
                switchToView('journal', getCurrentDesign());
            });
        }
        if (uiElements.systemTabBtn) {
            uiElements.systemTabBtn.addEventListener('click', () => {
                playSound('clickSound');
                if (!systemManager.getHasSystemDataLoaded() && !isGuestMode()) {
                    systemManager.loadSystemData(false);
                } else if (isGuestMode()){
                     systemManager.loadSystemData(true);
                }
                switchToView('system', getCurrentDesign());
            });
        }

        // Task View & Category Manager Modal
        if (uiElements.addTaskBtn) uiElements.addTaskBtn.addEventListener('click', () => { playSound('clickSound'); taskManager.addTask(); });
        if (uiElements.taskInput) uiElements.taskInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); taskManager.addTask(); } });
        if (uiElements.categorySelect) uiElements.categorySelect.addEventListener('change', (e) => taskManager.handleCategoryChange(e.target.value));
        
        if (uiElements.manageCategoriesBtn) {
            uiElements.manageCategoriesBtn.addEventListener('click', () => { 
                playSound('clickSound'); 
                if(uiElements.categoryManagerModal) {
                    uiElements.categoryManagerModal.classList.remove('hidden'); // Ensure display is not none
                    // Add a tiny delay for the display change to take effect before adding animation class
                    requestAnimationFrame(() => {
                        uiElements.categoryManagerModal.classList.add('modal-visible');
                    });
                }
            });
        }
        if (uiElements.closeCategoryManagerBtn) {
            uiElements.closeCategoryManagerBtn.addEventListener('click', () => { 
                playSound('clickSound'); 
                if(uiElements.categoryManagerModal) {
                    uiElements.categoryManagerModal.classList.remove('modal-visible');
                }
            });
        }
        if (uiElements.addCategoryBtn) uiElements.addCategoryBtn.addEventListener('click', () => { playSound('clickSound'); taskManager.addCategory(); });
        if (uiElements.newCategoryInput) uiElements.newCategoryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); taskManager.addCategory(); } });
        
        // Journal View
        if (uiElements.addJournalBtn) uiElements.addJournalBtn.addEventListener('click', () => { playSound('clickSound'); journalManager.addJournalLog(); });
        if (uiElements.journalSearch) {
            uiElements.journalSearch.addEventListener('input', debounce(() => {
                journalManager.handleJournalSearch();
            }, 300));
        }

        // System View
        if (uiElements.saveApiKeyBtn) {
            uiElements.saveApiKeyBtn.addEventListener('click', async () => {
                playSound('clickSound');
                if (uiElements.apiKeyInput) {
                    await saveApiKey(uiElements.apiKeyInput.value);
                }
            });
        }

        // AI Chat Modal
        if (uiElements.closeAiChatBtn) uiElements.closeAiChatBtn.addEventListener('click', () => { playSound('clickSound'); aiService.closeAiChat(); });
        if (uiElements.aiChatSendBtn) uiElements.aiChatSendBtn.addEventListener('click', () => { playSound('clickSound'); aiService.sendAiChatMessage(); });
        if (uiElements.aiChatInput) uiElements.aiChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); aiService.sendAiChatMessage(); e.preventDefault(); } });
    }

    // Start the application
    initApp();
});
