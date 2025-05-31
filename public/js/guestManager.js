// public/js/guestManager.js
import { generateLogId, getTodayDocId, formatDisplayDate } from './utils.js'; // Assuming these are in utils.js

let guestData = {
    tasks: [],
    journalEntries: []
};
let _isGuestMode = false;
let _currentUserId = null; // This will store Firebase UID or a guest identifier

export function setUserId(userId) {
    _currentUserId = userId;
}

export function getUserId() {
    return _currentUserId;
}

export function isGuestMode() {
    return _isGuestMode;
}

export function setGuestMode(status) {
    _isGuestMode = status;
}

export function loadGuestDataFromLocalStorage() {
    if (!_isGuestMode) return;
    try {
        const storedTasks = localStorage.getItem('guestTasks');
        if (storedTasks) guestData.tasks = JSON.parse(storedTasks);
        const storedJournal = localStorage.getItem('guestJournal');
        if (storedJournal) guestData.journalEntries = JSON.parse(storedJournal);
        console.log("Guest data loaded from local storage.");
    } catch (e) {
        console.error("Error loading guest data from local storage:", e);
        guestData = { tasks: [], journalEntries: [] }; // Reset on error
    }
}

export function saveGuestDataToLocalStorage() {
    if (!_isGuestMode) return;
    try {
        localStorage.setItem('guestTasks', JSON.stringify(guestData.tasks));
        localStorage.setItem('guestJournal', JSON.stringify(guestData.journalEntries));
        console.log("Guest data saved to local storage.");
    } catch (e) {
        console.error("Error saving guest data to local storage:", e);
    }
}

export function clearGuestData() {
    guestData = { tasks: [], journalEntries: [] };
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('guestTasks');
        localStorage.removeItem('guestJournal');
    }
    console.log("Guest data cleared.");
}

// --- Guest Task Management ---
export function getGuestTasks() {
    return guestData.tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addGuestTask(taskText) {
    const newTask = {
        id: generateLogId(),
        text: taskText,
        completed: false,
        isPriority: false,
        createdAt: new Date().toISOString()
    };
    guestData.tasks.push(newTask);
    saveGuestDataToLocalStorage();
    return newTask;
}

export function updateGuestTaskCompletion(taskId, completed) {
    const taskIndex = guestData.tasks.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        guestData.tasks[taskIndex].completed = completed;
        saveGuestDataToLocalStorage();
    }
}

export function updateGuestTaskPriority(taskId, isPriority) {
    const taskIndex = guestData.tasks.findIndex(t => t.id === taskId);
    if (taskIndex > -1) {
        guestData.tasks[taskIndex].isPriority = isPriority;
        saveGuestDataToLocalStorage();
    }
}

export function deleteGuestTask(taskId) {
    guestData.tasks = guestData.tasks.filter(t => t.id !== taskId);
    saveGuestDataToLocalStorage();
}


// --- Guest Journal Management ---
export function getGuestJournalEntries() {
    return guestData.journalEntries.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
}

export function addGuestJournalLog(logContent) {
    const todayId = getTodayDocId();
    let dayEntry = guestData.journalEntries.find(entry => entry.id === todayId);
    const newLog = {
        id: generateLogId(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        content: logContent
    };

    if (dayEntry) {
        dayEntry.logs.push(newLog);
        dayEntry.lastUpdated = new Date().toISOString();
    } else {
        dayEntry = {
            id: todayId,
            logs: [newLog],
            displayDate: formatDisplayDate(todayId), // Ensure this function is available
            lastUpdated: new Date().toISOString()
        };
        guestData.journalEntries.unshift(dayEntry);
    }
    saveGuestDataToLocalStorage();
}

export function deleteGuestJournalLog(dayId, logId) {
    const dayIndex = guestData.journalEntries.findIndex(entry => entry.id === dayId);
    if (dayIndex > -1) {
        guestData.journalEntries[dayIndex].logs = guestData.journalEntries[dayIndex].logs.filter(l => l.id !== logId);
        if (guestData.journalEntries[dayIndex].logs.length === 0) {
            guestData.journalEntries.splice(dayIndex, 1); // Remove day entry if no logs left
        } else {
            guestData.journalEntries[dayIndex].lastUpdated = new Date().toISOString();
        }
        saveGuestDataToLocalStorage();
    }
}

export function deleteGuestJournalDay(dayId) {
    guestData.journalEntries = guestData.journalEntries.filter(entry => entry.id !== dayId);
    saveGuestDataToLocalStorage();
}