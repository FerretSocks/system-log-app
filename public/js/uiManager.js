// public/js/uiManager.js
import { DESIGNS, PALETTES, DESIGN_SPECIFIC_PALETTES, DESIGN_DEFAULT_PALETTES, TYPEWRITER_SPEED, SCRAMBLE_CYCLES, CHAR_POOL } from './uiConstants.js';

// Private variable to hold the actual UI elements after initialization
let _uiElements = {};

// Export a proxy object that will contain the initialized elements
export const uiElements = new Proxy(_uiElements, {
    get: (target, prop) => {
        if (Object.keys(target).length === 0 && prop !== 'length' && prop !== 'prototype' && prop !== 'constructor') {
            console.warn(`Attempted to access uiElements.${String(prop)} before initializeUIElements was called.`);
        }
        return target[prop];
    },
    set: (target, prop, value) => {
        target[prop] = value;
        return true;
    }
});


let feedbackTimeout;
export function showFeedback(message, isError = false) {
    if (!uiElements.feedbackBox) {
        console.warn("Feedback box element not found.");
        return;
    }
    clearTimeout(feedbackTimeout);
    uiElements.feedbackBox.textContent = message;
    uiElements.feedbackBox.style.backgroundColor = isError ? 'var(--accent-danger)' : 'var(--accent-secondary)';
    uiElements.feedbackBox.classList.remove('hidden');
    feedbackTimeout = setTimeout(() => uiElements.feedbackBox.classList.add('hidden'), 3000);
}

let activeScrambleTimers = [];
export function typewriterScrambleEffect(element, text) {
    return new Promise((resolve) => {
        if (!element) {
            console.warn("typewriterScrambleEffect: Target element not found.");
            resolve();
            return;
        }
        element.classList.remove('typing-done');
        activeScrambleTimers.forEach(timer => clearInterval(timer));
        activeScrambleTimers = [];
        element.textContent = '';
        let revealedText = '';
        let i = 0;

        const typeCharacter = () => {
            if (i < text.length) {
                const originalChar = text.charAt(i);
                let scrambleCount = 0;
                const scrambleInterval = setInterval(() => {
                    if (scrambleCount >= SCRAMBLE_CYCLES) {
                        clearInterval(scrambleInterval);
                        revealedText += originalChar;
                        element.textContent = revealedText;
                        i++;
                        if (i >= text.length) {
                            element.classList.add('typing-done');
                            resolve();
                        }
                        else { typeCharacter(); }
                    } else {
                        const randomChar = CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length));
                        element.textContent = revealedText + randomChar;
                        scrambleCount++;
                    }
                }, TYPEWRITER_SPEED / 2);
                activeScrambleTimers.push(scrambleInterval);
            } else {
                element.classList.add('typing-done');
                resolve();
            }
        };
        if (text && text.length > 0) { typeCharacter(); } else { resolve(); }
    });
}

export async function showLoadingOverlay(message = "LOADING...") {
    if (uiElements.loadingOverlay && uiElements.loadingMessageText) {
        uiElements.loadingOverlay.classList.remove('hidden');
        await typewriterScrambleEffect(uiElements.loadingMessageText, message);
    } else {
        console.warn("Loading overlay elements not found or not initialized.");
    }
}

export function hideLoadingOverlay() {
    if (uiElements.loadingOverlay && uiElements.loadingMessageText) {
        uiElements.loadingOverlay.classList.add('hidden');
        uiElements.loadingMessageText.textContent = '';
    }
}


export function switchToView(viewName, currentDesignValue, isInitialLoad = false) {
    if (Object.keys(_uiElements).length === 0) {
        console.warn("uiElements not initialized yet when switchToView was called.");
        return; 
    }

    const views = { tasks: uiElements.tasksView, journal: uiElements.journalView, system: uiElements.systemView, workout: uiElements.workoutView, books: uiElements.bookReviewView };
    const tabs = { tasks: uiElements.tasksTabBtn, journal: uiElements.journalTabBtn, system: uiElements.systemTabBtn, workout: uiElements.workoutTabBtn, books: uiElements.bookReviewTabBtn };

    Object.values(views).forEach(v => v?.classList.add('hidden'));
    Object.values(tabs).forEach(t => t?.classList.remove('active'));

    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
        if (tabs[viewName]) {
             tabs[viewName].classList.add('active');
        }
        localStorage.setItem('systemlog-activeTab', viewName);
        const titles = { tasks: "Task Log", journal: "Daily Entry", system: "System Panel", workout: "Workout Log", books: "Book Reviews" }; 
        const titleElement = uiElements[`${viewName}ViewTitle`];

        if (titleElement) {
            titleElement.classList.remove('fade-in-title');
            titleElement.classList.remove('typing-done'); 
            void titleElement.offsetWidth; 

            if (isInitialLoad) {
                titleElement.textContent = titles[viewName];
                titleElement.classList.add('typing-done');
            } else {
                typewriterScrambleEffect(titleElement, titles[viewName]);
            }
        }
    } else {
        console.warn(`View "${viewName}" not found in uiElements.`);
    }
}

let currentDesign = DESIGNS['Mecha Manual'];
let currentPalette = PALETTES['Heavy Industry'];

export function populateAiPersonalitiesDropdown(personalities, defaultKey) {
    if (!uiElements.aiPersonalitySelect) {
        console.warn("AI personality select dropdown not found in UI elements.");
        return;
    }
    uiElements.aiPersonalitySelect.innerHTML = '';

    for (const key in personalities) {
        if (Object.hasOwnProperty.call(personalities, key)) {
            const personality = personalities[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = personality.name;
            uiElements.aiPersonalitySelect.appendChild(option);
        }
    }

    if (defaultKey && personalities[defaultKey]) {
        uiElements.aiPersonalitySelect.value = defaultKey;
    } else if (Object.keys(personalities).length > 0) {
        uiElements.aiPersonalitySelect.value = Object.keys(personalities)[0];
    }
}


export function initializeAppearanceControls(onDesignChangeCallback) {
    if (!uiElements.themeSwitcher) return;
    uiElements.themeSwitcher.innerHTML = '';

    const designHeader = document.createElement('h4');
    designHeader.textContent = 'Overall Design:';
    designHeader.className = 'jp-subtitle !uppercase !text-sm !text-left !mb-1 !mt-0';
    uiElements.themeSwitcher.appendChild(designHeader);

    const designContainer = document.createElement('div');
    designContainer.className = 'design-selector-container mb-4';
    uiElements.themeSwitcher.appendChild(designContainer);

    Object.keys(DESIGNS).forEach(designName => {
        const button = document.createElement('button');
        button.textContent = designName;
        button.className = 'button-90s design-button theme-button';
        button.dataset.design = DESIGNS[designName];
        button.addEventListener('click', () => {
            currentDesign = DESIGNS[designName];
            currentPalette = DESIGN_DEFAULT_PALETTES[currentDesign] || PALETTES[DESIGN_SPECIFIC_PALETTES[currentDesign][0]];
            populatePaletteSelector();
            applyAppearance();
            if (onDesignChangeCallback) onDesignChangeCallback(currentDesign);
        });
        designContainer.appendChild(button);
    });

    const paletteHeader = document.createElement('h4');
    paletteHeader.textContent = 'Color Palette:';
    paletteHeader.className = 'jp-subtitle !uppercase !text-sm !text-left !mb-1 mt-3';
    uiElements.themeSwitcher.appendChild(paletteHeader);

    const paletteContainer = document.createElement('div');
    paletteContainer.id = 'paletteSelectorContainer';
    paletteContainer.className = 'palette-selector-container';
    uiElements.themeSwitcher.appendChild(paletteContainer);

    loadInitialAppearance();
}

function populatePaletteSelector() {
    const paletteContainer = document.getElementById('paletteSelectorContainer');
    if (!paletteContainer) return;
    paletteContainer.innerHTML = '';

    const palettesForDesignKeys = DESIGN_SPECIFIC_PALETTES[currentDesign];
    if (!palettesForDesignKeys) {
        console.warn(`No specific palettes found for design: ${currentDesign}`);
        return;
    }

    palettesForDesignKeys.forEach(paletteNameKey => {
        const paletteValue = PALETTES[paletteNameKey];
        if (paletteValue) {
            createPaletteButton(paletteContainer, paletteNameKey, paletteValue);
        }
    });
    updateActivePaletteButton();
}

function createPaletteButton(container, nameKey, value) {
    const button = document.createElement('button');
    button.textContent = nameKey;
    button.className = 'button-90s palette-button theme-button';
    button.dataset.palette = value;
    button.addEventListener('click', () => {
        currentPalette = value;
        applyAppearance();
    });
    container.appendChild(button);
}

function updateActivePaletteButton() {
    document.querySelectorAll('.palette-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.palette === currentPalette);
    });
}

export function applyAppearance() {
    document.body.className = `${currentDesign} ${currentPalette}`;
    localStorage.setItem('systemlog-design', currentDesign);
    localStorage.setItem('systemlog-palette', currentPalette);

    document.querySelectorAll('.design-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.design === currentDesign);
    });
    updateActivePaletteButton();

    if (uiElements.statusScrollerContainer) {
        uiElements.statusScrollerContainer.style.display = (currentDesign === DESIGNS['Mecha Manual']) ? 'none' : 'block';
    }
}

export function getCurrentDesign() {
    return currentDesign;
}

export function loadInitialAppearance() {
    currentDesign = localStorage.getItem('systemlog-design') || DESIGNS['Mecha Manual'];

    const palettesForDesignKeys = DESIGN_SPECIFIC_PALETTES[currentDesign] || Object.keys(PALETTES);
    const defaultPaletteForDesign = DESIGN_DEFAULT_PALETTES[currentDesign] || (palettesForDesignKeys.length > 0 ? PALETTES[palettesForDesignKeys[0]] : Object.values(PALETTES)[0]);

    let loadedPalette = localStorage.getItem('systemlog-palette');

    const validPalettesForCurrentDesign = (DESIGN_SPECIFIC_PALETTES[currentDesign] || []).map(nameKey => PALETTES[nameKey]);
    if (!loadedPalette || !validPalettesForCurrentDesign.includes(loadedPalette)) {
        loadedPalette = defaultPaletteForDesign;
    }
    currentPalette = loadedPalette;

    populatePaletteSelector();
    applyAppearance();
}

export function initializeUIElements() {
    Object.assign(_uiElements, {
        loginContainer: document.getElementById('loginContainer'),
        appContainer: document.getElementById('appContainer'),
        signInBtn: document.getElementById('signInBtn'),
        guestSignInBtn: document.getElementById('guestSignInBtn'),
        signOutBtn: document.getElementById('signOutBtn'),
        userIdDisplay: document.getElementById('userIdDisplay'),
        tasksView: document.getElementById('tasksView'),
        journalView: document.getElementById('journalView'),
        systemView: document.getElementById('systemView'),
        workoutView: document.getElementById('workoutView'),
        bookReviewView: document.getElementById('bookReviewView'),
        tasksTabBtn: document.getElementById('tasksTabBtn'),
        journalTabBtn: document.getElementById('journalTabBtn'),
        systemTabBtn: document.getElementById('systemTabBtn'),
        workoutTabBtn: document.getElementById('workoutTabBtn'),
        bookReviewTabBtn: document.getElementById('bookReviewTabBtn'),
        taskInput: document.getElementById('taskInput'),
        addTaskBtn: document.getElementById('addTaskBtn'),
        taskList: document.getElementById('taskList'),
        journalInput: document.getElementById('journalInput'),
        addJournalBtn: document.getElementById('addJournalBtn'),
        vitaminTrackerBtn: document.getElementById('vitaminTrackerBtn'),
        journalList: document.getElementById('journalList'),
        journalLoadMoreContainer: document.getElementById('journalLoadMoreContainer'),
        launchKaleidoscopeBtn: document.getElementById('launchKaleidoscopeBtn'),
        journalSearch: document.getElementById('journalSearch'),
        journalHeatmapContainer: document.getElementById('journalHeatmapContainer'),
        kaleidoscopeModal: document.getElementById('kaleidoscopeModal'),
        kSymmetrySlider: document.getElementById('kSymmetrySlider'),
        kClearBtn: document.getElementById('kClearBtn'),
        closeKaleidoscopeBtn: document.getElementById('closeKaleidoscopeBtn'),
        tasksViewTitle: document.getElementById('tasksViewTitle'),
        journalViewTitle: document.getElementById('journalViewTitle'),
        systemViewTitle: document.getElementById('systemViewTitle'),
        workoutViewTitle: document.getElementById('workoutViewTitle'),
        bookReviewViewTitle: document.getElementById('bookReviewViewTitle'),
        feedbackBox: document.getElementById('feedbackBox'),
        themeSwitcher: document.getElementById('themeSwitcher'),
        journalStreakDisplay: document.getElementById('journalStreakDisplay'),
        categorySelect: document.getElementById('categorySelect'),
        manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
        categoryManagerModal: document.getElementById('categoryManagerModal'),
        categoryList: document.getElementById('categoryList'),
        newCategoryInput: document.getElementById('newCategoryInput'),
        addCategoryBtn: document.getElementById('addCategoryBtn'),
        closeCategoryManagerBtn: document.getElementById('closeCategoryManagerBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
        apiKeySection: document.getElementById('apiKeySection'),
        aiChatModal: document.getElementById('aiChatModal'),
        aiChatHistory: document.getElementById('aiChatHistory'),
        aiChatInput: document.getElementById('aiChatInput'),
        aiChatSendBtn: document.getElementById('aiChatSendBtn'),
        closeAiChatBtn: document.getElementById('closeAiChatBtn'),
        aiPersonalitySelect: document.getElementById('aiPersonalitySelect'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingMessageText: document.getElementById('loadingMessageText'),
        statusScrollerContainer: document.querySelector('.status-scroller-container'),
        workoutSelectorContainer: document.getElementById('workoutSelectorContainer'),
        workoutDisplayContainer: document.getElementById('workoutDisplayContainer'),
        workoutHistoryList: document.getElementById('workoutHistoryList'),
        workoutNotesInput: document.getElementById('workoutNotesInput'),

        // Book Review Specific Elements
        addBookBtn: document.getElementById('addBookBtn'),
        bookList: document.getElementById('bookList'),
        bookListLoadMoreContainer: document.getElementById('bookListLoadMoreContainer'),
        addBookModal: document.getElementById('addBookModal'),
        bookTitleInput: document.getElementById('bookTitleInput'),
        bookAuthorInput: document.getElementById('bookAuthorInput'),
        bookCoverUrlInput: document.getElementById('bookCoverUrlInput'),
        saveNewBookBtn: document.getElementById('saveNewBookBtn'),
        cancelAddBookBtn: document.getElementById('cancelAddBookBtn'),
        bookNotesModal: document.getElementById('bookNotesModal'),
        bookNotesModalTitle: document.getElementById('bookNotesModalTitle'),
        bookNotesModalSubtitle: document.getElementById('bookNotesModalSubtitle'),
        bookNotesInput: document.getElementById('bookNotesInput'),
        saveBookNotesBtn: document.getElementById('saveBookNotesBtn'), // Corrected ID
        closeBookNotesModalBtn: document.getElementById('closeBookNotesModalBtn'),
        deleteBookBtn: document.getElementById('deleteBookBtn'),
    });
    console.log("UI elements initialized.");
}