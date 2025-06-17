// public/js/workoutManager.js
import { db, doc, setDoc, serverTimestamp, collection, query, orderBy, onSnapshot, deleteDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, escapeHTML } from './utils.js';
import { isGuestMode, getUserId, getGuestWorkoutLogs, saveGuestWorkoutLog as saveGuestWorkout, deleteGuestWorkoutLog as deleteGuestWorkout } from './guestManager.js';
// import { playSound } from './soundManager.js';

let _hasWorkoutLoaded = false;
let workoutLogCollectionRef = null;
let unsubscribeHistory = null; // To manage the history listener

// --- Data Structure for Workouts ---
const WORKOUT_PLANS = {
    'leg-day': {
        title: "Leg Day",
        preStretches: ["Leg Swings", "Walking High Knees", "Bodyweight Squats"],
        coolDownStretches: ["Standing Quad Stretch", "Seated Hamstring Stretch", "Standing Calf Stretch"],
        exercises: [
            { id: 'squat-machine', name: "Squat Machine", type: "weight", sets: [{ reps: "10", notes: "light weight" }, { reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] }, // Warm-up + 3 work sets
            { id: 'leg-press', name: "Leg Press", type: "weight", sets: [{ reps: "10-12" }, { reps: "10-12" }, { reps: "10-12" }] },
            { id: 'lying-leg-curls', name: "Lying Leg Curls", type: "weight", sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'seated-leg-extensions', name: "Seated Leg Extensions", type: "weight", sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'standing-calf-raises', name: "Standing Calf Raises", type: "weight", sets: [{ reps: "12-15" }, { reps: "12-15" }, { reps: "12-15" }] }
        ]
    },
    'push-day': {
        title: "Push Day",
        preStretches: ["Arm Circles", "Torso Twists", "Cat-Cow Stretch"],
        coolDownStretches: ["Doorway Chest Stretch", "Cross-Body Shoulder Stretch", "Overhead Tricep Stretch"],
        exercises: [
            { id: 'dumbbell-chest-press', name: "Dumbbell Chest Press", type: "weight", sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'seated-shoulder-press-machine', name: "Seated Shoulder Press Machine", type: "weight", sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'chest-fly-machine', name: "Chest Fly Machine", type: "weight", sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'seated-tricep-extension-machine', name: "Seated Tricep Extension Machine", type: "weight", sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] },
            { id: 'assisted-dips', name: "Assisted Dips", type: "assistance", sets: [{ reps: "to failure" }, { reps: "to failure" }, { reps: "to failure" }] }
        ]
    },
    'pull-day': {
        title: "Pull Day",
        preStretches: ["Band Pull-Aparts", "Scapular Retractions", "Arm Swings"],
        coolDownStretches: ["Lat Stretch", "Bicep Wall Stretch"],
        exercises: [
            { id: 'lat-pulldown', name: "Lat Pulldown", type: "weight", sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'seated-cable-row', name: "Seated Cable Row", type: "weight", sets: [{ reps: "8-12" }, { reps: "8-12" }, { reps: "8-12" }] },
            { id: 'assisted-pull-ups', name: "Assisted Pull-ups", type: "assistance", sets: [{ reps: "to failure" }, { reps: "to failure" }, { reps: "to failure" }] },
            { id: 't-bar-row', name: "T-Bar Row", type: "weight", sets: [{ reps: "8-10" }, { reps: "8-10" }, { reps: "8-10" }] },
            { id: 'seated-bicep-curl-machine', name: "Seated Bicep Curl Machine", type: "weight", sets: [{ reps: "10-15" }, { reps: "10-15" }, { reps: "10-15" }] }
        ]
    },
    'cardio-core': {
        title: "Cardio & Core",
        preStretches: ["Leg Swings", "Torso Twists", "Arm Circles"],
        coolDownStretches: ["Knee to Chest Stretch", "Cobra Stretch"],
        exercises: [
            { id: 'cardio-choice', name: "Cardio of Choice", type: "note", sets: [{ notes: "20-30 mins" }] }, // Changed reps to notes
            { id: 'rotary-torso-machine', name: "Rotary Torso Machine", type: "weight", sets: [{ reps: "15/side" }, { reps: "15/side" }, { reps: "15/side" }] },
            { id: 'seated-ab-crunch-machine', name: "Seated Ab Crunch Machine", type: "weight", sets: [{ reps: "15-20" }, { reps: "15-20" }, { reps: "15-20" }] },
            { id: 'plank', name: "Plank", type: "note", sets: [{ notes: "to failure" }, { notes: "to failure" }, { notes: "to failure" }] } // Changed reps to notes
        ]
    },
    'full-body': {
        title: "Full Body Strength",
        preStretches: ["Bodyweight Squats", "Arm Circles", "Leg Swings"],
        coolDownStretches: ["Light, full-body stretch"],
        exercises: [
            { id: 'upper-body-push', name: "Upper Body Push", type: "note", sets: [{ notes: "8-12 reps" }, { notes: "8-12 reps" }, { notes: "8-12 reps" }] },
            { id: 'upper-body-pull', name: "Upper Body Pull", type: "note", sets: [{ notes: "8-12 reps" }, { notes: "8-12 reps" }, { notes: "8-12 reps" }] },
            { id: 'lower-body', name: "Lower Body", type: "note", sets: [{ notes: "8-12 reps" }, { notes: "8-12 reps" }, { notes: "8-12 reps" }] },
            { id: 'accessory', name: "Accessory", type: "note", sets: [{ notes: "as needed" }, { notes: "as needed" }] }
        ]
    }
};

export function initializeWorkoutReferences(userId) {
    if (isGuestMode()) {
        // No Firestore collection for guests, just ensure previous listener is off
        workoutLogCollectionRef = null;
        if (unsubscribeHistory) unsubscribeHistory();
        listenForWorkoutHistory(true); // Listen for guest workouts
    } else if (userId) {
        // Authenticated user: set up Firestore reference
        const basePath = `users/${userId}/workoutLogs`;
        workoutLogCollectionRef = collection(db, basePath);
        listenForWorkoutHistory(false); // Listen for Firestore workouts
    } else {
        // No user, no guest mode: clear everything
        workoutLogCollectionRef = null;
        if (unsubscribeHistory) unsubscribeHistory();
        clearWorkoutData(); // Clear UI if no user is active
    }
}

export function getHasWorkoutLoaded() {
    return _hasWorkoutLoaded;
}

export function loadWorkoutView() {
    if (!uiElements.workoutView) return;

    const selectorContainer = document.getElementById('workoutSelectorContainer');
    const displayContainer = document.getElementById('workoutDisplayContainer');

    selectorContainer.innerHTML = ''; // Always clear selection buttons on load
    displayContainer.innerHTML = '<p class="text-center p-2 opacity-70">What would you like to workout Today?.</p>'; // Initial message

    Object.keys(WORKOUT_PLANS).forEach(key => {
        const plan = WORKOUT_PLANS[key];
        const button = document.createElement('button');
        button.className = 'button-90s workout-select-btn w-full mb-2';
        button.textContent = plan.title;
        button.dataset.workoutKey = key;

        button.addEventListener('click', () => {
            // playSound('clickSound'); // Re-enable if sound manager is imported
            displayWorkout(key);
        });

        selectorContainer.appendChild(button);
    });

    _hasWorkoutLoaded = true;
}

function displayWorkout(workoutKey, existingData = null) {
    const plan = WORKOUT_PLANS[workoutKey];
    if (!plan) return;

    const selectorContainer = document.getElementById('workoutSelectorContainer');
    const displayContainer = document.getElementById('workoutDisplayContainer');
    selectorContainer.innerHTML = ''; // Clear workout selection buttons

    // Build the workout active display HTML
    let workoutHTML = `
        <div class="workout-active-display" data-key="${workoutKey}" data-doc-id="${existingData ? existingData.id : ''}">
            <h3 class="text-2xl mb-4">${escapeHTML(plan.title)}</h3>
            ${plan.preStretches && plan.preStretches.length > 0 ?
                `<h4 class="stretches-header">Pre-Workout Stretches:</h4><ul class="stretches-list">${plan.preStretches.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>` : ''
            }
            <div id="exercisesContainer"></div>
            ${plan.coolDownStretches && plan.coolDownStretches.length > 0 ?
                `<h4 class="stretches-header mt-6">Cool-down Stretches:</h4><ul class="stretches-list">${plan.coolDownStretches.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul>` : ''
            }
            <h3 class="mt-6">Workout Notes</h3>
            <textarea id="workoutNotesInput" placeholder="Add any notes about this workout session..." class="input-90s journal-textarea"></textarea>

            <div class="mt-6 flex gap-4">
                <button id="finishWorkoutBtn" class="button-90s">${existingData ? 'Update Workout' : 'Finish Workout'}</button>
                <button id="backToWorkoutSelectBtn" class="subtle-link-90s">Back to Selection</button>
            </div>
        </div>
    `;
    displayContainer.innerHTML = workoutHTML; // Set the HTML

    // After setting innerHTML, get the live reference to the notes input
    const workoutNotesInput = document.getElementById('workoutNotesInput');

    // Populate exercises dynamically into the #exercisesContainer
    const exercisesContainer = displayContainer.querySelector('#exercisesContainer');
    plan.exercises.forEach(exercise => {
        const currentExerciseSets = existingData && existingData.exercises.find(e => e.id === exercise.id)
                                    ? existingData.exercises.find(e => e.id === exercise.id).sets
                                    : exercise.sets; // Use pre-defined sets as default for new workouts

        const loggedExercise = existingData ? existingData.exercises.find(e => e.id === exercise.id) : null;
        let exerciseHtml = `
            <div class="workout-exercise-item ${loggedExercise?.isCompleted ? 'completed' : ''}" data-exercise-id="${exercise.id}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <input type="checkbox" class="task-status-workout mr-3" ${loggedExercise?.isCompleted ? 'checked' : ''}>
                        <span class="exercise-name">${escapeHTML(exercise.name)}</span>
                    </div>
                    <span class="exercise-expected-reps text-dim">${exercise.sets.map(s => s.reps || s.notes).join('/')}</span>
                </div>
                <div class="exercise-sets-container">
                    ${createInputsForSets(exercise.id, workoutKey, currentExerciseSets)}
                </div>
                <button class="button-90s add-set-btn" data-exercise-id="${exercise.id}">Add Set</button>
            </div>`;
        exercisesContainer.insertAdjacentHTML('beforeend', exerciseHtml);
    });


    // Set workout notes if existing data is present, using the live reference
    if (existingData && existingData.notes && workoutNotesInput) {
        workoutNotesInput.value = existingData.notes;
    } else if (workoutNotesInput) {
        workoutNotesInput.value = ''; // Clear notes for new workout
    }

    document.getElementById('backToWorkoutSelectBtn').addEventListener('click', loadWorkoutView);
    document.getElementById('finishWorkoutBtn').addEventListener('click', saveWorkoutSession);
    document.querySelectorAll('.task-status-workout').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.target.closest('.workout-exercise-item').classList.toggle('completed', e.target.checked);
        });
    });

    setupSetManipulationListeners(workoutKey); // Setup listeners for dynamic sets
}

// Helper to get the exercise type from WORKOUT_PLANS
function getExerciseType(workoutKey, exerciseId) {
    const plan = WORKOUT_PLANS[workoutKey];
    if (!plan) return null;
    const exercise = plan.exercises.find(ex => ex.id === exerciseId);
    return exercise ? exercise.type : null;
}

// New helper function to create inputs for multiple sets
// exerciseId and workoutKey are passed to determine the type when adding new sets
function createInputsForSets(exerciseId, workoutKey, setsData = []) {
    let inputsHtml = '';
    const exerciseType = getExerciseType(workoutKey, exerciseId);

    setsData.forEach((setDef, index) => {
        inputsHtml += `
            <div class="exercise-set-row" data-set-index="${index}">
                <span class="set-label">Set ${index + 1}:</span>`;
        if (exerciseType === 'weight' || exerciseType === 'assistance') {
            inputsHtml += `
                <input type="number" placeholder="Weight" class="input-90s exercise-weight-input" value="${escapeHTML(setDef.weight || '')}">
                <input type="number" placeholder="Reps" class="input-90s exercise-reps-input" value="${escapeHTML(setDef.reps || '')}">`;
        } else if (exerciseType === 'note') {
            inputsHtml += `
                <input type="text" placeholder="Notes" class="input-90s exercise-notes-input" value="${escapeHTML(setDef.notes || '')}">`;
        }
        // Only allow deleting sets if there's more than one set
        if (setsData.length > 1) {
            inputsHtml += `<button class="button-90s delete-set-btn">[X]</button>`;
        }
        inputsHtml += `</div>`;
    });
    return inputsHtml;
}

// New function to add a set
function addSet(event) {
    const addBtn = event.target;
    const exerciseItem = addBtn.closest('.workout-exercise-item');
    const exerciseSetsContainer = exerciseItem.querySelector('.exercise-sets-container');
    const exerciseId = exerciseItem.dataset.exerciseId;
    const workoutKey = document.querySelector('.workout-active-display').dataset.key; // Get active workout key

    const currentSetsCount = exerciseSetsContainer.querySelectorAll('.exercise-set-row').length;
    const exerciseType = getExerciseType(workoutKey, exerciseId);

    if (exerciseType === null) {
        showFeedback("Error: Could not determine exercise type for adding set.", true);
        return;
    }

    let newSetHtml = `
        <div class="exercise-set-row" data-set-index="${currentSetsCount}">
            <span class="set-label">Set ${currentSetsCount + 1}:</span>`;
    if (exerciseType === 'weight' || exerciseType === 'assistance') {
        newSetHtml += `
            <input type="number" placeholder="Weight" class="input-90s exercise-weight-input">
            <input type="number" placeholder="Reps" class="input-90s exercise-reps-input">`;
    } else if (exerciseType === 'note') {
        newSetHtml += `
            <input type="text" placeholder="Notes" class="input-90s exercise-notes-input">`;
    }
    newSetHtml += `<button class="button-90s delete-set-btn">[X]</button></div>`;

    exerciseSetsContainer.insertAdjacentHTML('beforeend', newSetHtml);

    // Re-attach delete listeners as new button was added
    exerciseSetsContainer.lastElementChild.querySelector('.delete-set-btn')
        .addEventListener('click', deleteSet);

    // Ensure all delete buttons are shown/hidden correctly if set count changes
    updateDeleteButtonsVisibility(exerciseSetsContainer);
}

// New function to delete a set
function deleteSet(event) {
    const deleteBtn = event.target;
    const setRow = deleteBtn.closest('.exercise-set-row');
    const exerciseSetsContainer = setRow.closest('.exercise-sets-container');

    if (!exerciseSetsContainer) return;

    // Only allow deleting if there's more than one set
    if (exerciseSetsContainer.querySelectorAll('.exercise-set-row').length > 1) {
        setRow.remove();
        // Re-index set labels if needed (optional, but good for UI clarity)
        exerciseSetsContainer.querySelectorAll('.exercise-set-row').forEach((row, index) => {
            row.querySelector('.set-label').textContent = `Set ${index + 1}:`;
            row.dataset.setIndex = index; // Update data-set-index
        });
    } else {
        showFeedback("Cannot delete the last set. Add a new set first if you wish to replace it.", true);
    }
     // Ensure all delete buttons are shown/hidden correctly if set count changes
     updateDeleteButtonsVisibility(exerciseSetsContainer);
}

// Manages visibility of delete buttons based on the number of sets
function updateDeleteButtonsVisibility(exerciseSetsContainer) {
    const currentSetRows = exerciseSetsContainer.querySelectorAll('.exercise-set-row');
    if (currentSetRows.length <= 1) {
        currentSetRows.forEach(row => {
            const deleteBtn = row.querySelector('.delete-set-btn');
            if (deleteBtn) deleteBtn.classList.add('hidden');
        });
    } else {
        currentSetRows.forEach(row => {
            const deleteBtn = row.querySelector('.delete-set-btn');
            if (deleteBtn) deleteBtn.classList.remove('hidden');
        });
    }
}


// New function to set up event listeners for dynamically added set buttons
function setupSetManipulationListeners(workoutKey) {
    document.querySelectorAll('.add-set-btn').forEach(button => {
        button.addEventListener('click', addSet);
    });
    document.querySelectorAll('.delete-set-btn').forEach(button => {
        button.addEventListener('click', deleteSet);
    });
    // Ensure initial state of delete buttons is correct
    document.querySelectorAll('.exercise-sets-container').forEach(container => {
        updateDeleteButtonsVisibility(container);
    });
}


async function saveWorkoutSession() {
    const displayContainer = document.querySelector('.workout-active-display');
    if (!displayContainer) return;

    const workoutKey = displayContainer.dataset.key;
    const existingDocId = displayContainer.dataset.docId || getTodayDocId();
    const planTitle = WORKOUT_PLANS[workoutKey]?.title || "Unknown Workout";
    const exerciseItems = displayContainer.querySelectorAll('.workout-exercise-item');

    // Get live reference to workoutNotesInput
    const workoutNotesInput = document.getElementById('workoutNotesInput');
    const workoutNotes = workoutNotesInput ? workoutNotesInput.value.trim() : '';

    const loggedExercises = [];

    exerciseItems.forEach(item => {
        const id = item.dataset.exerciseId;
        const name = item.querySelector('.exercise-name').textContent;
        const isCompleted = item.querySelector('.task-status-workout').checked;

        const exerciseType = getExerciseType(workoutKey, id);
        const setsData = [];

        item.querySelectorAll('.exercise-set-row').forEach(setRow => {
            if (exerciseType === 'weight' || exerciseType === 'assistance') {
                const weightInput = setRow.querySelector('.exercise-weight-input');
                const repsInput = setRow.querySelector('.exercise-reps-input');
                setsData.push({
                    weight: weightInput ? weightInput.value : '',
                    reps: repsInput ? repsInput.value : ''
                });
            } else if (exerciseType === 'note') {
                const notesInput = setRow.querySelector('.exercise-notes-input');
                setsData.push({
                    notes: notesInput ? notesInput.value : ''
                });
            }
        });

        loggedExercises.push({ id, name, isCompleted, sets: setsData });
    });

    const workoutData = {
        id: existingDocId, // Ensure ID is part of data for guest saving
        title: planTitle,
        workoutKey: workoutKey,
        completedAt: new Date().toISOString(), // Use ISO string for guest saving consistency
        exercises: loggedExercises,
        notes: workoutNotes // Save workout notes
    };

    if (isGuestMode()) {
        saveGuestWorkout(workoutData);
        showFeedback(`Workout for ${formatDisplayDate(existingDocId)} saved to local storage!`, false);
        loadWorkoutView(); // Re-load the workout selection view
    } else {
        // For authenticated users, use Firestore serverTimestamp
        workoutData.completedAt = serverTimestamp(); // Revert to serverTimestamp for Firestore
        const docRef = doc(workoutLogCollectionRef, existingDocId);
        try {
            await setDoc(docRef, workoutData, { merge: true });
            showFeedback(`Workout for ${formatDisplayDate(existingDocId)} saved!`, false);
            loadWorkoutView(); // Re-load the workout selection view
        } catch (error) {
            console.error("Error saving workout session:", error);
            showFeedback("Failed to save workout session.", true);
        }
    }
}


// --- History Functions ---

// isGuest parameter to fetch from local storage or Firestore
function listenForWorkoutHistory(isGuest) {
    if (unsubscribeHistory) unsubscribeHistory(); // Unsubscribe from any active listener

    const historyList = document.getElementById('workoutHistoryList');
    if (!historyList) return;

    historyList.innerHTML = ''; // Clear history list immediately

    if (isGuest) {
        const guestWorkouts = getGuestWorkoutLogs();
        if (guestWorkouts.length === 0) {
            historyList.innerHTML = `<p class="text-center p-2 opacity-70">No saved workouts in guest mode.</p>`;
        } else {
            guestWorkouts.forEach(log => {
                renderWorkoutHistoryItem(log, true); // Pass true for isGuest
            });
        }
    } else {
        // Authenticated user (Firestore)
        if (!workoutLogCollectionRef) {
            historyList.innerHTML = `<p class="text-center p-2 opacity-70">Workout history not available.</p>`;
            return;
        }
        const q = query(workoutLogCollectionRef, orderBy("completedAt", "desc"));
        unsubscribeHistory = onSnapshot(q, (snapshot) => {
            historyList.innerHTML = ''; // Clear and re-render on snapshot changes
            if (snapshot.empty) {
                historyList.innerHTML = `<p class="text-center p-2 opacity-70">No saved workouts.</p>`;
            } else {
                snapshot.docs.forEach(doc => {
                    renderWorkoutHistoryItem({ id: doc.id, ...doc.data() }, false); // Pass false for isGuest
                });
            }
        }, (error) => {
            console.error("Error fetching workout history:", error);
            showFeedback("Could not load workout history.", true);
        });
    }
}

// renderWorkoutHistoryItem now accepts an isGuest parameter to control button visibility
function renderWorkoutHistoryItem(log, isGuest) {
    const historyList = document.getElementById('workoutHistoryList');
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

    const contentDiv = item.querySelector('.journal-day-content');
    log.exercises.forEach(ex => {
        let exerciseDetailsHtml = `
            <div class="exercise-history-item ${ex.isCompleted ? 'completed' : ''}">
                <span class="exercise-history-name">${ex.isCompleted ? '✅' : '⬜'} ${escapeHTML(ex.name)}</span>
                <div class="exercise-history-sets">`;

        if (ex.sets && ex.sets.length > 0) {
            ex.sets.forEach((set, index) => {
                if (set.weight && set.reps) {
                    exerciseDetailsHtml += `<span>Set ${index + 1}: ${escapeHTML(set.weight)}kg x ${escapeHTML(set.reps)} reps</span>`;
                } else if (set.notes) {
                    exerciseDetailsHtml += `<span>Set ${index + 1}: ${escapeHTML(set.notes)}</span>`;
                } else if (set.reps) { // Fallback for assistance or bodyweight where only reps might be tracked in simplified form
                    exerciseDetailsHtml += `<span>Set ${index + 1}: ${escapeHTML(set.reps)} reps</span>`;
                } else { // Handle empty sets or incomplete data gracefully
                    exerciseDetailsHtml += `<span>Set ${index + 1}: -</span>`;
                }
            });
        } else {
            exerciseDetailsHtml += `<span>No sets logged</span>`;
        }
        exerciseDetailsHtml += `</div></div>`;
        contentDiv.innerHTML += exerciseDetailsHtml;
    });

    // Display overall workout notes
    if (log.notes) {
        contentDiv.innerHTML += `
            <div class="workout-history-notes mt-4">
                <h4 class="stretches-header">Notes:</h4>
                <p>${escapeHTML(log.notes)}</p>
            </div>
        `;
    }


    const header = item.querySelector('.journal-day-header');
    header.addEventListener('click', (e) => {
        if (e.target.closest('.journal-control-btn')) return;
        // playSound('clickSound'); // Re-enable if sound manager is imported
        item.classList.toggle('expanded');
        const indicator = item.querySelector('.toggle-indicator');
        indicator.textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
    });

    // Control visibility and functionality of edit/delete based on guest mode
    const editButton = item.querySelector('.edit');
    const deleteButton = item.querySelector('.delete');

    if (isGuest) {
        // For guest mode, edit button just displays the workout
        if (editButton) editButton.addEventListener('click', () => {
            // playSound('clickSound'); // Re-enable if sound manager is imported
            displayWorkout(log.workoutKey, log);
        });
        if (deleteButton) deleteButton.addEventListener('click', () => {
            // playSound('clickSound'); // Re-enable if sound manager is imported
            if (confirm(`Are you sure you want to delete the workout for ${formatDisplayDate(log.id)} from local storage?`)) {
                deleteGuestWorkout(log.id); // Call guest-specific delete
                listenForWorkoutHistory(true); // Re-render guest history
                showFeedback("Workout deleted from local storage.", false);
            }
        });
    } else {
        // For authenticated users, use Firestore operations
        if (editButton) editButton.addEventListener('click', () => {
            // playSound('clickSound'); // Re-enable if sound manager is imported
            displayWorkout(log.workoutKey, log);
        });
        if (deleteButton) deleteButton.addEventListener('click', async () => {
            // playSound('clickSound'); // Re-enable if sound manager is imported
            if (confirm(`Are you sure you want to delete the workout for ${formatDisplayDate(log.id)}?`)) {
                try {
                    await deleteDoc(doc(db, workoutLogCollectionRef.path, log.id));
                    showFeedback("Workout deleted.", false);
                }
                catch (error) {
                    showFeedback("Error deleting workout.", true);
                    console.error("Error deleting workout:", error);
                }
            }
        });
    }

    historyList.appendChild(item);
}


export function clearWorkoutData() {
    _hasWorkoutLoaded = false;
    if (unsubscribeHistory) unsubscribeHistory();

    const selectorContainer = document.getElementById('workoutSelectorContainer');
    const displayContainer = document.getElementById('workoutDisplayContainer');
    const historyList = document.getElementById('workoutHistoryList');

    if(selectorContainer) selectorContainer.innerHTML = '';
    if(displayContainer) {
        // Ensure the notes input is correctly rendered when cleared
        displayContainer.innerHTML = `<p class="text-center p-2 opacity-70">What would you like to workout Today?</p>`;
        // Clearing its value is now handled by displayWorkout when a workout is selected, or if loadWorkoutView is called.
    }
    if(historyList) historyList.innerHTML = '';

    // Clear guest workout data if applicable
    if (isGuestMode()) {
        const guestWorkouts = getGuestWorkoutLogs();
        if (guestWorkouts.length > 0) {
            guestWorkouts.forEach(log => deleteGuestWorkout(log.id)); // Clear all guest workouts
        }
    }

    console.log("Workout data cleared.");
}