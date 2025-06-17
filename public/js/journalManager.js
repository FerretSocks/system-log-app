// public/js/journalManager.js
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove, limit, startAfter, getDocs, setDoc, getDoc, deleteField } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, generateLogId, escapeHTML } from './utils.js';
import { isGuestMode, getGuestJournalEntries, addGuestJournalLog as addGuestLog, deleteGuestJournalLog as deleteGuestLog, deleteGuestJournalDay as deleteGuestDay, getUserId as getAuthUserId } from './guestManager.js';
import { openAiChat } from './aiService.js';

const JOURNAL_PAGE_SIZE = 15;

let journalCollectionRef = null;
let unsubscribeJournal = null;
let lastVisibleJournalDoc = null;
let _hasJournalLoaded = false;
let currentSelectedMood = null;

export function initializeJournalReferences() {
    const userId = getAuthUserId();
    if (userId && !isGuestMode()) {
        journalCollectionRef = collection(db, `users/${userId}/journalEntries`);
    } else {
        journalCollectionRef = null;
    }
    setupMoodSelectorListeners();
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

export async function logVitaminsTaken() {
    if (isGuestMode()) {
        showFeedback("This feature is not available in guest mode.", true);
        return;
    }
    const currentUserId = getAuthUserId();
    if (!currentUserId || !journalCollectionRef) {
        showFeedback("Error: User not identified.", true);
        return;
    }
    const todayId = getTodayDocId();
    const journalDocRef = doc(journalCollectionRef, todayId);

    try {
        const docSnap = await getDoc(journalDocRef);
        const currentlyTaken = docSnap.exists() && docSnap.data().vitaminsTaken === true;
        
        // This makes it a toggle. If it's true, we remove the field. If false/non-existent, we set it to true.
        const updateData = {
            vitaminsTaken: currentlyTaken ? deleteField() : true,
            lastUpdated: serverTimestamp(),
            displayDate: formatDisplayDate(todayId) // Ensure displayDate is present if setting for the first time
        };
        
        await setDoc(journalDocRef, updateData, { merge: true });

        showFeedback(currentlyTaken ? "Vitamin log removed for today." : "Vitamins logged for today!", false);
    } catch (error) {
        console.error("Error logging vitamins:", error);
        showFeedback("Error: Could not save vitamin log.", true);
    }
}

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
            // ALWAYS clear the list before rendering new snapshot data to prevent duplicates
            uiElements.journalList.innerHTML = '';
            
            // Check today's vitamin status to update the button
            const todayId = getTodayDocId();
            const todayDoc = snapshot.docs.find(d => d.id === todayId);
            const vitaminsTakenToday = todayDoc?.data()?.vitaminsTaken === true;
            updateVitaminButtonState(vitaminsTakenToday);

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
    
    const vitaminIndicator = dayEntry.vitaminsTaken ? '💊' : '';

    item.innerHTML = `
        <div class="journal-day-header">
            <span class="vitamin-indicator">${vitaminIndicator}</span>
            <p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${escapeHTML(dayEntry.displayDate)}</p>
            <div class="journal-day-controls">
                <span class="journal-control-btn chat ${isGuest ? 'hidden' : ''}">[chat]</span>
                <span class="journal-control-btn delete">[delete]</span>
            </div>
        </div>
        <div class="journal-day-content hidden"></div>`;

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
        // If there are no logs but vitamins were taken, we can show a placeholder or nothing
        if (!dayEntry.vitaminsTaken) {
             contentDiv.innerHTML = `<p class="opacity-70 italic p-2">No logs for this day.</p>`;
        }
    }

    const header = item.querySelector('.journal-day-header');
    header.addEventListener('click', (e) => {
        if (e.target.closest('.journal-control-btn')) return;
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

// --- NEW FUNCTION to update the button's appearance ---
function updateVitaminButtonState(isTaken) {
    if(uiElements.vitaminTrackerBtn) {
        if (isTaken) {
            uiElements.vitaminTrackerBtn.classList.add('active'); // Assumes an 'active' style exists
            uiElements.vitaminTrackerBtn.textContent = "Vitamins Logged";
        } else {
            uiElements.vitaminTrackerBtn.classList.remove('active');
            uiElements.vitaminTrackerBtn.textContent = "Vitamins Taken";
        }
    }
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
    }
    catch (error) {
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