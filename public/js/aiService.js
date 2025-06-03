// public/js/aiService.js
import { uiElements, showFeedback } from './uiManager.js';
import { escapeHTML } from './utils.js';
import { getApiKey } from './dataManager.js';
import { isGuestMode } from './guestManager.js';
import { AI_PERSONALITIES, DEFAULT_AI_PERSONALITY_KEY } from './aiConstants.js'; // Import AI personalities

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

let currentAiChatContext = null; // Stores the journalDayEntry object
let currentApiChatHistory = []; // Stores the conversation history for the Gemini API

/**
 * Opens the AI chat modal and sets the context for the chat.
 * Initializes the API chat history using the selected AI personality.
 * @param {object} dayEntry - The journal entry object to discuss.
 */
export function openAiChat(dayEntry) {
    if (isGuestMode()) {
        showFeedback("AI Chat is not available in Guest Mode.", true);
        return;
    }
    const apiKey = getApiKey();
    if (!apiKey) {
        showFeedback("API Key not configured. Please set it in the System tab to use AI features.", true);
        return;
    }

    currentAiChatContext = dayEntry;
    currentApiChatHistory = []; // Reset API chat history

    if (uiElements.aiChatHistory) uiElements.aiChatHistory.innerHTML = '';
    if (uiElements.aiChatInput) uiElements.aiChatInput.value = '';

    // Determine which AI personality to use
    let selectedPersonalityKey = uiElements.aiPersonalitySelect ? uiElements.aiPersonalitySelect.value : DEFAULT_AI_PERSONALITY_KEY;
    if (!AI_PERSONALITIES[selectedPersonalityKey]) {
        console.warn(`Selected AI personality key "${selectedPersonalityKey}" not found. Falling back to default.`);
        selectedPersonalityKey = DEFAULT_AI_PERSONALITY_KEY;
    }
    const selectedPersonality = AI_PERSONALITIES[selectedPersonalityKey];
    const systemPremise = selectedPersonality.prompt; // Get the prompt from the selected personality

    // Initial system message displayed to the user
    displayChatMessage(`Connection established with ${selectedPersonality.name}. Ready for analysis of log dated ${dayEntry.displayDate}`, 'gemini');

    const logsText = dayEntry.logs.map(log => `- ${log.time}: ${log.content}`).join('\n');
    // Construct the initial context for the AI, including the selected system premise
    const initialContextPrompt = `${systemPremise}
JOURNAL CONTEXT: Date of Entry: ${dayEntry.displayDate} Logs:\n${logsText}\n---\nI have provided my journal entry above. Please begin our conversation based on this context.`;

    currentApiChatHistory.push({ role: "user", parts: [{ text: initialContextPrompt }] });

    if (uiElements.aiChatModal) {
        uiElements.aiChatModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            uiElements.aiChatModal.classList.add('modal-visible');
        });
    }
    if (uiElements.aiChatInput) uiElements.aiChatInput.focus();
}

/**
 * Closes the AI chat modal and clears the context and API history.
 */
export function closeAiChat() {
    if (uiElements.aiChatModal) {
        uiElements.aiChatModal.classList.remove('modal-visible');
        // Consider adding a delay if your modal has a transition effect
        // setTimeout(() => { uiElements.aiChatModal.classList.add('hidden'); }, 300);
    }
    currentAiChatContext = null;
    currentApiChatHistory = [];
}

/**
 * Sends the user's message to the AI and displays the response.
 * Manages the conversation history for the API.
 */
export async function sendAiChatMessage() {
    if (!uiElements.aiChatInput || !uiElements.aiChatSendBtn || !uiElements.aiChatHistory) return;

    const userPrompt = uiElements.aiChatInput.value.trim();
    if (userPrompt === "") return;

    const apiKey = getApiKey();
    if (!apiKey) {
        showFeedback("Error: API Key not configured in System tab.", true);
        return;
    }

    uiElements.aiChatInput.value = '';
    uiElements.aiChatInput.disabled = true;
    uiElements.aiChatSendBtn.disabled = true;

    displayChatMessage(userPrompt, 'user');
    currentApiChatHistory.push({ role: "user", parts: [{ text: userPrompt }] });

    const thinkingMessage = displayChatMessage('...', 'gemini');

    try {
        const aiResponseText = await getAiResponseWithHistory();
        if (thinkingMessage && thinkingMessage.querySelector('p')) {
            thinkingMessage.querySelector('p').innerHTML = escapeHTML(aiResponseText);
        } else if (thinkingMessage) {
            thinkingMessage.innerHTML = `<div class="sender">gemini</div><p>${escapeHTML(aiResponseText)}</p>`;
        }
        currentApiChatHistory.push({ role: "model", parts: [{ text: aiResponseText }] });

    } catch (error) {
        const errorMessage = `Error: ${error.message}`;
        if (thinkingMessage && thinkingMessage.querySelector('p')) {
            thinkingMessage.querySelector('p').textContent = errorMessage;
        } else if (thinkingMessage) {
            thinkingMessage.innerHTML = `<div class="sender">gemini</div><p>${errorMessage}</p>`;
        }
        console.error("AI Chat Error:", error);
        showFeedback(`AI Error: ${error.message}`, true);
    } finally {
        uiElements.aiChatInput.disabled = false;
        uiElements.aiChatSendBtn.disabled = false;
        uiElements.aiChatInput.focus();
        if (uiElements.aiChatHistory) {
            uiElements.aiChatHistory.scrollTop = uiElements.aiChatHistory.scrollHeight;
        }
    }
}

function displayChatMessage(message, sender) {
    if (!uiElements.aiChatHistory) return null;
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `ai-chat-message ${sender}`;
    messageWrapper.innerHTML = `<div class="sender">${escapeHTML(sender)}</div><p>${escapeHTML(message)}</p>`;
    uiElements.aiChatHistory.appendChild(messageWrapper);
    uiElements.aiChatHistory.scrollTop = uiElements.aiChatHistory.scrollHeight;
    return messageWrapper;
}

async function getAiResponseWithHistory() {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key not found. Please save your key in the System tab.");
    }
    if (!currentApiChatHistory || currentApiChatHistory.length === 0) {
        throw new Error("Cannot get AI response: chat history is empty.");
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: currentApiChatHistory,
                generationConfig: { temperature: 0.7, topK: 40 }
            })
        });

        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); }
            catch (e) { throw new Error(`API request failed with status ${response.status}: ${response.statusText}`); }
            console.error("API Error Response:", errorData);
            const apiErrorMessage = errorData?.error?.message || `API request failed with status ${response.status}.`;
            throw new Error(apiErrorMessage);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error("Invalid response structure from API:", data);
            throw new Error("Invalid or empty response structure from AI API.");
        }
        return text;
    } catch (error) {
        console.error("Error fetching AI response with history:", error);
        throw error instanceof Error ? error : new Error("Network error or failed to fetch AI response.");
    }
}