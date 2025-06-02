// public/js/taskManager.js
import { db, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, where, getDocs } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js'; 
import { escapeHTML } from './utils.js'; 
// import { playSound } from './soundManager.js'; // playSound import removed
import { isGuestMode, getGuestTasks, addGuestTask, updateGuestTaskCompletion, updateGuestTaskPriority, deleteGuestTask, getUserId as getAuthUserId } from './guestManager.js';


let tasksCollectionRef = null;
let taskCategoriesCollectionRef = null;
let unsubscribeTasks = null;
let unsubscribeCategories = null;
let currentCategory = "all"; 
let localCategoriesCache = []; 

/**
 * Initializes Firestore references for a logged-in (non-guest) user.
 */
export function initializeTaskReferences() {
    const userId = getAuthUserId();
    if (userId && !isGuestMode()) {
        tasksCollectionRef = collection(db, `users/${userId}/tasks`);
        taskCategoriesCollectionRef = collection(db, `users/${userId}/taskCategories`);
    } else {
        tasksCollectionRef = null;
        taskCategoriesCollectionRef = null;
    }
}

/**
 * Loads task categories from Firestore and then loads tasks.
 * Only for authenticated users.
 */
export async function loadCategoriesAndTasks() {
    if (isGuestMode() || !taskCategoriesCollectionRef) {
        loadTasks(true);
        if(uiElements.categorySelect) uiElements.categorySelect.innerHTML = '<option value="default">My Tasks</option>';
        if(uiElements.categorySelect) uiElements.categorySelect.disabled = true;
        if(uiElements.manageCategoriesBtn) uiElements.manageCategoriesBtn.classList.add('hidden');
        if(document.getElementById('taskCategoryContainer')) document.getElementById('taskCategoryContainer').classList.add('hidden');
        return;
    }

    if (document.getElementById('taskCategoryContainer')) document.getElementById('taskCategoryContainer').classList.remove('hidden');


    if (unsubscribeCategories) unsubscribeCategories();
    try {
        const snapshot = await getDocs(taskCategoriesCollectionRef);
        if (snapshot.empty) {
            await addDoc(taskCategoriesCollectionRef, { name: "Default", createdAt: serverTimestamp() });
        }

        const q = query(taskCategoriesCollectionRef, orderBy("name"));
        unsubscribeCategories = onSnapshot(q, (categorySnapshot) => {
            localCategoriesCache = categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderCategoryDropdown(localCategoriesCache);
            renderCategoryManager(localCategoriesCache);
            loadTasks(false); 
        }, (error) => {
            console.error("Error loading categories:", error);
            showFeedback("Error: Could not load task lists.", true);
        });
    } catch (error) {
        console.error("FATAL ERROR during initial category load:", error);
        showFeedback("FATAL: Could not access task system.", true);
    }
}

function renderCategoryDropdown(categories) {
    if (!uiElements.categorySelect) return;
    const selectedValue = uiElements.categorySelect.value;
    uiElements.categorySelect.innerHTML = '<option value="all">All Tasks</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = escapeHTML(cat.name);
        uiElements.categorySelect.appendChild(option);
    });
    if (categories.find(c => c.id === selectedValue)) {
        uiElements.categorySelect.value = selectedValue;
    } else {
        uiElements.categorySelect.value = 'all';
        currentCategory = 'all'; 
    }
}

export function handleCategoryChange(newCategory) {
    currentCategory = newCategory;
    loadTasks(isGuestMode());
}

/**
 * Loads tasks from Firestore or guest data based on mode.
 * @param {boolean} isGuest - True if loading for a guest.
 */
export function loadTasks(isGuest) {
    if (unsubscribeTasks) unsubscribeTasks();
    if (!uiElements.taskList) return;
    uiElements.taskList.innerHTML = `<p class="text-center p-2 opacity-70">Querying tasks...</p>`;

    if (isGuest) {
        const guestTasks = getGuestTasks(); 
        uiElements.taskList.innerHTML = guestTasks.length === 0 ? `<p class="text-center p-2 opacity-70">No active tasks in this list.</p>` : "";
        guestTasks.forEach(task => renderTaskDOM(task, true));
    } else {
        if (!tasksCollectionRef) {
            uiElements.taskList.innerHTML = `<p class="text-center p-2 opacity-70">Task system not available.</p>`;
            return;
        }
        let q;
        if (currentCategory === "all") {
            q = query(tasksCollectionRef, orderBy("isPriority", "desc"), orderBy("createdAt", "desc"));
        } else {
            q = query(tasksCollectionRef, where("category", "==", currentCategory), orderBy("isPriority", "desc"), orderBy("createdAt", "desc"));
        }

        unsubscribeTasks = onSnapshot(q, (snapshot) => {
            uiElements.taskList.innerHTML = snapshot.empty ? `<p class="text-center p-2 opacity-70">No active tasks in this list.</p>` : "";
            snapshot.forEach(doc => renderTaskDOM({ id: doc.id, ...doc.data() }, false));
        }, (error) => {
            console.error("Task loading error:", error);
            uiElements.taskList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500">Error loading tasks. A database index might be required. See console (F12) for details.</p>`;
        });
    }
}

/**
 * Adds a new task.
 */
export async function addTask() {
    if (!uiElements.taskInput || !uiElements.categorySelect) return;
    const taskText = uiElements.taskInput.value.trim();
    if (taskText === "") {
        if (!isGuestMode()) showFeedback("Task cannot be empty.", true);
        return;
    }

    if (isGuestMode()) {
        addGuestTask(taskText); 
        loadTasks(true); 
        uiElements.taskInput.value = "";
        showFeedback("Task added to local storage.");
    } else {
        if (currentCategory === "all" && uiElements.categorySelect.value === "all") { 
            showFeedback("Please select a specific list to add tasks to.", true);
            return;
        }
        const categoryToAddTaskTo = uiElements.categorySelect.value === "all" ? localCategoriesCache.find(c => c.name === "Default")?.id : uiElements.categorySelect.value;
        if (!categoryToAddTaskTo) {
             showFeedback("No valid list selected or 'Default' list not found.", true);
             return;
        }

        try {
            await addDoc(tasksCollectionRef, {
                text: taskText,
                completed: false,
                isPriority: false,
                createdAt: serverTimestamp(),
                category: categoryToAddTaskTo
            });
            uiElements.taskInput.value = "";
        } catch (error) {
            console.error("Error adding task: ", error);
            showFeedback("Error: Could not add task.", true);
        }
    }
}

/**
 * Renders a single task item in the DOM.
 * @param {object} task - The task object.
 * @param {boolean} isGuest - True if the task is for a guest.
 */
function renderTaskDOM(task, isGuest) {
    if (!uiElements.taskList) return;
    const item = document.createElement('div');
    item.className = `task-item-90s ${task.completed ? 'completed' : ''}`;
    item.innerHTML = `<div class="task-status"></div><p class="task-text">${escapeHTML(task.text)}</p><span class="priority-toggle ${task.isPriority ? 'active' : ''}">&#9733;</span><button class="delete-btn-90s">[DEL]</button>`;

    item.querySelector('.task-status').addEventListener('click', () => {
        if (isGuest) {
            updateGuestTaskCompletion(task.id, !task.completed);
            loadTasks(true); 
        } else {
            updateDoc(doc(db, `users/${getAuthUserId()}/tasks`, task.id), { completed: !task.completed });
        }
    });

    item.querySelector('.priority-toggle').addEventListener('click', () => {
        if (isGuest) {
            updateGuestTaskPriority(task.id, !task.isPriority);
            loadTasks(true); 
        } else {
            updateDoc(doc(db, `users/${getAuthUserId()}/tasks`, task.id), { isPriority: !task.isPriority });
        }
    });

    item.querySelector('.delete-btn-90s').addEventListener('click', () => {
        // playSound('clickSound'); // Removed
        if (isGuest) {
            deleteGuestTask(task.id);
            loadTasks(true); 
        } else {
            deleteDoc(doc(db, `users/${getAuthUserId()}/tasks`, task.id));
        }
    });
    uiElements.taskList.appendChild(item);
}


// --- Category Management ---
function renderCategoryManager(categories) {
    if (!uiElements.categoryList) return;
    uiElements.categoryList.innerHTML = '';
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
        uiElements.categoryList.appendChild(item);
    });
}

export async function addCategory() {
    if (!uiElements.newCategoryInput || !taskCategoriesCollectionRef) return;
    const categoryName = uiElements.newCategoryInput.value.trim();
    if (categoryName === "") {
        showFeedback("List name cannot be empty.", true);
        return;
    }
    if (localCategoriesCache.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
        showFeedback(`List "${escapeHTML(categoryName)}" already exists.`, true);
        return;
    }
    try {
        await addDoc(taskCategoriesCollectionRef, { name: categoryName, createdAt: serverTimestamp() });
        uiElements.newCategoryInput.value = "";
        showFeedback(`List "${escapeHTML(categoryName)}" added.`);
    } catch (error) {
        console.error("Error adding category:", error);
        showFeedback("Error adding list.", true);
    }
}

export async function deleteCategory(categoryId, categoryName) {
    if (!taskCategoriesCollectionRef) return;
    if (!confirm(`Delete the "${escapeHTML(categoryName)}" list? Tasks in this list will NOT be deleted but will become uncategorized if this is their only list.`)) return;
    try {
        await deleteDoc(doc(taskCategoriesCollectionRef, categoryId));
        showFeedback(`List "${escapeHTML(categoryName)}" deleted.`);
        if (currentCategory === categoryId) {
            handleCategoryChange('all');
            if (uiElements.categorySelect) uiElements.categorySelect.value = 'all';
        }
    } catch (error) {
        console.error("Error deleting category:", error);
        showFeedback("Error deleting list.", true);
    }
}

/**
 * Clears task-related data and unsubscribes from listeners.
 * Called on logout.
 */
export function clearTaskData() {
    if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    if (unsubscribeCategories) {
        unsubscribeCategories();
        unsubscribeCategories = null;
    }
    if (uiElements.taskList) uiElements.taskList.innerHTML = '';
    if (uiElements.categorySelect) uiElements.categorySelect.innerHTML = '<option value="all">All Tasks</option>';
    currentCategory = "all";
    localCategoriesCache = [];
    console.log("Task data cleared.");
}