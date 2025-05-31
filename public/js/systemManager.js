// public/js/systemManager.js
import { uiElements, initializeAppearanceControls as initAppearance, getCurrentDesign as getUIDesign, typewriterScrambleEffect, showFeedback } from './uiManager.js';
import { getAllJournalMetadataForUser } from './journalManager.js';
import { playSound } from './soundManager.js';
import { isGuestMode } from './guestManager.js';
import { toYMDString, formatDisplayDate } from './utils.js';

const HEATMAP_DAYS = 90;
let kaleidoscopeSketch = null;
let _hasSystemDataLoaded = false;
let p5Instance = null;

export function initializeSystemPanel(onDesignChangeCallback) {
    initAppearance(onDesignChangeCallback);

    if (uiElements.launchKaleidoscopeBtn) {
        uiElements.launchKaleidoscopeBtn.addEventListener('click', () => {
            playSound('clickSound');
            startKaleidoscope();
        });
    }
    if (uiElements.closeKaleidoscopeBtn) {
        uiElements.closeKaleidoscopeBtn.addEventListener('click', () => {
            playSound('clickSound');
            stopKaleidoscope();
        });
    }
    if (uiElements.kClearBtn) {
        uiElements.kClearBtn.addEventListener('click', () => {
            playSound('clickSound');
            if (p5Instance && p5Instance.clearCanvas) {
                p5Instance.clearCanvas();
            }
        });
    }
}

export function setHasSystemDataLoaded(status) {
    _hasSystemDataLoaded = status;
}
export function getHasSystemDataLoaded() {
    return _hasSystemDataLoaded;
}

export async function loadSystemData(isGuest) {
    if (isGuest) {
        if (uiElements.journalHeatmapContainer) uiElements.journalHeatmapContainer.innerHTML = `<p class="text-center p-2 opacity-70">Log Consistency Matrix not available in Guest Mode.</p>`;
        if (uiElements.journalStreakDisplay) uiElements.journalStreakDisplay.textContent = `-- DAYS (Guest)`;
        _hasSystemDataLoaded = true;
        return;
    }

    if (_hasSystemDataLoaded && !isGuest) return;

    try {
        const journalDocs = await getAllJournalMetadataForUser();
        if (journalDocs) {
            renderJournalHeatmap(journalDocs);
            calculateJournalStreak(journalDocs);
            _hasSystemDataLoaded = true;
        }
    } catch (error) {
        console.error("Error loading journal metadata for system panel:", error);
        showFeedback("Could not load system panel data.", true);
    }
}


function calculateJournalStreak(journalDocsSnapshots) {
    if (!uiElements.journalStreakDisplay) return;
    const journalDates = new Set(journalDocsSnapshots.map(docSnap => docSnap.id));

    if (journalDates.size === 0) {
        uiElements.journalStreakDisplay.textContent = `0 DAYS`;
        return;
    }
    let streak = 0;
    let currentDate = new Date();

    if (!journalDates.has(toYMDString(currentDate))) {
        currentDate.setDate(currentDate.getDate() - 1);
    }
    while (journalDates.has(toYMDString(currentDate))) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    uiElements.journalStreakDisplay.textContent = `${streak} DAY${streak !== 1 ? 'S' : ''}`;
}

function renderJournalHeatmap(journalDocsSnapshots) {
    if (!uiElements.journalHeatmapContainer) return;
    uiElements.journalHeatmapContainer.innerHTML = '';
    const logDates = new Set(journalDocsSnapshots.map(docSnap => docSnap.id));

    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
        let date = new Date();
        date.setDate(date.getDate() - i);
        const dateString = toYMDString(date);
        const dayDiv = document.createElement('div');
        dayDiv.className = 'heatmap-day';
        dayDiv.title = formatDisplayDate(dateString);
        if (logDates.has(dateString)) dayDiv.classList.add('active');
        uiElements.journalHeatmapContainer.appendChild(dayDiv);
    }
}

const k_sketch = (p) => {
    p.setup = () => {
        const parent = document.getElementById('kaleidoscopeCanvasParent');
        if (!parent) {
            console.error("Kaleidoscope canvas parent not found!");
            return;
        }
        const size = Math.min(parent.clientWidth > 0 ? parent.clientWidth - 4 : 396, 400);
        const canvas = p.createCanvas(size, size);
        canvas.parent(parent);
        p.colorMode(p.HSB);
        p.background(20);
    };
    p.draw = () => {
        if (p.mouseIsPressed && uiElements.kSymmetrySlider &&
            p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
            const symmetry = uiElements.kSymmetrySlider.value;
            const angle = 360 / symmetry;
            const mx = p.mouseX - p.width / 2;
            const my = p.mouseY - p.height / 2;
            const pmx = p.pmouseX - p.width / 2;
            const pmy = p.pmouseY - p.height / 2;
            p.translate(p.width / 2, p.height / 2);
            p.stroke((p.frameCount * 2) % 360, 80, 100);
            p.strokeWeight(3);
            for (let i = 0; i < symmetry; i++) {
                p.rotate(angle);
                p.line(mx, my, pmx, pmy);
                p.push();
                p.scale(1, -1);
                p.line(mx, my, pmx, pmy);
                p.pop();
            }
        }
    };
    p.clearCanvas = () => {
        if (p && p.background) {
           p.background(20);
        }
    };
    p5Instance = p;
};

function startKaleidoscope() {
    if (!uiElements.kaleidoscopeModal) return;
    // Ensure 'hidden' (display:none) is removed if it was there
    uiElements.kaleidoscopeModal.classList.remove('hidden');
    // Add 'modal-visible' to trigger animation
    uiElements.kaleidoscopeModal.classList.add('modal-visible');

    if (!kaleidoscopeSketch) {
        if (typeof p5 !== 'undefined') {
            kaleidoscopeSketch = new p5(k_sketch);
        } else {
            console.error("p5.js is not loaded. Kaleidoscope cannot start.");
            showFeedback("Error: K-Mode component failed to load.", true);
            return;
        }
    } else if (p5Instance && p5Instance.loop) {
        p5Instance.loop();
    }
}

function stopKaleidoscope() {
    if (!uiElements.kaleidoscopeModal) return;
    // Remove 'modal-visible' to trigger hiding animation
    uiElements.kaleidoscopeModal.classList.remove('modal-visible');
    // The CSS transition for visibility will eventually set it to hidden.
    // No need to add 'hidden' class immediately unless you want to force display:none after animation.

    if (p5Instance && p5Instance.noLoop) {
        p5Instance.noLoop();
    }
}

export function clearSystemData() {
    if (kaleidoscopeSketch && p5Instance && p5Instance.remove) {
        p5Instance.remove();
        kaleidoscopeSketch = null;
        p5Instance = null;
    }
    if (uiElements.journalHeatmapContainer) uiElements.journalHeatmapContainer.innerHTML = '';
    if (uiElements.journalStreakDisplay) uiElements.journalStreakDisplay.textContent = '-- DAYS';
    _hasSystemDataLoaded = false;
    console.log("System panel data cleared.");
}
