// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, getDocs, addDoc, deleteDoc, onSnapshot, collection, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove, where, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- App Constants ---
const firebaseConfig = { apiKey: "AIzaSyCht_2CFCVolrKp-dyZf3_2o7_KQI_7HoQ", authDomain: "my-retro-task-tracker.firebaseapp.com", projectId: "my-retro-task-tracker", storageBucket: "my-retro-task-tracker.appspot.com", messagingSenderId: "183935251636", appId: "1:183935251636:web:27581f344a56bab66153e1" };
const HEATMAP_DAYS = 90;
const JOURNAL_PAGE_SIZE = 15;
const TYPEWRITER_SPEED = 35;
const SCRAMBLE_CYCLES = 5;
const CHAR_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]{}<>';
const THEMES = { 'Default': 'theme-default', 'Wired': 'theme-lain', 'Bebop': 'theme-bebop', 'Ghost': 'theme-ghost', 'Kaido-64': 'theme-kaido' };
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

document.addEventListener('DOMContentLoaded', () => {
    // --- App State ---
    let db, auth, userId, apiKey;
    let tasksCollectionRef, journalCollectionRef, taskCategoriesCollectionRef;
    let unsubscribeTasks = null, unsubscribeJournal = null, unsubscribeCategories = null;
    let kaleidoscopeSketch = null;
    let activeScrambleTimers = [];
    let feedbackTimeout;
    let currentCategory = "all";
    let hasJournalLoaded = false;
    let hasSystemDataLoaded = false;
    let lastVisibleJournalDoc = null;
    let currentAiChatContext = null;

    // --- UI Element Cache ---
    const ui = {
        loginContainer: document.getElementById('loginContainer'), appContainer: document.getElementById('appContainer'),
        signInBtn: document.getElementById('signInBtn'), signOutBtn: document.getElementById('signOutBtn'),
        userIdDisplay: document.getElementById('userIdDisplay'), tasksView: document.getElementById('tasksView'),
        journalView: document.getElementById('journalView'), systemView: document.getElementById('systemView'),
        tasksTabBtn: document.getElementById('tasksTabBtn'), journalTabBtn: document.getElementById('journalTabBtn'),
        systemTabBtn: document.getElementById('systemTabBtn'), taskInput: document.getElementById('taskInput'),
        addTaskBtn: document.getElementById('addTaskBtn'), taskList: document.getElementById('taskList'),
        journalInput: document.getElementById('journalInput'), addJournalBtn: document.getElementById('addJournalBtn'),
        journalList: document.getElementById('journalList'),
        journalLoadMoreContainer: document.getElementById('journalLoadMoreContainer'),
        launchKaleidoscopeBtn: document.getElementById('launchKaleidoscopeBtn'),
        journalSearch: document.getElementById('journalSearch'), journalHeatmapContainer: document.getElementById('journalHeatmapContainer'),
        kaleidoscopeModal: document.getElementById('kaleidoscopeModal'), kSymmetrySlider: document.getElementById('kSymmetrySlider'),
        kClearBtn: document.getElementById('kClearBtn'), closeKaleidoscopeBtn: document.getElementById('closeKaleidoscopeBtn'),
        tasksViewTitle: document.getElementById('tasksViewTitle'), journalViewTitle: document.getElementById('journalViewTitle'),
        systemViewTitle: document.getElementById('systemViewTitle'), feedbackBox: document.getElementById('feedbackBox'),
        themeSwitcher: document.getElementById('themeSwitcher'), journalStreakDisplay: document.getElementById('journalStreakDisplay'),
        categorySelect: document.getElementById('categorySelect'), manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
        categoryManagerModal: document.getElementById('categoryManagerModal'), categoryList: document.getElementById('categoryList'),
        newCategoryInput: document.getElementById('newCategoryInput'), addCategoryBtn: document.getElementById('addCategoryBtn'),
        closeCategoryManagerBtn: document.getElementById('closeCategoryManagerBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'), saveApiKeyBtn: document.getElementById('saveApiKeyBtn'),
        aiChatModal: document.getElementById('aiChatModal'), aiChatHistory: document.getElementById('aiChatHistory'),
        aiChatInput: document.getElementById('aiChatInput'), aiChatSendBtn: document.getElementById('aiChatSendBtn'),
        closeAiChatBtn: document.getElementById('closeAiChatBtn'),
    };

    // --- Date Logic & Utilities ---
    const getTodayDocId = () => { const now = new Date(); const timezoneOffset = now.getTimezoneOffset() * 60000; const localDate = new Date(now.getTime() - timezoneOffset); return localDate.toISOString().slice(0, 10); };
    const toYMDString = (date) => { const timezoneOffset = date.getTimezoneOffset() * 60000; const localDate = new Date(date.getTime() - timezoneOffset); return localDate.toISOString().slice(0, 10); };
    const escapeHTML = str => str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]).replace(/\n/g, '<br>');
    const formatDisplayDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { timeZone: "UTC", year: 'numeric', month: 'long', day: 'numeric' });
    const generateLogId = () => Math.random().toString(36).substring(2, 9);

    // --- Core Application Logic ---
    function initializeFirebase() { const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }

    async function handleAuthStateChange(user) {
        if (user) {
            ui.appContainer.classList.remove('hidden');
            ui.loginContainer.classList.add('hidden');
            userId = user.uid;
            ui.userIdDisplay.textContent = user.displayName?.split(' ')[0].toUpperCase() || 'AGENT';
            tasksCollectionRef = collection(db, `users/${userId}/tasks`);
            journalCollectionRef = collection(db, `users/${userId}/journalEntries`);
            taskCategoriesCollectionRef = collection(db, `users/${userId}/taskCategories`);
            
            await loadUserConfig();
            loadCategoriesAndTasks();
            
            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, true);
        } else {
            ui.appContainer.classList.add('hidden');
            ui.loginContainer.classList.remove('hidden');
            if (unsubscribeTasks) unsubscribeTasks();
            if (unsubscribeJournal) unsubscribeJournal();
            if (unsubscribeCategories) unsubscribeCategories();
            hasJournalLoaded = false;
            hasSystemDataLoaded = false;
            apiKey = null;
        }
    }

    async function loadUserConfig() {
        const configRef = doc(db, `users/${userId}/configuration/api`);
        const configSnap = await getDoc(configRef);
        if (configSnap.exists() && configSnap.data().geminiApiKey) {
            apiKey = configSnap.data().geminiApiKey;
            ui.apiKeyInput.value = apiKey;
        } else {
            apiKey = null;
        }
    }
    
    // --- UI, Tasks, Journal, System ---
    function switchToView(viewName, isInitialLoad = false) { const views = { tasks: ui.tasksView, journal: ui.journalView, system: ui.systemView }; const tabs = { tasks: ui.tasksTabBtn, journal: ui.journalTabBtn, system: ui.systemTabBtn }; Object.values(views).forEach(v => v.classList.add('hidden')); Object.values(tabs).forEach(t => t.classList.remove('active')); if (views[viewName]) { views[viewName].classList.remove('hidden'); tabs[viewName].classList.add('active'); localStorage.setItem('systemlog-activeTab', viewName); const titles = { tasks: "Task Log", journal: "Daily Entry", system: "System Panel" }; if (!isInitialLoad) typewriterScrambleEffect(ui[`${viewName}ViewTitle`], titles[viewName]); else ui[`${viewName}ViewTitle`].textContent = titles[viewName]; } }
    function showFeedback(message, isError = false) { clearTimeout(feedbackTimeout); ui.feedbackBox.textContent = message; ui.feedbackBox.style.backgroundColor = isError ? 'var(--accent-danger)' : 'var(--accent-secondary)'; ui.feedbackBox.classList.remove('hidden'); feedbackTimeout = setTimeout(() => ui.feedbackBox.classList.add('hidden'), 3000); }
    async function loadCategoriesAndTasks() { if (unsubscribeCategories) unsubscribeCategories(); try { const snapshot = await getDocs(taskCategoriesCollectionRef); if (snapshot.empty) await addDoc(taskCategoriesCollectionRef, { name: "Default" }); const q = query(taskCategoriesCollectionRef, orderBy("name")); unsubscribeCategories = onSnapshot(q, (categorySnapshot) => { const categories = categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderCategoryDropdown(categories); renderCategoryManager(categories); loadTasks(); }); } catch (error) { console.error("FATAL ERROR during initial category load:", error); showFeedback("FATAL: Could not access task system.", true); } }
    function renderCategoryDropdown(categories) { const selectedValue = ui.categorySelect.value; ui.categorySelect.innerHTML = '<option value="all">All Tasks</option>'; categories.forEach(cat => { const option = document.createElement('option'); option.value = cat.id; option.textContent = cat.name; ui.categorySelect.appendChild(option); }); ui.categorySelect.value = selectedValue || 'all'; }
    function loadTasks() { if (unsubscribeTasks) unsubscribeTasks(); ui.taskList.innerHTML = `<p class="text-center p-2 opacity-70">Querying tasks...</p>`; const baseQuery = currentCategory === "all" ? [orderBy("isPriority", "desc"), orderBy("createdAt", "desc")] : [where("category", "==", currentCategory), orderBy("isPriority", "desc"), orderBy("createdAt", "desc")]; const q = query(tasksCollectionRef, ...baseQuery); unsubscribeTasks = onSnapshot(q, (snapshot) => { ui.taskList.innerHTML = snapshot.empty ? `<p class="text-center p-2 opacity-70">No active tasks in this list.</p>` : ""; snapshot.forEach(doc => renderTask({ id: doc.id, ...doc.data() })); }, (error) => { console.error("Task loading error. This is likely a missing Firestore Index.", error); ui.taskList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500">Error: A database index is required. Please follow console (F12) link to create it.</p>`; }); }
    async function addTask() { const taskText = ui.taskInput.value.trim(); if (taskText === "" || ui.categorySelect.value === "all") { if (ui.categorySelect.value === "all") showFeedback("Please select a specific list to add tasks to.", true); return; } try { await addDoc(tasksCollectionRef, { text: taskText, completed: false, isPriority: false, createdAt: serverTimestamp(), category: ui.categorySelect.value }); ui.taskInput.value = ""; } catch (error) { console.error("Error adding task: ", error); showFeedback("Error: Could not add task.", true); } }
    function renderTask(task) { const item = document.createElement('div'); item.className = `task-item-90s ${task.completed ? 'completed' : ''}`; item.innerHTML = `<div class="task-status"></div><p class="task-text">${escapeHTML(task.text)}</p><span class="priority-toggle ${task.isPriority ? 'active' : ''}">&#9733;</span><button class="delete-btn-90s">[DEL]</button>`; item.querySelector('.task-status').addEventListener('click', () => updateDoc(doc(db, `users/${userId}/tasks`, task.id), { completed: !task.completed })); item.querySelector('.priority-toggle').addEventListener('click', () => updateDoc(doc(db, `users/${userId}/tasks`, task.id), { isPriority: !task.isPriority })); item.querySelector('.delete-btn-90s').addEventListener('click', () => { playSound('clickSound'); deleteDoc(doc(db, `users/${userId}/tasks`, task.id)); }); ui.taskList.appendChild(item); }
    function renderCategoryManager(categories) { ui.categoryList.innerHTML = ''; categories.forEach(cat => { const item = document.createElement('div'); if (cat.name === "Default") { item.className = 'category-item opacity-50'; item.innerHTML = `<span class="category-item-name">${escapeHTML(cat.name)} (cannot delete)</span>`; } else { item.className = 'category-item'; item.innerHTML = `<span class="category-item-name">${escapeHTML(cat.name)}</span><button class="category-delete-btn" data-id="${cat.id}">[DEL]</button>`; item.querySelector('.category-delete-btn').addEventListener('click', () => deleteCategory(cat.id, cat.name)); } ui.categoryList.appendChild(item); }); }
    async function addCategory() { const categoryName = ui.newCategoryInput.value.trim(); if (categoryName === "") return; try { await addDoc(taskCategoriesCollectionRef, { name: categoryName }); ui.newCategoryInput.value = ""; } catch(error) { console.error("Error adding category:", error); showFeedback("Error adding list.", true); } }
    async function deleteCategory(id, name) { if (!confirm(`Delete the "${name}" list? (Tasks in this list will NOT be deleted).`)) return; try { await deleteDoc(doc(taskCategoriesCollectionRef, id)); } catch(error) { console.error("Error deleting category:", error); showFeedback("Error deleting list.", true); } }
    async function addJournalLog() { const logContent = ui.journalInput.value.trim(); if (logContent === "" || !userId) return; const todayId = getTodayDocId(); const journalDocRef = doc(db, `users/${userId}/journalEntries`, todayId); const newLog = { id: generateLogId(), time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), content: logContent }; try { const docSnap = await getDoc(journalDocRef); if (docSnap.exists()) { await updateDoc(journalDocRef, { logs: arrayUnion(newLog), lastUpdated: serverTimestamp() }); } else { await setDoc(journalDocRef, { logs: [newLog], displayDate: formatDisplayDate(todayId), lastUpdated: serverTimestamp() }); } ui.journalInput.value = ""; showFeedback("Log committed."); } catch (error) { console.error("Error adding journal log:", error); showFeedback("Error: Could not save log.", true); } }
    function loadJournal() { if (unsubscribeJournal) unsubscribeJournal(); lastVisibleJournalDoc = null; ui.journalList.innerHTML = `<p class="text-center p-2 opacity-70">Accessing archives...</p>`; ui.journalLoadMoreContainer.innerHTML = ''; const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"), limit(JOURNAL_PAGE_SIZE)); unsubscribeJournal = onSnapshot(q, (snapshot) => { if (lastVisibleJournalDoc === null) ui.journalList.innerHTML = ''; if (snapshot.empty && lastVisibleJournalDoc === null) { ui.journalList.innerHTML = `<p class="text-center p-2 opacity-70">No logs found.</p>`; return; } snapshot.docs.forEach(doc => renderJournalDayEntry({ id: doc.id, ...doc.data() })); if (snapshot.docs.length >= JOURNAL_PAGE_SIZE) { lastVisibleJournalDoc = snapshot.docs[snapshot.docs.length - 1]; renderLoadMoreButton(); } else { lastVisibleJournalDoc = null; ui.journalLoadMoreContainer.innerHTML = ''; } }); }
    function renderLoadMoreButton() { ui.journalLoadMoreContainer.innerHTML = `<button id="journalLoadMoreBtn" class="button-90s">Load More Archives</button>`; document.getElementById('journalLoadMoreBtn').addEventListener('click', loadMoreJournalEntries); }
    async function loadMoreJournalEntries() { if (!lastVisibleJournalDoc) return; const loadMoreBtn = document.getElementById('journalLoadMoreBtn'); loadMoreBtn.textContent = 'Loading...'; loadMoreBtn.disabled = true; const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"), startAfter(lastVisibleJournalDoc), limit(JOURNAL_PAGE_SIZE)); const snapshot = await getDocs(q); snapshot.docs.forEach(doc => renderJournalDayEntry({ id: doc.id, ...doc.data() })); if (snapshot.docs.length < JOURNAL_PAGE_SIZE) { lastVisibleJournalDoc = null; ui.journalLoadMoreContainer.innerHTML = ''; } else { lastVisibleJournalDoc = snapshot.docs[snapshot.docs.length - 1]; loadMoreBtn.textContent = 'Load More Archives'; loadMoreBtn.disabled = false; } }
    function renderJournalDayEntry(dayEntry) { const item = document.createElement('div'); item.className = 'journal-day-entry border-b border-dashed border-border-color pb-4 mb-4'; item.innerHTML = `<div class="journal-day-header"><p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${dayEntry.displayDate}</p><div class="journal-day-controls"><span class="journal-control-btn chat">[chat]</span><span class="journal-control-btn delete">[delete]</span></div></div><div class="journal-day-content"></div>`; const contentDiv = item.querySelector('.journal-day-content'); if (dayEntry.logs && dayEntry.logs.length > 0) { dayEntry.logs.slice().reverse().forEach(log => { const logEl = document.createElement('div'); logEl.className = 'flex justify-between items-start py-1'; logEl.innerHTML = `<div><span class="opacity-70">[${log.time}]</span> ${escapeHTML(log.content)}</div><button class="delete-log-btn text-sm opacity-70 hover:opacity-100">[del]</button>`; logEl.querySelector('.delete-log-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteIndividualLog(dayEntry.id, log); }); contentDiv.appendChild(logEl); }); } const header = item.querySelector('.journal-day-header'); header.addEventListener('click', (e) => { if (e.target.classList.contains('journal-control-btn')) return; playSound('clickSound'); item.classList.toggle('expanded'); item.querySelector('.toggle-indicator').textContent = item.classList.contains('expanded') ? '[-]' : '[+]'; }); item.querySelector('.chat').addEventListener('click', (e) => { e.stopPropagation(); playSound('clickSound'); openAiChat(dayEntry); }); item.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); deleteJournalDay(dayEntry.id, dayEntry.displayDate); }); ui.journalList.appendChild(item); }
    async function deleteIndividualLog(dayDocId, logToRemove) { if (!confirm(`Delete log entry?`)) return; await updateDoc(doc(db, `users/${userId}/journalEntries`, dayDocId), { logs: arrayRemove(logToRemove) }); }
    async function deleteJournalDay(dayDocId, dayDate) { if (!confirm(`Delete all logs for ${dayDate}?`)) return; await deleteDoc(doc(db, `users/${userId}/journalEntries`, dayDocId)); }
    function handleJournalSearch() { const searchTerm = ui.journalSearch.value.toLowerCase(); document.querySelectorAll('#journalList > .journal-day-entry').forEach(entry => { entry.style.display = entry.textContent.toLowerCase().includes(searchTerm) ? '' : 'none'; }); }
    async function loadAllJournalMetadata() { const q = query(journalCollectionRef, orderBy("lastUpdated", "desc")); const snapshot = await getDocs(q); const journalDocs = snapshot.docs; renderJournalHeatmap(journalDocs); calculateJournalStreak(journalDocs); }
    function calculateJournalStreak(journalDocs) { const journalDates = new Set(journalDocs.map(doc => doc.id)); if (journalDates.size === 0) { ui.journalStreakDisplay.textContent = `0 DAYS`; return; } let streak = 0; let currentDate = new Date(); if (!journalDates.has(getTodayDocId())) currentDate.setDate(currentDate.getDate() - 1); while (journalDates.has(toYMDString(currentDate))) { streak++; currentDate.setDate(currentDate.getDate() - 1); } ui.journalStreakDisplay.textContent = `${streak} DAY${streak !== 1 ? 'S' : ''}`; }
    function renderJournalHeatmap(docs) { ui.journalHeatmapContainer.innerHTML = ''; const logDates = new Set(docs.map(doc => doc.id)); for (let i = HEATMAP_DAYS - 1; i >= 0; i--) { let date = new Date(); date.setDate(date.getDate() - i); const dateString = toYMDString(date); const dayDiv = document.createElement('div'); dayDiv.className = 'heatmap-day'; dayDiv.title = formatDisplayDate(dateString); if (logDates.has(dateString)) dayDiv.classList.add('active'); ui.journalHeatmapContainer.appendChild(dayDiv); } }
    
    // --- AI Chat Functions ---
    function openAiChat(dayEntry) {
        currentAiChatContext = dayEntry;
        ui.aiChatHistory.innerHTML = '';
        ui.aiChatInput.value = '';
        displayChatMessage('Connection established. Ready for analysis of log dated ' + dayEntry.displayDate, 'gemini');
        ui.aiChatModal.classList.remove('hidden');
        ui.aiChatInput.focus();
    }

    function closeAiChat() {
        ui.aiChatModal.classList.add('hidden');
        currentAiChatContext = null;
    }

    async function sendAiChatMessage() {
        const userPrompt = ui.aiChatInput.value.trim();
        if (userPrompt === "" || !apiKey) {
            if (!apiKey) showFeedback("Error: API Key not configured in System tab.", true);
            return;
        }
        ui.aiChatInput.value = '';
        ui.aiChatInput.disabled = true;
        ui.aiChatSendBtn.disabled = true;

        displayChatMessage(userPrompt, 'user');
        const thinkingMessage = displayChatMessage('...', 'gemini');
        
        try {
            const aiResponse = await getAiResponse(userPrompt, currentAiChatContext);
            thinkingMessage.querySelector('p').innerHTML = escapeHTML(aiResponse); // Use innerHTML to render line breaks from AI
        } catch (error) {
            thinkingMessage.querySelector('p').textContent = `Error: ${error.message}`;
            console.error("AI Chat Error:", error);
        } finally {
            ui.aiChatInput.disabled = false;
            ui.aiChatSendBtn.disabled = false;
            ui.aiChatInput.focus();
        }
    }

    function displayChatMessage(message, sender) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `ai-chat-message ${sender}`;
        messageWrapper.innerHTML = `<div class="sender">${sender}</div><p>${escapeHTML(message)}</p>`;
        ui.aiChatHistory.appendChild(messageWrapper);
        ui.aiChatHistory.scrollTop = ui.aiChatHistory.scrollHeight;
        return messageWrapper;
    }

async function getAiResponse(userPrompt, journalEntry) {
    if (!apiKey) throw new Error("API Key not found. Please save your key in the System tab.");

    const logsText = journalEntry.logs.map(log => `- ${log.time}: ${log.content}`).join('\n');
    const fullPrompt = `SYSTEM PREMISE: You are Gemma, a helpful AI assistant integrated into a personal journaling app called "System Log". Your persona is that of a slightly retro, cyberpunk AI. You are analyzing a journal entry for your user, whom you refer to as "Master". Be helpful, insightful, and maintain the persona.
    
    JOURNAL CONTEXT:
    Date of Entry: ${journalEntry.displayDate}
    Logs:
    ${logsText}
    ---
    USER QUERY: ${userPrompt}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.7, topK: 40 }
        })
    });

    if (!response.ok) {
         const errorData = await response.json();
         console.error("API Error Response:", errorData);
         throw new Error(`API request failed with status ${response.status}.`);
    }
    
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Invalid response structure from API.");
    return text;
}


    // --- Restored Features & Init Block ---
    function initializeThemes() { Object.keys(THEMES).forEach(themeName => { const button = document.createElement('button'); button.textContent = themeName; button.className = 'button-90s theme-button'; button.dataset.theme = themeName; button.addEventListener('click', () => { playSound('clickSound'); applyTheme(themeName); }); ui.themeSwitcher.appendChild(button); }); const savedTheme = localStorage.getItem('systemlog-theme') || 'Default'; applyTheme(savedTheme); }
    function applyTheme(themeName) { document.body.className = THEMES[themeName] || ''; localStorage.setItem('systemlog-theme', themeName); document.querySelectorAll('.theme-button').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === themeName)); }
    function typewriterScrambleEffect(element, text) { if (!element) return; activeScrambleTimers.forEach(timer => clearInterval(timer)); activeScrambleTimers = []; element.textContent = ''; let i = 0; function typeCharacter() { if (i < text.length) { const originalChar = text.charAt(i); let scrambleCount = 0; const scrambleInterval = setInterval(() => { if (scrambleCount >= SCRAMBLE_CYCLES) { clearInterval(scrambleInterval); element.textContent = element.textContent.slice(0, i) + originalChar; i++; typeCharacter(); } else { const randomChar = CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length)); element.textContent = element.textContent.slice(0, i) + randomChar; scrambleCount++; } }, TYPEWRITER_SPEED / 2); activeScrambleTimers.push(scrambleInterval); element.textContent += ' '; } }; typeCharacter(); };
    function playSound(soundId) { const sound = document.getElementById(soundId); if (!sound) return; const volume = parseFloat(sound.getAttribute('data-volume')) || 1.0; sound.volume = volume; sound.currentTime = 0; sound.play().catch(error => { if (error.name !== "NotAllowedError") console.error("Audio playback error:", error); }); }
    function startKaleidoscope() { ui.kaleidoscopeModal.classList.remove('hidden'); if (!kaleidoscopeSketch) kaleidoscopeSketch = new p5(k_sketch); }
    function stopKaleidoscope() { ui.kaleidoscopeModal.classList.add('hidden'); }
    const k_sketch = (p) => { p.setup = () => { const parent = document.getElementById('kaleidoscopeCanvasParent'); const size = Math.min(parent.clientWidth - 4, 400); const canvas = p.createCanvas(size, size); canvas.parent(parent); p.colorMode(p.HSB); p.background(20); }; p.draw = () => { if (p.mouseIsPressed && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) { const symmetry = ui.kSymmetrySlider.value; const angle = 360 / symmetry; const mx = p.mouseX - p.width / 2; const my = p.mouseY - p.height / 2; const pmx = p.pmouseX - p.width / 2; const pmy = p.pmouseY - p.height / 2; p.translate(p.width / 2, p.height / 2); p.stroke((p.frameCount * 2) % 360, 80, 100); p.strokeWeight(3); for (let i = 0; i < symmetry; i++) { p.rotate(angle); p.line(mx, my, pmx, pmy); p.push(); p.scale(1, -1); p.line(mx, my, pmx, pmy); p.pop(); } } }; p.clearCanvas = () => p.background(20); };

    function init() {
        initializeFirebase();
        initializeThemes();
        ui.signInBtn.addEventListener('click', () => { if (auth) signInWithPopup(auth, new GoogleAuthProvider()); });
        ui.signOutBtn.addEventListener('click', () => signOut(auth));
        
        ui.tasksTabBtn.addEventListener('click', () => { playSound('clickSound'); switchToView('tasks'); });
        ui.journalTabBtn.addEventListener('click', () => { playSound('clickSound'); if (!hasJournalLoaded) { loadJournal(); hasJournalLoaded = true; } switchToView('journal'); });
        ui.systemTabBtn.addEventListener('click', () => { playSound('clickSound'); if (!hasSystemDataLoaded) { loadAllJournalMetadata(); hasSystemDataLoaded = true; } switchToView('system'); });

        ui.addTaskBtn.addEventListener('click', () => { playSound('clickSound'); addTask(); });
        ui.taskInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); addTask(); } });
        ui.addJournalBtn.addEventListener('click', () => { playSound('clickSound'); addJournalLog(); });
        ui.journalSearch.addEventListener('input', handleJournalSearch);
        ui.launchKaleidoscopeBtn.addEventListener('click', () => { playSound('clickSound'); startKaleidoscope(); });
        ui.closeKaleidoscopeBtn.addEventListener('click', () => { playSound('clickSound'); stopKaleidoscope(); });
        ui.kClearBtn.addEventListener('click', () => { playSound('clickSound'); kaleidoscopeSketch?.clearCanvas(); });
        ui.categorySelect.addEventListener('change', (e) => { currentCategory = e.target.value; loadTasks(); });
        ui.manageCategoriesBtn.addEventListener('click', () => { playSound('clickSound'); ui.categoryManagerModal.classList.remove('hidden'); });
        ui.closeCategoryManagerBtn.addEventListener('click', () => { playSound('clickSound'); ui.categoryManagerModal.classList.add('hidden'); });
        ui.addCategoryBtn.addEventListener('click', () => { playSound('clickSound'); addCategory(); });
        ui.newCategoryInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); addCategory(); } });
        
        ui.saveApiKeyBtn.addEventListener('click', async () => {
            playSound('clickSound');
            const keyToSave = ui.apiKeyInput.value;
            const configRef = doc(db, `users/${userId}/configuration/api`);
            try {
                await setDoc(configRef, { geminiApiKey: keyToSave });
                apiKey = keyToSave;
                showFeedback("API Key saved securely.");
            } catch (error) {
                console.error("Error saving API Key:", error);
                showFeedback("Error: Could not save API Key.", true);
            }
        });
        ui.closeAiChatBtn.addEventListener('click', () => { playSound('clickSound'); closeAiChat(); });
        ui.aiChatSendBtn.addEventListener('click', () => { playSound('clickSound'); sendAiChatMessage(); });
        ui.aiChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') { playSound('clickSound'); sendAiChatMessage(); } });

        onAuthStateChanged(auth, handleAuthStateChange);
    }
    
    init();
});