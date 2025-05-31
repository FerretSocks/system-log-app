// public/js/soundManager.js
export function playSound(soundId) {
    const sound = document.getElementById(soundId);
    if (!sound) {
        console.warn(`Audio element #${soundId} not found!`);
        return;
    }
    try {
        const volume = parseFloat(sound.getAttribute('data-volume')) || 1.0;
        sound.volume = volume;
        sound.currentTime = 0;
        sound.play().catch(error => {
            if (error.name !== "NotAllowedError") { // Common browser policy error before user interaction
                console.error(`Audio playback error for ${soundId}:`, error);
            }
        });
    } catch (e) {
        console.error(`Error playing sound ${soundId}:`, e);
    }
}