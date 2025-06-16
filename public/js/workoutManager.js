// public/js/workoutManager.js
import { db, doc, setDoc, serverTimestamp, collection, query, orderBy, onSnapshot, deleteDoc } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { getTodayDocId, formatDisplayDate, escapeHTML } from './utils.js';
import { isGuestMode, getUserId } from './guestManager.js';
// import { playSound } from './soundManager.js';

let _hasWorkoutLoaded = false;
let workoutLogCollectionRef = null;
let unsubscribeHistory = null; // To manage the history listener

// --- Data Structure for Workouts ---
const WORKOUT_PLANS = {
    'leg-day': {
        title: "Leg Day",
        exercises: [
            { id: 'squat-machine', name: "Squat Machine", sets: "3", reps: "8-12", type: "weight" },
            { id: 'leg-press', name: "Leg Press", sets: "3", reps: "10-12", type: "weight" },
            { id: 'leg-curls', name: "Lying Leg Curls", sets: "3", reps: "10-15", type: "weight" },
            { id: 'leg-extensions', name: "Seated Leg Extensions", sets: "3", reps: "10-15", type: "weight" },
            { id: 'calf-raises', name: "Standing Calf Raises", sets: "3", reps: "12-15", type: "weight" }
        ]
    },
    'push-day': {
        title: "Push Day",
        exercises: [
            { id: 'db-press', name: "Dumbbell Chest Press", sets: "3", reps: "8-12", type: "weight" },
            { id: 'shoulder-press', name: "Seated Shoulder Press Machine", sets: "3", reps: "8-12", type: "weight" },
            { id: 'chest-fly', name: "Chest Fly Machine", sets: "3", reps: "10-15", type: "weight" },
            { id: 'tricep-ext', name: "Seated Tricep Extension Machine", sets: "3", reps: "10-15", type: "weight" },
            { id: 'dips', name: "Assisted Dips", sets: "3", reps: "to failure", type: "assistance" }
        ]
    },
    'pull-day': {
        title: "Pull Day",
        exercises: [
            { id: 'lat-pulldown', name: "Lat Pulldown", sets: "3", reps: "8-12", type: "weight" },
            { id: 'cable-row', name: "Seated Cable Row", sets: "3", reps: "8-12", type: "weight" },
            { id: 'pull-ups', name: "Assisted Pull-ups", sets: "3", reps: "to failure", type: "assistance" },
            { id: 'tbar-row', name: "T-Bar Row", sets: "3", reps: "8-10", type: "weight" },
            { id: 'bicep-curl', name: "Seated Bicep Curl Machine", sets: "3", reps: "10-15", type: "weight" }
        ]
    },
    'cardio-core': {
        title: "Cardio & Core",
        exercises: [
            { id: 'cardio', name: "Cardio of Choice", sets: "1", reps: "20-30 mins", type: "note" },
            { id: 'rotary-torso', name: "Rotary Torso Machine", sets: "3", reps: "15/side", type: "weight" },
            { id: 'ab-crunch', name: "Seated Ab Crunch Machine", sets: "3", reps: "15-20", type: "weight" },
            { id: 'plank', name: "Plank", sets: "3", reps: "to failure", type: "note" }
        ]
    },
    'full-body': {
        title: "Full Body Strength",
        exercises: [
            { id: 'upper-push', name: "Upper Body Push", sets: "3", reps: "8-12", type: "note" },
            { id: 'upper-pull', name: "Upper Body Pull", sets: "3", reps: "8-12", type: "note" },
            { id: 'lower-body', name: "Lower Body", sets: "3", reps: "8-12", type: "note" },
            { id: 'accessory', name: "Accessory of Choice", sets: "2", reps: "as needed", type: "note" }
        ]
    }
};

export function initializeWorkoutReferences(userId) {
    if (userId && !isGuestMode()) {
        const basePath = `users/${userId}/workoutLogs`;
        workoutLogCollectionRef = collection(db, basePath);
        listenForWorkoutHistory(); 
    } else {
        workoutLogCollectionRef = null;
        if (unsubscribeHistory) unsubscribeHistory();
    }
}

export function getHasWorkoutLoaded() {
    return _hasWorkoutLoaded;
}

export function loadWorkoutView() {
    if (!uiElements.workoutView) return;

    const selectorContainer = document.getElementById('workoutSelectorContainer');
    const displayContainer = document.getElementById('workoutDisplayContainer');

    selectorContainer.innerHTML = ''; 
    displayContainer.innerHTML = ''; 

    Object.keys(WORKOUT_PLANS).forEach(key => {
        const plan = WORKOUT_PLANS[key];
        const button = document.createElement('button');
        button.className = 'button-90s workout-select-btn w-full mb-2';
        button.textContent = plan.title;
        button.dataset.workoutKey = key;

        button.addEventListener('click', () => {
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
    selectorContainer.innerHTML = ''; 

    let workoutHTML = `<div class="workout-active-display" data-key="${workoutKey}" data-doc-id="${existingData ? existingData.id : ''}">`;
    workoutHTML += `<h3 class="text-2xl mb-4">${escapeHTML(plan.title)}</h3>`;

    plan.exercises.forEach(exercise => {
        const log = existingData ? existingData.exercises.find(e => e.id === exercise.id) : null;
        workoutHTML += `
            <div class="workout-exercise-item ${log?.isCompleted ? 'completed' : ''}" data-exercise-id="${exercise.id}">
                <div class="flex items-center">
                    <input type="checkbox" class="task-status-workout mr-3" ${log?.isCompleted ? 'checked' : ''}>
                    <span class="exercise-name">${escapeHTML(exercise.name)}</span>
                </div>
                <div class="exercise-details">
                    <span class="sets-reps">Sets: ${exercise.sets} | Reps: ${exercise.reps}</span>
                    ${createInputForExercise(exercise, log?.value)}
                </div>
            </div>`;
    });

    workoutHTML += `
        <div class="mt-6 flex gap-4">
            <button id="finishWorkoutBtn" class="button-90s">${existingData ? 'Update Workout' : 'Finish Workout'}</button>
            <button id="backToWorkoutSelectBtn" class="subtle-link-90s">Back to Selection</button>
        </div>
    </div>`;

    displayContainer.innerHTML = workoutHTML;
    
    document.getElementById('backToWorkoutSelectBtn').addEventListener('click', loadWorkoutView);
    document.getElementById('finishWorkoutBtn').addEventListener('click', saveWorkoutSession);
    document.querySelectorAll('.task-status-workout').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.target.closest('.workout-exercise-item').classList.toggle('completed', e.target.checked);
        });
    });
}

async function saveWorkoutSession() {
    if (isGuestMode()) {
        showFeedback("Workout logging is disabled in Guest Mode.", true);
        return;
    }

    const displayContainer = document.querySelector('.workout-active-display');
    if (!displayContainer) return;

    const workoutKey = displayContainer.dataset.key;
    const existingDocId = displayContainer.dataset.docId || getTodayDocId(); 
    const planTitle = WORKOUT_PLANS[workoutKey]?.title || "Unknown Workout";
    const exerciseItems = displayContainer.querySelectorAll('.workout-exercise-item');
    const loggedExercises = [];

    exerciseItems.forEach(item => {
        const id = item.dataset.exerciseId;
        const name = item.querySelector('.exercise-name').textContent;
        const isCompleted = item.querySelector('.task-status-workout').checked;
        const inputValue = item.querySelector('.exercise-input').value;
        loggedExercises.push({ id, name, isCompleted, value: inputValue });
    });
    
    const workoutData = {
        title: planTitle,
        workoutKey: workoutKey,
        completedAt: serverTimestamp(),
        exercises: loggedExercises
    };

    const docRef = doc(workoutLogCollectionRef, existingDocId);

    try {
        await setDoc(docRef, workoutData, { merge: true }); 
        showFeedback(`Workout for ${formatDisplayDate(existingDocId)} saved!`, false);
        loadWorkoutView(); 
    } catch (error) {
        console.error("Error saving workout session:", error);
        showFeedback("Failed to save workout session.", true);
    }
}

function createInputForExercise(exercise, value = '') {
    const valAttr = value ? `value="${escapeHTML(value)}"` : '';
    switch (exercise.type) {
        case 'weight':
            return `<input type="number" placeholder="Weight" class="input-90s exercise-input" ${valAttr}>`;
        case 'assistance':
            return `<input type="number" placeholder="Assist" class="input-90s exercise-input" ${valAttr}>`;
        case 'note':
        default:
            return `<input type="text" placeholder="Notes" class="input-90s exercise-input" ${valAttr}>`;
    }
}

// --- History Functions ---

function listenForWorkoutHistory() {
    if (unsubscribeHistory) unsubscribeHistory(); 
    if (!workoutLogCollectionRef) return;

    const q = query(workoutLogCollectionRef, orderBy("completedAt", "desc"));
    unsubscribeHistory = onSnapshot(q, (snapshot) => {
        const historyList = document.getElementById('workoutHistoryList');
        if (!historyList) return;
        
        historyList.innerHTML = ''; 
        if (snapshot.empty) {
            historyList.innerHTML = `<p class="text-center p-2 opacity-70">No saved workouts.</p>`;
        } else {
            snapshot.docs.forEach(doc => {
                renderWorkoutHistoryItem({ id: doc.id, ...doc.data() });
            });
        }
    }, (error) => {
        console.error("Error fetching workout history:", error);
        showFeedback("Could not load workout history.", true);
    });
}

function renderWorkoutHistoryItem(log) {
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
        contentDiv.innerHTML += `
            <div class="flex justify-between items-center py-1 text-sm ${ex.isCompleted ? '' : 'opacity-60'}">
                <span>${ex.isCompleted ? '✅' : '⬜'} ${escapeHTML(ex.name)}</span>
                <span class="text-dim">${escapeHTML(ex.value) || '-'}</span>
            </div>
        `;
    });

    const header = item.querySelector('.journal-day-header');
    header.addEventListener('click', (e) => {
        if (e.target.closest('.journal-control-btn')) return;
        // This is the correct, consistent way to handle it, assuming CSS is right.
        item.classList.toggle('expanded');
        const indicator = item.querySelector('.toggle-indicator');
        indicator.textContent = item.classList.contains('expanded') ? '[-]' : '[+]';
    });
    
    item.querySelector('.edit').addEventListener('click', () => {
        displayWorkout(log.workoutKey, log);
    });
    
    item.querySelector('.delete').addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete the workout for ${formatDisplayDate(log.id)}?`)) {
            try {
                await deleteDoc(doc(db, workoutLogCollectionRef.path, log.id));
                showFeedback("Workout deleted.", false);
            } catch (error) {
                showFeedback("Error deleting workout.", true);
                console.error("Error deleting workout:", error);
            }
        }
    });

    historyList.appendChild(item);
}


export function clearWorkoutData() {
    _hasWorkoutLoaded = false;
    if (unsubscribeHistory) unsubscribeHistory();

    const selectorContainer = document.getElementById('workoutSelectorContainer');
    const displayContainer = document.getElementById('workoutDisplayContainer');
    const historyList = document.getElementById('workoutHistoryList');
    
    if(selectorContainer) selectorContainer.innerHTML = '';
    if(displayContainer) displayContainer.innerHTML = '';
    if(historyList) historyList.innerHTML = '';

    console.log("Workout data cleared.");
}