// public/js/workoutManager.js
import { db, doc, setDoc, serverTimestamp, collection, query, orderBy, onSnapshot, deleteDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, escapeHTML, debounce } from './utils.js';
import { isGuestMode, getUserId, getGuestWorkoutLogs, saveGuestWorkoutLog as saveGuestWorkout, deleteGuestWorkoutLog as deleteGuestWorkout } from './guestManager.js';

let _hasWorkoutLoaded = false;
let workoutLogCollectionRef = null;
let unsubscribeHistory = null;

// --- DATA STRUCTURES ---

const EXERCISE_LIBRARY = {
    cardio: [
        { id: 'elliptical', name: 'Elliptical', type: 'cardio' },
        { id: 'stair-machine', name: 'Stair Machine', type: 'cardio' },
        { id: 'treadmill', name: 'Treadmill', type: 'cardio' },
        { id: 'bike', name: 'Bike', type: 'cardio' },
        { id: 'rowing-machine', name: 'Rowing Machine', type: 'cardio' },
        { id: 'sled-push', name: 'Sled Push/Pull', type: 'cardio' },
        { id: 'ski-erg', name: 'SkiErg', type: 'cardio' },
        { id: 'boxing', name: 'Boxing Bag', type: 'cardio' },
        { id: 'walking', name: 'Walking', type: 'cardio' } // Retain walking here for general cardio selection
    ],
    chest: [
        { id: 'dumbbell-chest-press', name: 'Dumbbell Chest Press', type: 'weight' },
        { id: 'chest-press-machine', name: 'Chest Press Machine (Guided)', type: 'weight' },
        { id: 'chest-fly-machine', name: 'Chest Fly Machine', type: 'weight' },
        { id: 'assisted-dips', name: 'Assisted Dips', type: 'weight' }
    ],
    back: [
        { id: 'lat-pulldown', name: 'Lat Pulldown', type: 'weight' },
        { id: 'seated-cable-row', name: 'Seated Cable Row', type: 'weight' },
        { id: 't-bar-row', name: 'T-Bar Row Machine', type: 'weight' },
        { id: 'reverse-fly', name: 'Reverse Fly', type: 'weight' },
        { id: 'assisted-pull-ups', name: 'Assisted Pull-ups', type: 'weight' }
    ],
    legs: [
        { id: 'leg-press', name: 'Leg Press', type: 'weight' },
        { id: 'squat-rack', name: 'Squat Rack', type: 'weight' },
        { id: 'seated-leg-extensions', name: 'Seated Leg Extensions', type: 'weight' },
        { id: 'lying-leg-curls', name: 'Lying Leg Curls', type: 'weight' },
        { id: 'standing-calf-raises', name: 'Standing Calf Raises', type: 'weight' }
    ],
    arms: [
        { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl', type: 'weight' },
        { id: 'seated-bicep-curl-machine', name: 'Seated Bicep Curl Machine', type: 'weight' },
        { id: 'seated-tricep-extension-machine', name: 'Seated Tricep Extension Machine', type: 'weight' },
        { id: 'rope-pulldown', name: 'Rope Pulldown', type: 'weight' }
    ],
    shoulders: [
        { id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', type: 'weight' },
        { id: 'dumbbell-front-raise', name: 'Dumbbell Front Raise', type: 'weight' },
        { id: 'seated-shoulder-press-machine', name: 'Seated Shoulder Press Machine', type: 'weight' }
    ],
    core: [
        { id: 'rotary-torso-machine', name: 'Rotary Torso Machine', type: 'weight' },
        { id: 'seated-ab-crunch-machine', name: 'Seated Ab Crunch Machine', type: 'weight' },
        { id: 'plank', name: 'Plank', type: 'bodyweight' }
    ]
};

const WORKOUT_PLANS = {
    'leg-day': {
        title: "Leg Day",
        preStretches: ["Leg Swings", "Walking High Knees", "Bodyweight Squats"],
        coolDownStretches: ["Standing Quad Stretch", "Seated Hamstring Stretch", "Standing Calf Stretch"],
        exercises: [
            { id: 'squat-rack', sets: [{ reps: "10", notes: "light weight" }, { reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'leg-press', sets: [{ reps: "10-12" }, { reps: "10-12" }, { reps: "10-12" }] },
            { id: 'lying-leg-curls', sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'seated-leg-extensions', sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'standing-calf-raises', sets: [{ reps: "12-15" }, { reps: "12-15" }, { reps: "12-15" }] }
        ]
    },
    'push-day': {
        title: "Push Day",
        preStretches: ["Arm Circles", "Torso Twists", "Cat-Cow Stretch"],
        coolDownStretches: ["Doorway Chest Stretch", "Cross-Body Shoulder Stretch", "Overhead Tricep Stretch"],
        exercises: [
            { id: 'dumbbell-chest-press', sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'seated-shoulder-press-machine', sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'chest-fly-machine', sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'seated-tricep-extension-machine', sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'assisted-dips', sets: [{ reps: "to failure" }, { reps: "to failure" }, { reps: "to failure" }] }
        ]
    },
    'pull-day': {
        title: "Pull Day",
        preStretches: ["Band Pull-Aparts", "Scapular Retractions", "Arm Swings"],
        coolDownStretches: ["Lat Stretch", "Bicep Wall Stretch"],
        exercises: [
            { id: 'lat-pulldown', sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'seated-cable-row', sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'assisted-pull-ups', sets: [{ reps: "to failure" }, { reps: "to failure" }, { reps: "to failure" }] },
            { id: 't-bar-row', sets: [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }] },
            { id: 'seated-bicep-curl-machine', sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] }
        ]
    },
    'cardio-core': {
        title: "Cardio & Core",
        preStretches: ["Leg Swings", "Torso Twists", "Arm Circles"],
        coolDownStretches: ["Knee to Chest Stretch", "Cobra Stretch"],
        exercises: [
            { id: 'treadmill', name: "Cardio of Choice", type: 'cardio', sets: [{ notes: "20-30 mins" }] },
            { id: 'rotary-torso-machine', sets: [{ reps: "15/side" }, { reps: "15/side" }, { reps: "15/side" }] },
            { id: 'seated-ab-crunch-machine', sets: [{ reps: "15-20" }, { reps: "15-20" }, { reps: "15-20" }] },
            { id: 'plank', name: "Plank", type: 'note', sets: [{ notes: "to failure" }, { notes: "to failure" }, { notes: "to failure" }] }
        ]
    },
    'full-body': {
        title: "Full Body Strength",
        preStretches: ["Bodyweight Squats", "Arm Circles", "Leg Swings"],
        coolDownStretches: ["Light, full-body stretch"],
        exercises: [
            { id: 'dumbbell-chest-press', name: "Upper Body Push (e.g., Chest Press)", type: 'note', sets: [{ notes: "3 sets of 8-12 reps" }] },
            { id: 'lat-pulldown', name: "Upper Body Pull (e.g., Lat Pulldown)", type: 'note', sets: [{ notes: "3 sets of 8-12 reps" }] },
            { id: 'leg-press', name: "Lower Body (e.g., Leg Press)", type: 'note', sets: [{ notes: "3 sets of 8-12 reps" }] },
            { id: 'dumbbell-bicep-curl', name: "Accessory (Your Choice)", type: 'note', sets: [{ notes: "2 sets" }] }
        ]
    },
    'walking-day': {
        title: "Walking Day",
        preStretches: ["Leg Swings", "Ankle Rotations"],
        coolDownStretches: ["Calf Stretch", "Hamstring Stretch"],
        exercises: [
            { id: 'walking', name: "Daily Walk", type: 'cardio', sets: [{ notes: "" }] } // MODIFIED: Changed notes to empty string
        ],
        notes: "" // MODIFIED: Changed notes to empty string
    }
};


export function initializeWorkoutReferences(userId) {
    if (isGuestMode()) {
        workoutLogCollectionRef = null;
        if (unsubscribeHistory) unsubscribeHistory();
        listenForWorkoutHistory(true);
    } else if (userId) {
        workoutLogCollectionRef = collection(db, `users/${userId}/workoutLogs`);
        listenForWorkoutHistory(false);
    } else {
        workoutLogCollectionRef = null;
        if (unsubscribeHistory) unsubscribeHistory();
        clearWorkoutData();
    }
}

export function getHasWorkoutLoaded() {
    return _hasWorkoutLoaded;
}

export function loadWorkoutView() {
    const { workoutSelectorContainer, workoutDisplayContainer } = uiElements;
    if (!workoutSelectorContainer || !workoutDisplayContainer) {
        console.error("Workout view containers not found in uiElements cache. Check uiManager.js and index.html");
        return;
    }

    workoutSelectorContainer.innerHTML = '';
    workoutDisplayContainer.innerHTML = '<p class="text-center p-2 opacity-70">Select a workout to begin.</p>';

    Object.keys(WORKOUT_PLANS).forEach(key => {
        const plan = WORKOUT_PLANS[key];
        const button = document.createElement('button');
        button.className = 'button-90s workout-select-btn w-full mb-2';
        button.textContent = plan.title;
        button.dataset.workoutKey = key;
        button.addEventListener('click', () => displayWorkout(key));
        workoutSelectorContainer.appendChild(button);
    });
    _hasWorkoutLoaded = true;
}

function displayWorkout(workoutKey, existingData = null) {
    const plan = WORKOUT_PLANS[workoutKey];
    if (!plan) return;

    const { workoutSelectorContainer, workoutDisplayContainer } = uiElements;
    if (!workoutSelectorContainer || !workoutDisplayContainer) return;

    workoutSelectorContainer.innerHTML = '';

    let exercisesToDisplay;
    if (existingData) {
        exercisesToDisplay = existingData.exercises;
    } else {
        exercisesToDisplay = plan.exercises.map(ex => {
            const libraryExercise = findExerciseInLibrary(ex.id) || { name: ex.name, type: ex.type || 'note' };
            return {
                id: ex.id,
                name: libraryExercise.name,
                type: libraryExercise.type,
                sets: ex.sets,
                isCompleted: false
            };
        });
    }

    const workoutHTML = `
        <div class="workout-active-display" data-key="${workoutKey}" data-doc-id="${existingData ? existingData.id : ''}">
            <h3 class="text-2xl mb-4">${escapeHTML(plan.title)}</h3>
            ${plan.preStretches ? `<h4 class="stretches-header">Pre-Workout Stretches</h4><ul class="stretches-list">${plan.preStretches.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>` : ''}
            <div id="exercisesContainer"></div>
            <div class="mt-4">
                <button id="showAddExerciseModalBtn" class="button-90s w-full">Add Exercise</button>
            </div>
             ${plan.coolDownStretches ? `<hr class="my-6 border-dashed border-border-color opacity-50"><h4 class="stretches-header">Cool-Down Stretches</h4><ul class="stretches-list">${plan.coolDownStretches.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>` : ''}
            <hr class="my-6 border-dashed border-border-color opacity-50">
            <h3 class="mt-6">Workout Notes</h3>
            <textarea id="workoutNotesInput" placeholder="Add any notes..." class="input-90s journal-textarea">${existingData?.notes || plan.notes || ''}</textarea>
            <div class="mt-6 flex gap-4">
                <button id="finishWorkoutBtn" class="button-90s">${existingData ? 'Update' : 'Finish'}</button>
                <button id="backToWorkoutSelectBtn" class="subtle-link-90s">Back</button>
            </div>
        </div>`;
    workoutDisplayContainer.innerHTML = workoutHTML;
    
    const exercisesContainer = document.getElementById('exercisesContainer');
    exercisesToDisplay.forEach(ex => {
        const exerciseEl = createExerciseElement(ex.id, ex.name, ex.type, ex.sets, ex.isCompleted);
        exercisesContainer.appendChild(exerciseEl);
    });

    setupDynamicListeners();
}

function setupDynamicListeners() {
    const backBtn = document.getElementById('backToWorkoutSelectBtn');
    const finishBtn = document.getElementById('finishWorkoutBtn');
    const showAddBtn = document.getElementById('showAddExerciseModalBtn');

    if (backBtn) backBtn.addEventListener('click', loadWorkoutView);
    if (finishBtn) finishBtn.addEventListener('click', saveWorkoutSession);
    if (showAddBtn) showAddBtn.addEventListener('click', openAddExerciseModal);

    document.querySelectorAll('.workout-exercise-item').forEach(item => {
        const checkbox = item.querySelector('.task-status-workout');
        if (checkbox) checkbox.addEventListener('change', (e) => e.target.closest('.workout-exercise-item').classList.toggle('completed', e.target.checked));
        
        const removeBtn = item.querySelector('.remove-exercise-btn');
        if (removeBtn) removeBtn.addEventListener('click', (e) => e.target.closest('.workout-exercise-item').remove());

        const addSetBtn = item.querySelector('.add-set-btn');
        if (addSetBtn) addSetBtn.addEventListener('click', addSet);
    });
}
function openAddExerciseModal() {
    const modal = document.getElementById('addExerciseModal');
    if (!modal) return;
    
    const categorySelect = document.getElementById('addExerciseCategorySelect');
    const searchInput = document.getElementById('exerciseSearchInput');
    
    categorySelect.value = 'all'; // Default to "All Categories"
    searchInput.value = '';

    categorySelect.onchange = populateExerciseList;
    searchInput.oninput = debounce(populateExerciseList, 250);
    document.getElementById('cancelAddExerciseBtn').onclick = closeAddExerciseModal;

    populateExerciseList();
    
    modal.classList.remove('hidden');
    modal.classList.add('modal-visible');
}

function closeAddExerciseModal() {
    const modal = document.getElementById('addExerciseModal');
    if (modal) {
        modal.classList.remove('modal-visible');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function populateExerciseList() {
    const category = document.getElementById('addExerciseCategorySelect').value;
    const searchTerm = document.getElementById('exerciseSearchInput').value.toLowerCase();
    const exerciseListContainer = document.getElementById('addSpecificExerciseList');
    
    exerciseListContainer.innerHTML = '';

    let exercisesToDisplay = [];
    if (category === 'all') {
        // Combine all exercises from all categories
        for (const catKey in EXERCISE_LIBRARY) {
            exercisesToDisplay = exercisesToDisplay.concat(EXERCISE_LIBRARY[catKey]);
        }
    } else {
        exercisesToDisplay = EXERCISE_LIBRARY[category] || [];
    }

    const filteredExercises = exercisesToDisplay.filter(ex => 
        ex.name.toLowerCase().includes(searchTerm)
    );

    if (filteredExercises.length === 0) {
        exerciseListContainer.innerHTML = `<p class="text-center p-4 opacity-70">No exercises found.</p>`;
        return;
    }
    
    // Sort alphabetically for consistency
    filteredExercises.sort((a, b) => a.name.localeCompare(b.name));

    filteredExercises.forEach(ex => {
        const item = document.createElement('div');
        item.className = 'exercise-list-item';
        item.textContent = ex.name;
        item.dataset.exerciseId = ex.id;
        item.addEventListener('click', () => confirmAddExercise(ex.id));
        exerciseListContainer.appendChild(item);
    });
}

function confirmAddExercise(exerciseId) {
    if (!exerciseId) return;
    
    const exercise = findExerciseInLibrary(exerciseId);
    if (!exercise) {
        showFeedback("Error finding selected exercise.", true);
        return;
    }

    const exercisesContainer = document.getElementById('exercisesContainer');
    const exerciseEl = createExerciseElement(exercise.id, exercise.name, exercise.type, [{ reps: '', weight: '', notes: '' }]);
    exercisesContainer.appendChild(exerciseEl);
    
    const removeBtn = exerciseEl.querySelector('.remove-exercise-btn');
    if (removeBtn) removeBtn.addEventListener('click', (e) => e.target.closest('.workout-exercise-item').remove());
    const addSetBtn = exerciseEl.querySelector('.add-set-btn');
    if (addSetBtn) addSetBtn.addEventListener('click', addSet);
    
    closeAddExerciseModal();
}

function createExerciseElement(id, name, type, sets = [], isCompleted = false) {
    const item = document.createElement('div');
    item.className = `workout-exercise-item ${isCompleted ? 'completed' : ''}`;
    item.dataset.exerciseId = id;
    item.dataset.exerciseType = type;

    item.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center">
                <input type="checkbox" class="task-status-workout mr-3" ${isCompleted ? 'checked' : ''}>
                <span class="exercise-name">${escapeHTML(name)}</span>
            </div>
            <button class="button-90s remove-exercise-btn">[X]</button>
        </div>
        <div class="exercise-sets-container">
            ${createInputsForSets(sets, type)}
        </div>
        <button class="button-90s add-set-btn">Add Set</button>
    `;
    return item;
}
function createInputsForSets(setsData, type) {
    let inputsHtml = '';
    setsData.forEach((setDef, index) => {
        inputsHtml += `<div class="exercise-set-row" data-set-index="${index}"><span class="set-label">Set ${index + 1}:</span>`;
        if (type === 'weight' || type === 'assistance' || type === 'bodyweight') {
            inputsHtml += `<input type="number" placeholder="Weight" class="input-90s exercise-weight-input" value="${escapeHTML(setDef.weight || '')}"><input type="number" placeholder="Reps" class="input-90s exercise-reps-input" value="${escapeHTML(setDef.reps || '')}">`;
        } else {
            inputsHtml += `<input type="text" placeholder="Notes (e.g., 20min)" class="input-90s exercise-notes-input" value="${escapeHTML(setDef.notes || '')}">`;
        }
        inputsHtml += `<button class="button-90s delete-set-btn">[X]</button></div>`;
    });
    return inputsHtml;
}
function addSet(event) {
    const exerciseItem = event.target.closest('.workout-exercise-item');
    const exerciseSetsContainer = exerciseItem.querySelector('.exercise-sets-container');
    const exerciseType = exerciseItem.dataset.exerciseType;
    const currentSetsCount = exerciseSetsContainer.querySelectorAll('.exercise-set-row').length;

    let newSetHtml = `<div class="exercise-set-row" data-set-index="${currentSetsCount}"><span class="set-label">Set ${currentSetsCount + 1}:</span>`;
    if (exerciseType === 'weight' || exerciseType === 'assistance' || type === 'bodyweight') {
        newSetHtml += `<input type="number" placeholder="Weight" class="input-90s exercise-weight-input"><input type="number" placeholder="Reps" class="input-90s exercise-reps-input">`;
    } else {
        newSetHtml += `<input type="text" placeholder="Notes" class="input-90s exercise-notes-input">`;
    }
    newSetHtml += `<button class="button-90s delete-set-btn">[X]</button></div>`;
    
    exerciseSetsContainer.insertAdjacentHTML('beforeend', newSetHtml);
    exerciseSetsContainer.lastElementChild.querySelector('.delete-set-btn').addEventListener('click', deleteSet);
}
function deleteSet(event) {
    event.target.closest('.exercise-set-row').remove();
}
async function saveWorkoutSession() {
    const displayContainer = document.querySelector('.workout-active-display');
    if (!displayContainer) return;

    const workoutKey = displayContainer.dataset.key;
    const existingDocId = displayContainer.dataset.docId || getTodayDocId();
    const planTitle = WORKOUT_PLANS[workoutKey]?.title || "Custom Workout";
    const workoutNotes = document.getElementById('workoutNotesInput').value.trim();

    const loggedExercises = [];
    document.querySelectorAll('.workout-exercise-item').forEach(item => {
        const setsData = [];
        item.querySelectorAll('.exercise-set-row').forEach(setRow => {
            const weight = setRow.querySelector('.exercise-weight-input')?.value || '';
            const reps = setRow.querySelector('.exercise-reps-input')?.value || '';
            const notes = setRow.querySelector('.exercise-notes-input')?.value || '';
            setsData.push({ weight, reps, notes });
        });
        loggedExercises.push({
            id: item.dataset.exerciseId, name: item.querySelector('.exercise-name').textContent,
            type: item.dataset.exerciseType, isCompleted: item.querySelector('.task-status-workout').checked,
            sets: setsData
        });
    });

    const workoutData = { id: existingDocId, title: planTitle, workoutKey, exercises: loggedExercises, notes: workoutNotes };

    if (isGuestMode()) {
        workoutData.completedAt = new Date().toISOString();
        saveGuestWorkout(workoutData);
        showFeedback(`Workout for ${formatDisplayDate(existingDocId)} saved locally!`, false);
    } else {
        workoutData.completedAt = serverTimestamp();
        const docRef = doc(workoutLogCollectionRef, existingDocId);
        try {
            await setDoc(docRef, workoutData, { merge: true });
            showFeedback(`Workout for ${formatDisplayDate(existingDocId)} saved!`, false);
        } catch (error) {
            console.error("Error saving workout session:", error);
            showFeedback("Failed to save workout session.", true);
        }
    }
    loadWorkoutView();
}
function listenForWorkoutHistory(isGuest) {
    if (unsubscribeHistory) unsubscribeHistory();
    const historyList = uiElements.workoutHistoryList;
    if (!historyList) return;
    historyList.innerHTML = '';

    if (isGuest) {
        const guestWorkouts = getGuestWorkoutLogs();
        if (guestWorkouts.length === 0) historyList.innerHTML = `<p class="text-center p-2 opacity-70">No saved workouts in guest mode.</p>`;
        else guestWorkouts.forEach(log => renderWorkoutHistoryItem(log, true));
    } else {
        if (!workoutLogCollectionRef) return;
        const q = query(workoutLogCollectionRef, orderBy("completedAt", "desc"));
        unsubscribeHistory = onSnapshot(q, (snapshot) => {
            historyList.innerHTML = '';
            if (snapshot.empty) historyList.innerHTML = `<p class="text-center p-2 opacity-70">No saved workouts.</p>`;
            else snapshot.docs.forEach(doc => renderWorkoutHistoryItem({ id: doc.id, ...doc.data() }, false));
        }, (error) => console.error("Error fetching workout history:", error));
    }
}
function renderWorkoutHistoryItem(log, isGuest) {
    const historyList = uiElements.workoutHistoryList;
    if (!historyList) return;

    const item = document.createElement('div');
    item.className = 'journal-day-entry border-b border-dashed border-border-color pb-4 mb-4';
    item.innerHTML = `
        <div class="journal-day-header">
            <p class="font-bold flex-grow"><span class="toggle-indicator mr-2">[+]</span>${formatDisplayDate(log.id)} - ${escapeHTML(log.title)}</p>
            <div class="journal-day-controls">
                <span class="journal-control-btn edit">[edit]</span>
                <span class="journal-control-btn delete">[delete]</span>
            </div>
        </div>
        <div class="journal-day-content hidden"></div>`;

    item.querySelector('.edit').addEventListener('click', () => displayWorkout(log.workoutKey, log));
    item.querySelector('.delete').addEventListener('click', async () => {
        if (confirm(`Delete workout from ${formatDisplayDate(log.id)}?`)) {
            if(isGuest) {
                deleteGuestWorkout(log.id);
                listenForWorkoutHistory(true);
            } else {
                await deleteDoc(doc(db, workoutLogCollectionRef.path, log.id));
            }
            showFeedback("Workout deleted.", false);
        }
    });

    const contentDiv = item.querySelector('.journal-day-content');
    log.exercises.forEach(ex => {
        let exerciseDetailsHtml = `<div class="exercise-history-item ${ex.isCompleted ? 'completed' : ''}"><span class="exercise-history-name">${ex.isCompleted ? '✅' : '⬜'} ${escapeHTML(ex.name)}</span><div class="exercise-history-sets">`;
        if (ex.sets && ex.sets.length > 0) ex.sets.forEach((set, i) => {
            if (set.weight && set.reps) exerciseDetailsHtml += `<span>Set ${i + 1}: ${escapeHTML(set.weight)}kg x ${escapeHTML(set.reps)} reps</span>`;
            else if (set.notes) exerciseDetailsHtml += `<span>Set ${i + 1}: ${escapeHTML(set.notes)}</span>`;
            else if (set.reps) exerciseDetailsHtml += `<span>Set ${i + 1}: ${escapeHTML(set.reps)} reps</span>`;
            else exerciseDetailsHtml += `<span>Set ${i + 1}: -</span>`;
        });
        else exerciseDetailsHtml += `<span>No sets logged</span>`;
        exerciseDetailsHtml += `</div></div>`;
        contentDiv.innerHTML += exerciseDetailsHtml;
    });
    if (log.notes) contentDiv.innerHTML += `<div class="workout-history-notes mt-4"><h4>Notes:</h4><p>${escapeHTML(log.notes)}</p></div>`;

    item.querySelector('.journal-day-header').addEventListener('click', (e) => {
        if (e.target.closest('.journal-control-btn')) return;
        item.classList.toggle('expanded');
        item.querySelector('.toggle-indicator').textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
    });
    historyList.appendChild(item);
}
function findExerciseInLibrary(exerciseId) {
    for (const category in EXERCISE_LIBRARY) {
        const found = EXERCISE_LIBRARY[category].find(ex => ex.id === exerciseId);
        if (found) return found;
    }
    return null;
}
function clearWorkoutData() {
    _hasWorkoutLoaded = false;
    if (unsubscribeHistory) unsubscribeHistory();
    const { workoutSelectorContainer, workoutDisplayContainer, workoutHistoryList } = uiElements;
    if(workoutSelectorContainer) workoutSelectorContainer.innerHTML = '';
    if(workoutDisplayContainer) workoutDisplayContainer.innerHTML = '';
    if(workoutHistoryList) workoutHistoryList.innerHTML = '';
    console.log("Workout data cleared.");
}