// public/js/firebaseService.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCht_2CFCVolrKp-dyZf3_2o7_KQI_7HoQ", // Keep your actual API key
    authDomain: "my-retro-task-tracker.firebaseapp.com",
    projectId: "my-retro-task-tracker",
    storageBucket: "my-retro-task-tracker.appspot.com",
    messagingSenderId: "183935251636",
    appId: "1:183935251636:web:27581f344a56bab66153e1"
};

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase services initialized successfully.");
} catch (error) {
    console.error("FATAL: Firebase initialization failed:", error);
    // You might want to display a user-facing error here if Firebase is critical
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) {
        loginContainer.innerHTML = `<div class="container-90s mx-auto text-center" style="margin-top: 10vh;"><h1>System Error</h1><p>Could not connect to core services. Please refresh or contact support.</p></div>`;
    }
    // Prevent further execution if Firebase fails to load
    throw error;
}

export { app, auth, db };

// Export all other Firebase functions directly for use in other modules
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";