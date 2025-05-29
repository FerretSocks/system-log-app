// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, getDocs, addDoc, deleteDoc, onSnapshot, collection, query, orderBy, serverTimestamp, updateDoc, arrayUnion, arrayRemove, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- App Constants ---
const firebaseConfig = { apiKey: "AIzaSyCht_2CFCVolrKp-dyZf3_2o7_KQI_7HoQ", authDomain: "my-retro-task-tracker.firebaseapp.com", projectId: "my-retro-task-tracker", storageBucket: "my-retro-task-tracker.appspot.com", messagingSenderId: "183935251636", appId: "1:183935251636:web:27581f344a56bab66153e1" };
const HEATMAP_DAYS = 90;
const TYPEWRITER_SPEED = 35;
const SCRAMBLE_CYCLES = 5;
const CHAR_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()[]{}<>';
const THEMES = { 'Default': 'theme-default', 'Wired': 'theme-lain', 'Bebop': 'theme-bebop', 'Ghost': 'theme-ghost', 'Kaido-64': 'theme-kaido' };

document.addEventListener('DOMContentLoaded', () => {
    // --- App State ---
    let db, auth, userId;
    let tasksCollectionRef, journalCollectionRef, taskCategoriesCollectionRef;
    let unsubscribeTasks = null, unsubscribeJournal = null, unsubscribeCategories = null;
    let kaleidoscopeSketch = null;
    let activeScrambleTimers = [];
    let feedbackTimeout;
    let currentCategory = "all";

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
        journalList: document.getElementById('journalList'), launchKaleidoscopeBtn: document.getElementById('launchKaleidoscopeBtn'),
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
    };

    // --- Correct Date Logic ---
    const getTodayDocId = () => {
        const now = new Date();
        const timezoneOffset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - timezoneOffset);
        return localDate.toISOString().slice(0, 10);
    };
    
    // Helper function to convert ANY date object to YYYY-MM-DD string
    const toYMDString = (date) => {
        const timezoneOffset = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - timezoneOffset);
        return localDate.toISOString().slice(0, 10);
    };

    // --- Utility Functions ---
    const escapeHTML = str => str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]).replace(/\n/g, '<br>');
    const formatDisplayDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { timeZone: "UTC", year: 'numeric', month: 'long', day: 'numeric' });
    const generateLogId = () => Math.random().toString(36).substring(2, 9);

    // --- Core Application Logic ---
    function initializeFirebase() {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }

    function handleAuthStateChange(user) {
        if (user) {
            ui.appContainer.classList.remove('hidden');
            ui.loginContainer.classList.add('hidden');
            userId = user.uid;
            ui.userIdDisplay.textContent = user.displayName?.split(' ')[0].toUpperCase() || 'AGENT';
            tasksCollectionRef = collection(db, `users/${userId}/tasks`);
            journalCollectionRef = collection(db, `users/${userId}/journalEntries`);
            taskCategoriesCollectionRef = collection(db, `users/${userId}/taskCategories`);
            loadCategoriesAndTasks();
            loadJournal();
            const savedTab = localStorage.getItem('systemlog-activeTab') || 'tasks';
            switchToView(savedTab, true);
        } else {
            ui.appContainer.classList.add('hidden');
            ui.loginContainer.classList.remove('hidden');
            if (unsubscribeTasks) unsubscribeTasks();
            if (unsubscribeJournal) unsubscribeJournal();
            if (unsubscribeCategories) unsubscribeCategories();
        }
    }

    // --- UI and View Management ---
    function switchToView(viewName, isInitialLoad = false) {
        const views = { tasks: ui.tasksView, journal: ui.journalView, system: ui.systemView };
        const tabs = { tasks: ui.tasksTabBtn, journal: ui.journalTabBtn, system: ui.systemTabBtn };
        Object.values(views).forEach(v => v.classList.add('hidden'));
        Object.values(tabs).forEach(t => t.classList.remove('active'));
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
            tabs[viewName].classList.add('active');
            localStorage.setItem('systemlog-activeTab', viewName);
            const titles = { tasks: "Task Log", journal: "Daily Entry", system: "System Panel" };
            if (!isInitialLoad) typewriterScrambleEffect(ui[`${viewName}ViewTitle`], titles[viewName]);
            else ui[`${viewName}ViewTitle`].textContent = titles[viewName];
        }
    }

    function showFeedback(message, isError = false) {
        clearTimeout(feedbackTimeout);
        ui.feedbackBox.textContent = message;
        ui.feedbackBox.style.backgroundColor = isError ? 'var(--accent-danger)' : 'var(--accent-secondary)';
        ui.feedbackBox.classList.remove('hidden');
        feedbackTimeout = setTimeout(() => ui.feedbackBox.classList.add('hidden'), 3000);
    }

    // --- Task and Category Management ---
    async function loadCategoriesAndTasks() {
        if (unsubscribeCategories) unsubscribeCategories();
        try {
            const snapshot = await getDocs(taskCategoriesCollectionRef);
            if (snapshot.empty) await addDoc(taskCategoriesCollectionRef, { name: "Default" });
            const q = query(taskCategoriesCollectionRef, orderBy("name"));
            unsubscribeCategories = onSnapshot(q, (categorySnapshot) => {
                const categories = categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderCategoryDropdown(categories);
                renderCategoryManager(categories);
                loadTasks();
            }, (error) => {
                console.error("FATAL ERROR in category listener:", error);
                showFeedback("FATAL: Could not load task lists.", true);
            });
        } catch (error) {
            console.error("FATAL ERROR during initial category load:", error);
            showFeedback("FATAL: Could not access task system.", true);
        }
    }

    function renderCategoryDropdown(categories) {
        const selectedValue = ui.categorySelect.value;
        ui.categorySelect.innerHTML = '<option value="all">All Tasks</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            ui.categorySelect.appendChild(option);
        });
        ui.categorySelect.value = selectedValue || 'all';
    }

    function loadTasks() {
        if (unsubscribeTasks) unsubscribeTasks();
        ui.taskList.innerHTML = `<p class="text-center p-2 opacity-70">Querying tasks...</p>`;
        let q;
        const baseQuery = currentCategory === "all"
            ? [orderBy("isPriority", "desc"), orderBy("createdAt", "desc")]
            : [where("category", "==", currentCategory), orderBy("isPriority", "desc"), orderBy("createdAt", "desc")];
        q = query(tasksCollectionRef, ...baseQuery);
        unsubscribeTasks = onSnapshot(q, (snapshot) => {
            ui.taskList.innerHTML = "";
            if (snapshot.empty) ui.taskList.innerHTML = `<p class="text-center p-2 opacity-70">No active tasks in this list.</p>`;
            else snapshot.forEach(doc => renderTask({ id: doc.id, ...doc.data() }));
        }, (error) => {
            console.error("Task loading error. This is likely a missing Firestore Index.", error);
            ui.taskList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500">Error: A database index is required. Please follow console (F12) link to create it.</p>`;
        });
    }

    async function addTask() {
        const taskText = ui.taskInput.value.trim();
        if (taskText === "") return;
        const categoryId = ui.categorySelect.value;
        if (categoryId === "all") {
            showFeedback("Please select a specific list to add tasks to.", true);
            return;
        }
        try {
            await addDoc(tasksCollectionRef, { text: taskText, completed: false, isPriority: false, createdAt: serverTimestamp(), category: categoryId });
            ui.taskInput.value = "";
        } catch (error) { console.error("Error adding task: ", error); showFeedback("Error: Could not add task.", true); }
    }

    function renderTask(task) {
        const item = document.createElement('div');
        item.className = `task-item-90s ${task.completed ? 'completed' : ''}`;
        item.innerHTML = `<div class="task-status"></div><p class="task-text">${escapeHTML(task.text)}</p><span class="priority-toggle ${task.isPriority ? 'active' : ''}">&#9733;</span><button class="delete-btn-90s">[DEL]</button>`;
        item.querySelector('.task-status').addEventListener('click', () => updateDoc(doc(db, `users/${userId}/tasks`, task.id), { completed: !task.completed }));
        item.querySelector('.priority-toggle').addEventListener('click', () => updateDoc(doc(db, `users/${userId}/tasks`, task.id), { isPriority: !task.isPriority }));
        item.querySelector('.delete-btn-90s').addEventListener('click', () => { playSound('clickSound'); deleteDoc(doc(db, `users/${userId}/tasks`, task.id)); });
        ui.taskList.appendChild(item);
    }
    
    function renderCategoryManager(categories) {
        ui.categoryList.innerHTML = '';
        categories.forEach(cat => {
            const item = document.createElement('div');
            if (cat.name === "Default") {
                item.className = 'category-item opacity-50';
                item.innerHTML = `<span class="category-item-name">${escapeHTML(cat.name)} (cannot delete)</span>`;
            } else {
                item.className = 'category-item';
                item.innerHTML = `<span class="category-item-name">${escapeHTML(cat.name)}</span><button class="category-delete-btn" data-id="${cat.id}">[DEL]</button>`;
                item.querySelector('.category-delete-btn').addEventListener('click', () => deleteCategory(cat.id, cat.name));
            }
            ui.categoryList.appendChild(item);
        });
    }

    async function addCategory() {
        const categoryName = ui.newCategoryInput.value.trim();
        if (categoryName === "") return;
        try {
            await addDoc(taskCategoriesCollectionRef, { name: categoryName });
            ui.newCategoryInput.value = "";
        } catch(error) { console.error("Error adding category:", error); showFeedback("Error adding list.", true); }
    }

    async function deleteCategory(id, name) {
        if (!confirm(`Delete the "${name}" list? (Tasks in this list will NOT be deleted).`)) return;
        try {
            await deleteDoc(doc(taskCategoriesCollectionRef, id));
        } catch(error) { console.error("Error deleting category:", error); showFeedback("Error deleting list.", true); }
    }

    // --- Journal Management ---
    async function addJournalLog() {
        const logContent = ui.journalInput.value.trim();
        if (logContent === "" || !userId) return;
        const todayId = getTodayDocId();
        const journalDocRef = doc(db, `users/${userId}/journalEntries`, todayId);
        const newLog = { id: generateLogId(), time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), content: logContent };
        try {
            const docSnap = await getDoc(journalDocRef);
            if (docSnap.exists()) {
                await updateDoc(journalDocRef, { logs: arrayUnion(newLog), lastUpdated: serverTimestamp() });
            } else {
                await setDoc(journalDocRef, { logs: [newLog], displayDate: formatDisplayDate(todayId), lastUpdated: serverTimestamp() });
            }
            ui.journalInput.value = "";
            showFeedback("Log committed.");
        } catch (error) { console.error("Error adding journal log:", error); showFeedback("Error: Could not save log.", true); }
    }

    function loadJournal() {
        if(unsubscribeJournal) unsubscribeJournal();
        const q = query(journalCollectionRef, orderBy("lastUpdated", "desc"));
        unsubscribeJournal = onSnapshot(q, (snapshot) => {
            const journalDocs = snapshot.docs;
            ui.journalList.innerHTML = snapshot.empty ? `<p class="text-center p-2 opacity-70">No logs found.</p>` : "";
            journalDocs.forEach(doc => renderJournalDayEntry({ id: doc.id, ...doc.data() }));
            renderJournalHeatmap(journalDocs);
            calculateJournalStreak(journalDocs);
        }, (error) => { console.error("Journal loading error:", error); showFeedback("Error: Failed to load journal.", true); });
    }

    function renderJournalDayEntry(dayEntry) {
        const item = document.createElement('div');
        item.className = 'journal-day-entry border-b border-dashed border-border-color pb-4 mb-4';
        item.innerHTML = `<div class="journal-day-header"><p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${dayEntry.displayDate}</p><div class="journal-day-controls"><span class="journal-control-btn chat">[chat]</span><span class="journal-control-btn delete">[delete]</span></div></div><div class="journal-day-content"></div>`;
        const contentDiv = item.querySelector('.journal-day-content');
        if (dayEntry.logs && dayEntry.logs.length > 0) {
            dayEntry.logs.slice().reverse().forEach(log => {
                const logEl = document.createElement('div');
                logEl.className = 'flex justify-between items-start py-1';
                logEl.innerHTML = `<div><span class="opacity-70">[${log.time}]</span> ${escapeHTML(log.content)}</div><button class="delete-log-btn text-sm opacity-70 hover:opacity-100">[del]</button>`;
                logEl.querySelector('.delete-log-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteIndividualLog(dayEntry.id, log); });
                contentDiv.appendChild(logEl);
            });
        }
        const header = item.querySelector('.journal-day-header');
        header.addEventListener('click', (e) => {
            if (e.target.classList.contains('journal-control-btn')) return;
            playSound('clickSound');
            item.classList.toggle('expanded');
            item.querySelector('.toggle-indicator').textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
        });
        item.querySelector('.chat').addEventListener('click', (e) => { e.stopPropagation(); playSound('clickSound'); generateAndCopyGeminiPrompt(dayEntry); });
        item.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); deleteJournalDay(dayEntry.id, dayEntry.displayDate); });
        ui.journalList.appendChild(item);
    }

    async function deleteIndividualLog(dayDocId, logToRemove) { if (!confirm(`Delete log entry?`)) return; await updateDoc(doc(db, `users/${userId}/journalEntries`, dayDocId), { logs: arrayRemove(logToRemove) }); }
    async function deleteJournalDay(dayDocId, dayDate) { if (!confirm(`Delete all logs for ${dayDate}?`)) return; await deleteDoc(doc(db, `users/${userId}/journalEntries`, dayDocId)); }
    function handleJournalSearch() { const searchTerm = ui.journalSearch.value.toLowerCase(); document.querySelectorAll('#journalList > .journal-day-entry').forEach(entry => { entry.style.display = entry.textContent.toLowerCase().includes(searchTerm) ? '' : 'none'; }); }

    // --- System Panel Features (CORRECTED) ---
    function calculateJournalStreak(journalDocs) {
        const journalDates = new Set(journalDocs.map(doc => doc.id));
        if (journalDates.size === 0) { ui.journalStreakDisplay.textContent = `0 DAYS`; return; }
        let streak = 0;
        let currentDate = new Date();
        if (!journalDates.has(getTodayDocId())) currentDate.setDate(currentDate.getDate() - 1);
        while (journalDates.has(toYMDString(currentDate))) { // CORRECTED to use toYMDString
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        }
        ui.journalStreakDisplay.textContent = `${streak} DAY${streak !== 1 ? 'S' : ''}`;
    }

    function renderJournalHeatmap(docs) {
        ui.journalHeatmapContainer.innerHTML = '';
        const logDates = new Set(docs.map(doc => doc.id));
        for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
            let date = new Date();
            date.setDate(date.getDate() - i);
            const dateString = toYMDString(date); // CORRECTED to use toYMDString
            const dayDiv = document.createElement('div');
            dayDiv.className = 'heatmap-day';
            dayDiv.title = formatDisplayDate(dateString);
            if (logDates.has(dateString)) dayDiv.classList.add('active');
            ui.journalHeatmapContainer.appendChild(dayDiv);
        }
    }

    function initializeThemes() {
        Object.keys(THEMES).forEach(themeName => {
            const button = document.createElement('button');
            button.textContent = themeName;
            button.className = 'button-90s theme-button';
            button.dataset.theme = themeName;
            button.addEventListener('click', () => { playSound('clickSound'); applyTheme(themeName); });
            ui.themeSwitcher.appendChild(button);
        });
        const savedTheme = localStorage.getItem('systemlog-theme') || 'Default';
        applyTheme(savedTheme);
    }

    function applyTheme(themeName) {
        document.body.className = THEMES[themeName] || '';
        localStorage.setItem('systemlog-theme', themeName);
        document.querySelectorAll('.theme-button').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === themeName));
    }
    
    // --- Other Features (No Changes) ---
    function typewriterScrambleEffect(element, text) { if (!element) return; activeScrambleTimers.forEach(timer => clearInterval(timer)); activeScrambleTimers = []; element.textContent = ''; let i = 0; function typeCharacter() { if (i < text.length) { const originalChar = text.charAt(i); let scrambleCount = 0; const scrambleInterval = setInterval(() => { if (scrambleCount >= SCRAMBLE_CYCLES) { clearInterval(scrambleInterval); element.textContent = element.textContent.slice(0, i) + originalChar; i++; typeCharacter(); } else { const randomChar = CHAR_POOL.charAt(Math.floor(Math.random() * CHAR_POOL.length)); element.textContent = element.textContent.slice(0, i) + randomChar; scrambleCount++; } }, TYPEWRITER_SPEED / 2); activeScrambleTimers.push(scrambleInterval); element.textContent += ' '; } }; typeCharacter(); };
    function playSound(soundId) { const sound = document.getElementById(soundId); if (!sound) return; const volume = parseFloat(sound.getAttribute('data-volume')) || 1.0; sound.volume = volume; sound.currentTime = 0; sound.play().catch(error => { if (error.name !== "NotAllowedError") console.error("Audio playback error:", error); }); }
    function generateAndCopyGeminiPrompt(dayEntry) { const logsText = dayEntry.logs.map(log => `- At ${log.time}, I noted: "${log.content}"`).join('\n'); const prompt = `Hello Gemini... Take a look at my journal entry from ${dayEntry.displayDate} and let's have a conversation about my day. Here are my logs:\n\n${logsText}\n\nWhat do you think?`; navigator.clipboard.writeText(prompt).then(() => showFeedback("Prompt copied to clipboard!")).catch(() => showFeedback("Error: Could not copy prompt.", true)); }
    function startKaleidoscope() { ui.kaleidoscopeModal.classList.remove('hidden'); if (!kaleidoscopeSketch) kaleidoscopeSketch = new p5(k_sketch); }
    function stopKaleidoscope() { ui.kaleidoscopeModal.classList.add('hidden'); }
    const k_sketch = (p) => { p.setup = () => { const parent = document.getElementById('kaleidoscopeCanvasParent'); const size = Math.min(parent.clientWidth - 4, 400); const canvas = p.createCanvas(size, size); canvas.parent(parent); p.colorMode(p.HSB); p.background(20); }; p.draw = () => { if (p.mouseIsPressed && p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) { const symmetry = ui.kSymmetrySlider.value; const angle = 360 / symmetry; const mx = p.mouseX - p.width / 2; const my = p.mouseY - p.height / 2; const pmx = p.pmouseX - p.width / 2; const pmy = p.pmouseY - p.height / 2; p.translate(p.width / 2, p.height / 2); p.stroke((p.frameCount * 2) % 360, 80, 100); p.strokeWeight(3); for (let i = 0; i < symmetry; i++) { p.rotate(angle); p.line(mx, my, pmx, pmy); p.push(); p.scale(1, -1); p.line(mx, my, pmx, pmy); p.pop(); } } }; p.clearCanvas = () => p.background(20); };

    // --- App Initialization Block ---
    function init() {
        initializeFirebase();
        initializeThemes();
        ui.signInBtn.addEventListener('click', () => { if (auth) signInWithPopup(auth, new GoogleAuthProvider()); });
        ui.signOutBtn.addEventListener('click', () => signOut(auth));
        ['tasks', 'journal', 'system'].forEach(view => ui[`${view}TabBtn`].addEventListener('click', () => { playSound('clickSound'); setTimeout(() => switchToView(view), 150); }));
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
        onAuthStateChanged(auth, handleAuthStateChange);
    }
    
    init();
});