// public/js/main.js

// Firebase services
import { auth, db } from './firebaseService.js';

// UI and Core Logic Modules
import { uiElements, switchToView, initializeAppearanceControls, getCurrentDesign, showFeedback, populateAiPersonalitiesDropdown, showLoadingOverlay, hideLoadingOverlay, initializeUIElements } from './uiManager.js';
import { initializeAuth, handleSignIn, handleGuestSignIn, handleSignOut } from './auth.js';
import { isGuestMode, getUserId as getAuthUserId, setGuestMode, setUserId, loadGuestDataFromLocalStorage, clearGuestData } from './guestManager.js';
import { loadUserSpecificData, clearUserSpecificData, saveApiKey, setApiKey, loadUserConfig } from './dataManager.js';

// Feature Modules
import * as taskManager from './taskManager.js';
import * as journalManager from './journalManager.js';
import * as systemManager from './systemManager.js';
import * as workoutManager from './workoutManager.js';
import * as bookManager from './bookManager.js';
import * as aiService from './aiService.js';
import { AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY } from './aiConstants.js';
import { debounce } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    initializeUIElements();

    async function onAuthStatusChanged(user) {
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
                await loadUserConfig();
                showFeedback(`Welcome, ${uiElements.userIdDisplay.textContent}! System synced.`, false);
            }
            
            const currentUserId = getAuthUserId();
            taskManager.initializeTaskReferences(currentUserId);
            journalManager.initializeJournalReferences(currentUserId);
            workoutManager.initializeWorkoutReferences(currentUserId);
            bookManager.initializeBookReferences(currentUserId);

            await loadUserSpecificData(isGuestMode(), taskManager, journalManager, systemManager, workoutManager);

            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, getCurrentDesign(), true);

            if (getCurrentDesign() === 'design-mecha-manual' && uiElements.appContainer) {
                uiElements.appContainer.classList.add('booting-up');
                setTimeout(() => {
                    uiElements.appContainer.classList.remove('booting-up');
                }, 1500);
            }

            if (savedTab === 'journal' && !journalManager.getHasJournalLoaded()) {
                journalManager.loadJournal(isGuestMode());
            }
             if (savedTab === 'system' && !systemManager.getHasSystemDataLoaded()){
                systemManager.loadSystemData(isGuestMode());
            }
            if (savedTab === 'workout' && !workoutManager.getHasWorkoutLoaded()) {
                workoutManager.loadWorkoutView();
            }
            if (savedTab === 'books' && !bookManager.getHasBooksLoaded()) {
                bookManager.loadBooks(isGuestMode());
            }

        } else {
            setUserId(null);
            setGuestMode(false);
            if(uiElements.appContainer) uiElements.appContainer.classList.add('hidden');
            if(uiElements.loginContainer) uiElements.loginContainer.classList.remove('hidden');
            
            taskManager.clearTaskData();
            journalManager.clearJournalData();
            systemManager.clearSystemData();
            workoutManager.clearWorkoutData();
            bookManager.clearBookData();
            clearGuestData(); 
            
            setApiKey(null);

            // This should be a function in uiManager that loads initial appearance settings
            // For now, we assume it exists and does its job.
            // loadInitialAppearance(); 
            showFeedback("Disconnected. Awaiting authentication.", false);
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
        
        initializeAuth(onAuthStatusChanged, initializeUIElements);
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

        if (uiElements.bookReviewTabBtn) {
            uiElements.bookReviewTabBtn.addEventListener('click', () => {
                switchToView('books', getCurrentDesign());
                if (!bookManager.getHasBooksLoaded()) {
                    bookManager.loadBooks(isGuestMode());
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

        // Book Manager Event Listeners
        if (uiElements.addBookBtn) uiElements.addBookBtn.addEventListener('click', () => { bookManager.openAddBookModal(); });
        if (uiElements.saveNewBookBtn) uiElements.saveNewBookBtn.addEventListener('click', () => { bookManager.saveNewBook(); });
        if (uiElements.cancelAddBookBtn) uiElements.cancelAddBookBtn.addEventListener('click', () => { bookManager.closeAddBookModal(); });
        if (uiElements.saveBookNotesBtn) uiElements.saveBookNotesBtn.addEventListener('click', () => { bookManager.saveBookNotes(); }); // Corrected Listener
        if (uiElements.closeBookNotesModalBtn) uiElements.closeBookNotesModalBtn.addEventListener('click', () => { bookManager.closeBookNotesModal(); });
        if (uiElements.deleteBookBtn) uiElements.deleteBookBtn.addEventListener('click', () => { bookManager.deleteBook(); });

    }

    initApp();
});