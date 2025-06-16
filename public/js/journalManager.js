// public/js/journalManager.js
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove, limit, startAfter, getDocs, setDoc, getDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, generateLogId, escapeHTML } from './utils.js';
import { isGuestMode, getGuestJournalEntries, addGuestJournalLog as addGuestLog, deleteGuestJournalLog as deleteGuestLog, deleteGuestJournalDay as deleteGuestDay, getUserId as getAuthUserId } from './guestManager.js';
import { openAiChat } from './aiService.js';

const JOURNAL_PAGE_SIZE = 15;

let journalCollectionRef = null;
let vitaminCollectionRef = null; 
let unsubscribeJournal = null;
let lastVisibleJournalDoc = null;
let _hasJournalLoaded = false;
let currentSelectedMood = null;
let cachedVitaminDates = new Set(); // Cache vitamin dates to prevent re-fetching

export function initializeJournalReferences() {
    const userId = getAuthUserId();
    if (userId && !isGuestMode()) {
        journalCollectionRef = collection(db, `users/${userId}/journalEntries`);
        vitaminCollectionRef = collection(db, `users/${userId}/vitaminTracker`); 
    } else {
        journalCollectionRef = null;
        vitaminCollectionRef = null;
    }
    setupMoodSelectorListeners();
    if (uiElements.vitaminStatusTracker) {
        uiElements.vitaminStatusTracker.addEventListener('click', toggleVitaminStatus);
    }
}

function setupMoodSelectorListeners() {
    const moodButtons = document.querySelectorAll('#moodSelector .mood-button');
    moodButtons.forEach(button => {
        button.addEventListener('click', () => {
            moodButtons.forEach(btn => btn.classList.remove('active'));
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

export async function addJournalLog() {
    if (!uiElements.journalInput) return;
    const logContent = uiElements.journalInput.value.trim();
    if (logContent === "") {
        showFeedback("Log content cannot be empty.", true);
        return;
    }

    const currentUserId = getAuthUserId();
    const moodToSave = currentSelectedMood;

    if (isGuestMode()) {
        addGuestLog(logContent, moodToSave);
        loadJournal(true);
        uiElements.journalInput.value = "";
        resetMoodSelector();
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
            mood: moodToSave
        };
        try {
            const docSnap = await getDoc(journalDocRef);
            if (docSnap.exists()) {
                await updateDoc(journalDocRef, { logs: arrayUnion(newLog), lastUpdated: serverTimestamp() });
            } else {
                await setDoc(journalDocRef, { logs: [newLog], displayDate: formatDisplayDate(todayId), lastUpdated: serverTimestamp() });
            }
            uiElements.journalInput.value = "";
            resetMoodSelector();
            showFeedback("Log committed.");
        } catch (error) {
            console.error("Error adding journal log:", error);
            showFeedback("Error: Could not save log.", true);
        }
    }
}

export async function loadJournal(isGuest) {
    if (unsubscribeJournal) unsubscribeJournal();
    if (!uiElements.journalList) return;

    uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">Accessing archives...</p>`;
    
    await checkVitaminStatusForToday();

    if (isGuest) {
        const guestEntries = getGuestJournalEntries();
        uiElements.journalList.innerHTML = guestEntries.length === 0 ? `<p class="text-center p-2 opacity-70">No logs found.</p>` : "";
        guestEntries.forEach(entry => renderJournalDayEntryDOM(entry, true, new Set()));
        if (uiElements.journalHeatmapContainer) uiElements.journalHeatmapContainer.innerHTML = `<p class="text-center p-2 opacity-70">Log Consistency Matrix not available in Guest Mode.</p>`;
        if (uiElements.journalStreakDisplay) uiElements.journalStreakDisplay.textContent = `-- DAYS (Guest)`;
    } else {
        if (!journalCollectionRef) {
            uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">Journal service not available.</p>`;
            return;
        }

        const vitaminDocs = await getVitaminData();
        cachedVitaminDates = new Set(vitaminDocs.map(doc => doc.id));
        
        const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"));
        unsubscribeJournal = onSnapshot(q, (snapshot) => {
            uiElements.journalList.innerHTML = "";
             if (snapshot.empty) {
                uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70">No logs found.</p>`;
                return;
            }
            snapshot.docs.forEach(doc => renderJournalDayEntryDOM({ id: doc.id, ...doc.data() }, false, cachedVitaminDates));

        }, (error) => {
            console.error("Journal loading error:", error);
            showFeedback("Error: Failed to load journal entries.", true);
            if (uiElements.journalList) uiElements.journalList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500">Error loading journal.</p>`;
        });
    }
    _hasJournalLoaded = true;
}


// --- Vitamin Tracker Logic ---

async function getVitaminData() {
    if (isGuestMode() || !vitaminCollectionRef) return [];
    try {
        const snapshot = await getDocs(vitaminCollectionRef);
        return snapshot.docs;
    } catch (error) {
        console.error("Error fetching vitamin data:", error);
        return [];
    }
}

async function checkVitaminStatusForToday() {
    if (isGuestMode() || !vitaminCollectionRef) {
        updateVitaminStatusUI(false, true);
        return;
    }
    const todayId = getTodayDocId();
    const vitaminDocRef = doc(vitaminCollectionRef, todayId);
    try {
        const docSnap = await getDoc(vitaminDocRef);
        updateVitaminStatusUI(docSnap.exists());
    } catch (error) {
        console.error("Error checking vitamin status:", error);
        updateVitaminStatusUI(false);
    }
}

async function toggleVitaminStatus() {
    if (isGuestMode()) {
        showFeedback("Vitamin tracker is not available in guest mode.", true);
        return;
    }
    const todayId = getTodayDocId();
    const vitaminDocRef = doc(vitaminCollectionRef, todayId);

    try {
        const docSnap = await getDoc(vitaminDocRef);
        if (docSnap.exists()) {
            await deleteDoc(vitaminDocRef);
            updateVitaminStatusUI(false);
            updateJournalEntryIcon(todayId, false);
            cachedVitaminDates.delete(todayId);
            showFeedback("Vitamin status for today has been reset.");
        } else {
            await setDoc(vitaminDocRef, { takenAt: serverTimestamp() });
            updateVitaminStatusUI(true);
            updateJournalEntryIcon(todayId, true);
            cachedVitaminDates.add(todayId);
            showFeedback("Vitamins for today marked as taken!");
        }
    } catch (error) {
        console.error("Error toggling vitamin status:", error);
        showFeedback("Could not update vitamin status.", true);
    }
}

function updateVitaminStatusUI(hasTaken, isGuest = false) {
    if (!uiElements.vitaminStatusTracker || !uiElements.vitaminText) return;
    if (isGuest) {
        uiElements.vitaminStatusTracker.classList.add('not-taken');
        uiElements.vitaminStatusTracker.classList.remove('taken');
        uiElements.vitaminText.textContent = "Tracker disabled in guest mode";
        return;
    }
    if (hasTaken) {
        uiElements.vitaminStatusTracker.classList.add('taken');
        uiElements.vitaminStatusTracker.classList.remove('not-taken');
        uiElements.vitaminText.textContent = "Vitamins taken for today!";
    } else {
        uiElements.vitaminStatusTracker.classList.add('not-taken');
        uiElements.vitaminStatusTracker.classList.remove('taken');
        uiElements.vitaminText.textContent = "Vitamins not taken";
    }
}

function updateJournalEntryIcon(entryDateId, hasTaken) {
    const entryElement = document.querySelector(`.journal-day-entry[data-id="${entryDateId}"]`);
    if (!entryElement) return;

    const headerText = entryElement.querySelector('.journal-day-header p');
    let icon = headerText.querySelector('.journal-vitamin-icon');

    if (hasTaken && !icon) {
        icon = document.createElement('span');
        icon.className = 'journal-vitamin-icon';
        icon.textContent = '💊';
        headerText.appendChild(icon);
    } else if (!hasTaken && icon) {
        icon.remove();
    }
}


// --- Journal Rendering & Management ---

function renderJournalDayEntryDOM(dayEntry, isGuest, vitaminDates) {
    if (!uiElements.journalList) return;
    const item = document.createElement('div');
    item.className = 'journal-day-entry border-b border-dashed border-border-color pb-4 mb-4';
    item.dataset.id = dayEntry.id;

    const vitaminIcon = vitaminDates.has(dayEntry.id) ? '<span class="journal-vitamin-icon">💊</span>' : '';

    item.innerHTML = `
        <div class="journal-day-header">
            <p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${escapeHTML(dayEntry.displayDate)}${vitaminIcon}</p>
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
        item.classList.toggle('expanded');
        item.querySelector('.toggle-indicator').textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
    });
    if (!isGuest) {
        const chatButton = item.querySelector('.chat');
        if(chatButton) {
            chatButton.addEventListener('click', (e) => {
                e.stopPropagation();
                openAiChat(dayEntry);
            });
        }
    }
    item.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
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

export function clearJournalData() {
    if (unsubscribeJournal) {
        unsubscribeJournal();
        unsubscribeJournal = null;
    }
    if (uiElements.journalList) uiElements.journalList.innerHTML = '';
    if (uiElements.journalLoadMoreContainer) uiElements.journalLoadMoreContainer.innerHTML = '';
    lastVisibleJournalDoc = null;
    _hasJournalLoaded = false;
    resetMoodSelector();
    updateVitaminStatusUI(false); 
    cachedVitaminDates.clear();
    console.log("Journal data cleared.");
}

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