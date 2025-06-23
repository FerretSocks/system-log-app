// public/js/main.js

// Firebase services
import { auth, db } from './firebaseService.js';

// UI and Core Logic Modules
import { uiElements, switchToView, initializeAppearanceControls, getCurrentDesign, showFeedback, populateAiPersonalitiesDropdown, showLoadingOverlay, hideLoadingOverlay, initializeUIElements } from './uiManager.js';
import { initializeAuth, handleSignIn, handleGuestSignIn, handleSignOut } from './auth.js';
import { isGuestMode, getUserId as getAuthUserId, setGuestMode, setUserId, loadGuestDataFromLocalStorage, clearGuestData } from './guestManager.js'; // NEW: Import setUserId, setGuestMode, loadGuestDataFromLocalStorage, clearGuestData
import { loadUserSpecificData, clearUserSpecificData, saveApiKey, setApiKey, loadUserConfig } from './dataManager.js'; // NEW: Import setApiKey, loadUserConfig

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
    // NEW: Call initializeUIElements FIRST to populate uiElements
    initializeUIElements();

    // NEW: onAuthStatusChanged now receives the 'user' object directly
    async function onAuthStatusChanged(user) {
        // Hide loading overlay once auth state is resolved
        hideLoadingOverlay();

        if (user) {
            // User is logged in (authenticated or anonymous)
            if(uiElements.appContainer) uiElements.appContainer.classList.remove('hidden');
            if(uiElements.loginContainer) uiElements.loginContainer.classList.add('hidden');
            setUserId(user.uid); // Set the global user ID

            if (user.isAnonymous) {
                setGuestMode(true);
                if(uiElements.userIdDisplay) uiElements.userIdDisplay.textContent = 'GUEST';
                if (uiElements.apiKeySection) uiElements.apiKeySection.classList.add('hidden');
                const taskCatContainer = document.getElementById('taskCategoryContainer');
                if (taskCatContainer) taskCatContainer.classList.add('hidden');
                setApiKey(null); // Clear API key for guests
                loadGuestDataFromLocalStorage(); // Load guest-specific data
                showFeedback("Guest mode activated. Data is local.", false);
            } else {
                // Authenticated User
                setGuestMode(false);
                if(uiElements.userIdDisplay) uiElements.userIdDisplay.textContent = user.displayName?.split(' ')[0].toUpperCase() || 'AGENT';
                if (uiElements.apiKeySection) uiElements.apiKeySection.classList.remove('hidden');
                const taskCatContainer = document.getElementById('taskCategoryContainer');
                if (taskCatContainer) taskCatContainer.classList.remove('hidden');
                await loadUserConfig(); // Load API key etc. for authenticated user
                showFeedback(`Welcome, ${uiElements.userIdDisplay.textContent}! System synced.`, false);
            }
            
            // Initialize references for all managers based on the determined mode
            const currentUserId = getAuthUserId();
            taskManager.initializeTaskReferences(currentUserId);
            journalManager.initializeJournalReferences(currentUserId);
            workoutManager.initializeWorkoutReferences(currentUserId);
            bookManager.initializeBookReferences(currentUserId);

            // Load user-specific data (tasks, journal, etc.)
            await loadUserSpecificData(isGuestMode(), taskManager, journalManager, systemManager, workoutManager);

            // Determine and switch to the last saved tab or default
            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, getCurrentDesign(), true);

            // Trigger boot-up animation for Mecha theme (if applicable)
            if (getCurrentDesign() === 'design-mecha-manual' && uiElements.appContainer) {
                uiElements.appContainer.classList.add('booting-up');
                setTimeout(() => {
                    uiElements.appContainer.classList.remove('booting-up');
                }, 1500);
            }

            // Conditionally load content for the active tab (if it wasn't already loaded by loadUserSpecificData)
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
            // User is logged out
            setUserId(null); // Clear global user ID
            setGuestMode(false); // Ensure guest mode is off
            if(uiElements.appContainer) uiElements.appContainer.classList.add('hidden');
            if(uiElements.loginContainer) uiElements.loginContainer.classList.remove('hidden');
            
            // Clear all user-specific data from managers
            taskManager.clearTaskData();
            journalManager.clearJournalData();
            systemManager.clearSystemData();
            workoutManager.clearWorkoutData();
            bookManager.clearBookData();
            clearGuestData(); // Clear guest data from local storage
            
            setApiKey(null); // Clear API key on logout

            loadInitialAppearance(); // Reset appearance to default if needed
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
        
        // Pass initializeUIElements as the onInitCb to initializeAuth
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

        // NEW: Event listener for the "Books" tab
        if (uiElements.bookReviewTabBtn) {
            uiElements.bookReviewTabBtn.addEventListener('click', () => {
                switchToView('books', getCurrentDesign()); // Use 'books' as the viewName
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


        // NEW: Book Manager Event Listeners
        if (uiElements.addBookBtn) uiElements.addBookBtn.addEventListener('click', () => { bookManager.openAddBookModal(); });
        if (uiElements.saveNewBookBtn) uiElements.saveNewBookBtn.addEventListener('click', () => { bookManager.saveNewBook(); });
        if (uiElements.cancelAddBookBtn) uiElements.cancelAddBookBtn.addEventListener('click', () => { bookManager.closeAddBookModal(); });
        if (uiElements.addBookNoteBtn) uiElements.addBookNoteBtn.addEventListener('click', () => { bookManager.saveBookNotes(); });
        if (uiElements.closeBookNotesModalBtn) uiElements.closeBookNotesModalBtn.addEventListener('click', () => { bookManager.closeBookNotesModal(); });
        if (uiElements.deleteBookBtn) uiElements.deleteBookBtn.addEventListener('click', () => { bookManager.deleteBook(); });

    }

    initApp();
});