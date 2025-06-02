// public/js/uiManager.js
import { DESIGNS, PALETTES, DESIGN_SPECIFIC_PALETTES, DESIGN_DEFAULT_PALETTES, TYPEWRITER_SPEED, SCRAMBLE_CYCLES, CHAR_POOL } from './uiConstants.js';
// import { playSound } from './soundManager.js'; // playSound import removed

export const uiElements = {
    loginContainer: document.getElementById('loginContainer'),
    appContainer: document.getElementById('appContainer'),
    signInBtn: document.getElementById('signInBtn'),
    guestSignInBtn: document.getElementById('guestSignInBtn'),
    signOutBtn: document.getElementById('signOutBtn'),
    userIdDisplay: document.getElementById('userIdDisplay'),
    tasksView: document.getElementById('tasksView'),
    journalView: document.getElementById('journalView'),
    systemView: document.getElementById('systemView'),
    tasksTabBtn: document.getElementById('tasksTabBtn'),
    journalTabBtn: document.getElementById('journalTabBtn'),
    systemTabBtn: document.getElementById('systemTabBtn'),
    taskInput: document.getElementById('taskInput'),
    addTaskBtn: document.getElementById('addTaskBtn'),
    taskList: document.getElementById('taskList'),
    journalInput: document.getElementById('journalInput'),
    addJournalBtn: document.getElementById('addJournalBtn'),
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
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingMessageText: document.getElementById('loadingMessageText'), // Updated ID
    statusScrollerContainer: document.querySelector('.status-scroller-container')
};

let feedbackTimeout;
export function showFeedback(message, isError = false) {
    if (!uiElements.feedbackBox) return;
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
        activeScrambleTimers.forEach(timer => clearInterval(timer));
        activeScrambleTimers = [];
        element.textContent = ''; // Clear previous text
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
                        element.textContent = revealedText; // Update with revealed text + current char
                        i++;
                        if (i >= text.length) { resolve(); } // Resolve promise when done
                        else { typeCharacter(); } // Process next character
                    } else {
                        const randomChar = CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length));
                        element.textContent = revealedText + randomChar; // Show revealed text + scrambling char
                        scrambleCount++;
                    }
                }, TYPEWRITER_SPEED / 2); // Adjust speed as needed
                activeScrambleTimers.push(scrambleInterval);
            } else {
                resolve(); // Resolve if text is empty or already processed
            }
        };
        if (text && text.length > 0) { typeCharacter(); } else { resolve(); }
    });
}

/**
 * Shows the loading overlay with a specific message.
 * @param {string} message - The message to display.
 */
export async function showLoadingOverlay(message = "LOADING...") {
    if (uiElements.loadingOverlay && uiElements.loadingMessageText) {
        uiElements.loadingOverlay.classList.remove('hidden');
        // Use typewriter effect for the loading message
        await typewriterScrambleEffect(uiElements.loadingMessageText, message);
    } else {
        console.warn("Loading overlay elements not found.");
    }
}

/**
 * Hides the loading overlay.
 */
export function hideLoadingOverlay() {
    if (uiElements.loadingOverlay && uiElements.loadingMessageText) {
        uiElements.loadingOverlay.classList.add('hidden');
        uiElements.loadingMessageText.textContent = ''; // Clear the message
    }
}


export function switchToView(viewName, currentDesignValue, isInitialLoad = false) {
    const views = { tasks: uiElements.tasksView, journal: uiElements.journalView, system: uiElements.systemView };
    const tabs = { tasks: uiElements.tasksTabBtn, journal: uiElements.journalTabBtn, system: uiElements.systemTabBtn };

    Object.values(views).forEach(v => v?.classList.add('hidden'));
    Object.values(tabs).forEach(t => t?.classList.remove('active'));

    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
        tabs[viewName].classList.add('active');
        localStorage.setItem('systemlog-activeTab', viewName);
        const titles = { tasks: "Task Log", journal: "Daily Entry", system: "System Panel" };
        const titleElement = uiElements[`${viewName}ViewTitle`];

        if (titleElement) {
            titleElement.classList.remove('fade-in-title');
            void titleElement.offsetWidth; // Trigger reflow

            if (isInitialLoad || currentDesignValue === DESIGNS['Goblins Ledger']) {
                titleElement.textContent = titles[viewName];
                if (!isInitialLoad && currentDesignValue === DESIGNS['Goblins Ledger']) {
                    titleElement.classList.add('fade-in-title');
                }
            } else {
                typewriterScrambleEffect(titleElement, titles[viewName]);
            }
        }
    } else {
        console.warn(`View "${viewName}" not found.`);
    }
}

let currentDesign = DESIGNS['Wired']; // Default design
let currentPalette = PALETTES['Cyber Default']; // Default palette for Wired

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
            // playSound('clickSound'); // Removed
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
        // playSound('clickSound'); // Removed
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

function applyAppearance() {
    document.body.className = `${currentDesign} ${currentPalette}`;
    localStorage.setItem('systemlog-design', currentDesign);
    localStorage.setItem('systemlog-palette', currentPalette);

    document.querySelectorAll('.design-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.design === currentDesign);
    });
    updateActivePaletteButton();

    if (uiElements.statusScrollerContainer) {
        uiElements.statusScrollerContainer.style.display = (currentDesign === DESIGNS['Goblins Ledger']) ? 'none' : 'block';
    }
}

export function getCurrentDesign() {
    return currentDesign;
}

export function loadInitialAppearance() {
    currentDesign = localStorage.getItem('systemlog-design') || DESIGNS['Wired'];
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