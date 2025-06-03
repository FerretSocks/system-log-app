// public/js/journalManager.js
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove, limit, startAfter, getDocs, setDoc, getDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, generateLogId, escapeHTML } from './utils.js'; // Removed toYMDString as it's not directly used here, but available via utils.js
// import { playSound } from './soundManager.js'; // playSound import removed
import { isGuestMode, getGuestJournalEntries, addGuestJournalLog as addGuestLog, deleteGuestJournalLog as deleteGuestLog, deleteGuestJournalDay as deleteGuestDay, getUserId as getAuthUserId } from './guestManager.js';
import { openAiChat } from './aiService.js';

const JOURNAL_PAGE_SIZE = 15;
// const HEATMAP_DAYS = 90; // HEATMAP_DAYS is used in systemManager.js

let journalCollectionRef = null;
let unsubscribeJournal = null;
let lastVisibleJournalDoc = null;
let _hasJournalLoaded = false;
let currentSelectedMood = null; // Variable to store the currently selected mood

/**
 * Initializes Firestore references for a logged-in (non-guest) user.
 * Also sets up event listeners for mood selector buttons.
 */
export function initializeJournalReferences() {
    const userId = getAuthUserId();
    if (userId && !isGuestMode()) {
        journalCollectionRef = collection(db, `users/${userId}/journalEntries`);
    } else {
        journalCollectionRef = null;
    }
    // Setup mood selector listeners once the journal UI is potentially active
    // This is called when auth state changes, so DOM should be ready.
    setupMoodSelectorListeners();
}

function setupMoodSelectorListeners() {
    const moodButtons = document.querySelectorAll('#moodSelector .mood-button');
    moodButtons.forEach(button => {
        button.addEventListener('click', () => {
            // playSound('clickSound'); // Removed
            // Remove 'active' class from all mood buttons
            moodButtons.forEach(btn => btn.classList.remove('active'));
            // Add 'active' class to the clicked button
            button.classList.add('active');
            currentSelectedMood = button.dataset.mood;
        });
    });
}

function resetMoodSelector() {
    const moodButtons = document.querySelectorAll('#moodSelector .mood-button');
    moodButtons.forEach(btn => btn.classList.remove('active'));
    currentSelectedMood = null;
}

export function setHasJournalLoaded(status) {
    _hasJournalLoaded = status;
}
export function getHasJournalLoaded() {
    return _hasJournalLoaded;
}

/**
 * Adds a new log to the current day's journal entry.
 */
export async function addJournalLog() {
    if (!uiElements.journalInput) return;
    const logContent = uiElements.journalInput.value.trim();
    if (logContent === "") {
        showFeedback("Log content cannot be empty.", true);
        return;
    }

    const currentUserId = getAuthUserId();
    const moodToSave = currentSelectedMood; // Get the selected mood

    if (isGuestMode()) {
        addGuestLog(logContent, moodToSave); // Pass mood to guest function
        loadJournal(true);
        uiElements.journalInput.value = "";
        resetMoodSelector(); // Reset mood after adding
        showFeedback("Log committed to local storage.");
    } else {
        if (!currentUserId || !journalCollectionRef) {
            showFeedback("Error: User not identified or journal service not ready.", true);
            return;
        }
        const todayId = getTodayDocId();
        const journalDocRef = doc(journalCollectionRef, todayId);
        const newLog = {
            id: generateLogId(),
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            content: logContent,
            mood: moodToSave // Save the mood
        };
        try {
            const docSnap = await getDoc(journalDocRef);
            if (docSnap.exists()) {
                await updateDoc(journalDocRef, { logs: arrayUnion(newLog), lastUpdated: serverTimestamp() });
            } else {
                await setDoc(journalDocRef, { logs: [newLog], displayDate: formatDisplayDate(todayId), lastUpdated: serverTimestamp() });
            }
            uiElements.journalInput.value = "";
            resetMoodSelector(); // Reset mood after adding
            showFeedback("Log committed.");
        } catch (error) {
            console.error("Error adding journal log:", error);
            showFeedback("Error: Could not save log.", true);
        }
    }
}

/**
 * Loads journal entries.
 * @param {boolean} isGuest - True if loading for a guest.
 */
export function loadJournal(isGuest) {
    if (unsubscribeJournal) unsubscribeJournal();
    lastVisibleJournalDoc = null;
    if (!uiElements.journalList || !uiElements.journalLoadMoreContainer) return;

    uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">Accessing archives...</p>`;
    uiElements.journalLoadMoreContainer.innerHTML = '';

    if (isGuest) {
        const guestEntries = getGuestJournalEntries();
        uiElements.journalList.innerHTML = guestEntries.length === 0 ? `<p class="text-center p-2 opacity-70">No logs found.</p>` : "";
        guestEntries.forEach(entry => renderJournalDayEntryDOM(entry, true));
        if (uiElements.journalHeatmapContainer) uiElements.journalHeatmapContainer.innerHTML = `<p class="text-center p-2 opacity-70">Log Consistency Matrix not available in Guest Mode.</p>`;
        if (uiElements.journalStreakDisplay) uiElements.journalStreakDisplay.textContent = `-- DAYS (Guest)`;
    } else {
        if (!journalCollectionRef) {
            uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">Journal service not available.</p>`;
            return;
        }
        const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"), limit(JOURNAL_PAGE_SIZE));
        unsubscribeJournal = onSnapshot(q, (snapshot) => {
            if (lastVisibleJournalDoc === null) uiElements.journalList.innerHTML = '';
            if (snapshot.empty && lastVisibleJournalDoc === null) {
                uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">No logs found.</p>`;
                return;
            }
            snapshot.docs.forEach(doc => renderJournalDayEntryDOM({ id: doc.id, ...doc.data() }, false));

            if (snapshot.docs.length >= JOURNAL_PAGE_SIZE) {
                lastVisibleJournalDoc = snapshot.docs[snapshot.docs.length - 1];
                renderLoadMoreButton();
            } else {
                lastVisibleJournalDoc = null;
                uiElements.journalLoadMoreContainer.innerHTML = '';
            }
        }, (error) => {
            console.error("Journal loading error:", error);
            showFeedback("Error: Failed to load journal entries.", true);
            if (uiElements.journalList) uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500">Error loading journal.</p>`;
        });
    }
    _hasJournalLoaded = true;
}

function renderLoadMoreButton() {
    if (!uiElements.journalLoadMoreContainer) return;
    uiElements.journalLoadMoreContainer.innerHTML = `<button id="journalLoadMoreBtn" class="button-90s">Load More Archives</button>`;
    const loadMoreBtn = document.getElementById('journalLoadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreJournalEntries);
    }
}

async function loadMoreJournalEntries() {
    if (!lastVisibleJournalDoc || isGuestMode() || !journalCollectionRef) return;

    const loadMoreBtn = document.getElementById('journalLoadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.textContent = 'Loading...';
        loadMoreBtn.disabled = true;
    }

    try {
        const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"), startAfter(lastVisibleJournalDoc), limit(JOURNAL_PAGE_SIZE));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => renderJournalDayEntryDOM({ id: doc.id, ...doc.data() }, false));

        if (snapshot.docs.length < JOURNAL_PAGE_SIZE) {
            lastVisibleJournalDoc = null;
            if (uiElements.journalLoadMoreContainer) uiElements.journalLoadMoreContainer.innerHTML = '';
        } else {
            lastVisibleJournalDoc = snapshot.docs[snapshot.docs.length - 1];
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Load More Archives';
                loadMoreBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error("Error loading more journal entries:", error);
        showFeedback("Failed to load more entries.", true);
        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Load More Archives';
            loadMoreBtn.disabled = false;
        }
    }
}

function renderJournalDayEntryDOM(dayEntry, isGuest) {
    if (!uiElements.journalList) return;
    const item = document.createElement('div');
    item.className = 'journal-day-entry border-b border-dashed border-border-color pb-4 mb-4';
    item.innerHTML = `
        <div class="journal-day-header">
            <p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${escapeHTML(dayEntry.displayDate)}</p>
            <div class="journal-day-controls">
                <span class="journal-control-btn chat ${isGuest ? 'hidden' : ''}">[chat]</span>
                <span class="journal-control-btn delete">[delete]</span>
            </div>
        </div>
        <div class="journal-day-content"></div>`;

    const contentDiv = item.querySelector('.journal-day-content');
    const logsToProcess = dayEntry.logs || [];
    if (logsToProcess.length > 0) {
        logsToProcess.slice().reverse().forEach((log, index) => {
            const logEl = document.createElement('div');
            logEl.className = 'flex justify-between items-start py-1';
            
            // Display mood icon if available
            const moodIcon = log.mood ? `<span class="log-mood-icon">${escapeHTML(log.mood)}</span>` : '';
            
            logEl.innerHTML = `<div>${moodIcon}<span class="opacity-70">[${escapeHTML(log.time)}]</span> ${escapeHTML(log.content)}</div><button class="delete-log-btn text-sm opacity-70 hover:opacity-100">[del]</button>`;
            
            logEl.querySelector('.delete-log-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (isGuest) {
                    deleteGuestLog(dayEntry.id, log.id);
                    loadJournal(true);
                } else {
                    deleteIndividualLog(dayEntry.id, log);
                }
            });
            contentDiv.appendChild(logEl);

            // Add a divider after each log entry, except the last one
            if (index < logsToProcess.length - 1) {
                const divider = document.createElement('hr');
                divider.className = 'log-divider';
                contentDiv.appendChild(divider);
            }
        });
    } else {
        contentDiv.innerHTML = `<p class="opacity-70 italic p-2">No logs for this day.</p>`;
    }

    const header = item.querySelector('.journal-day-header');
    header.addEventListener('click', (e) => {
        if (e.target.classList.contains('journal-control-btn')) return;
        // playSound('clickSound'); // Removed
        item.classList.toggle('expanded');
        item.querySelector('.toggle-indicator').textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
    });

    if (!isGuest) {
        const chatButton = item.querySelector('.chat');
        if(chatButton) { // Ensure button exists before adding listener
            chatButton.addEventListener('click', (e) => {
                e.stopPropagation();
                // playSound('clickSound'); // Removed
                openAiChat(dayEntry);
            });
        }
    }
    item.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        // playSound('clickSound'); // Removed
        if (isGuest) {
            if (confirm(`Delete all logs for ${escapeHTML(dayEntry.displayDate)}?`)) {
                deleteGuestDay(dayEntry.id);
                loadJournal(true);
            }
        } else {
            deleteJournalDay(dayEntry.id, dayEntry.displayDate);
        }
    });
    uiElements.journalList.appendChild(item);
}

async function deleteIndividualLog(dayDocId, logToRemove) {
    if (!confirm(`Delete log entry?`)) return;
    try {
        await updateDoc(doc(journalCollectionRef, dayDocId), { logs: arrayRemove(logToRemove) });
        showFeedback("Log entry deleted.");
    } catch (error) {
        console.error("Error deleting individual log:", error);
        showFeedback("Error deleting log entry.", true);
    }
}

async function deleteJournalDay(dayDocId, dayDate) {
    if (!confirm(`Delete all logs for ${escapeHTML(dayDate)}?`)) return;
    try {
        await deleteDoc(doc(journalCollectionRef, dayDocId));
        showFeedback(`All logs for ${escapeHTML(dayDate)} deleted.`);
    } catch (error) {
        console.error("Error deleting journal day:", error);
        showFeedback("Error deleting day's logs.", true);
    }
}

export function handleJournalSearch() {
    if (!uiElements.journalSearch || !uiElements.journalList) return;
    const searchTerm = uiElements.journalSearch.value.toLowerCase();
    const entries = uiElements.journalList.querySelectorAll('.journal-day-entry');
    entries.forEach(entry => {
        entry.style.display = entry.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
    });
}

/**
 * Clears journal-related data and unsubscribes from listeners.
 * Called on logout or when user context changes.
 */
export function clearJournalData() {
    if (unsubscribeJournal) {
        unsubscribeJournal();
        unsubscribeJournal = null;
    }
    if (uiElements.journalList) uiElements.journalList.innerHTML = '';
    if (uiElements.journalLoadMoreContainer) uiElements.journalLoadMoreContainer.innerHTML = '';
    lastVisibleJournalDoc = null;
    _hasJournalLoaded = false;
    resetMoodSelector(); // Also reset mood selector on clear
    console.log("Journal data cleared.");
}

// --- Functions related to streak and heatmap (called by systemManager) ---
export async function getAllJournalMetadataForUser() {
    if (isGuestMode() || !journalCollectionRef) return [];
    try {
        const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs;
    } catch (error) {
        console.error("Error fetching all journal metadata:", error);
        showFeedback("Could not fetch all journal data for system stats.", true);
        return [];
    }
}