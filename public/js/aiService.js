// public/js/aiService.js
import { uiElements, showFeedback } from './uiManager.js'; // escapeHTML REMOVED from here
import { escapeHTML } from './utils.js'; // escapeHTML ADDED here
import { getApiKey } from './dataManager.js';
import { playSound } from './soundManager.js';
import { isGuestMode } from './guestManager.js';


const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";
let currentAiChatContext = null;

/**
 * Opens the AI chat modal and sets the context for the chat.
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
    if (uiElements.aiChatHistory) uiElements.aiChatHistory.innerHTML = '';
    if (uiElements.aiChatInput) uiElements.aiChatInput.value = '';

    displayChatMessage('Connection established. Ready for analysis of log dated ' + dayEntry.displayDate, 'gemini');
    
    if (uiElements.aiChatModal) {
        uiElements.aiChatModal.classList.remove('hidden'); // Ensure display is not none
        // Add a tiny delay for the display change to take effect before adding animation class
        requestAnimationFrame(() => {
            uiElements.aiChatModal.classList.add('modal-visible');
        });
    }
    if (uiElements.aiChatInput) uiElements.aiChatInput.focus();
}

/**
 * Closes the AI chat modal and clears the context.
 */
export function closeAiChat() {
    if (uiElements.aiChatModal) {
        uiElements.aiChatModal.classList.remove('modal-visible');
    }
    currentAiChatContext = null;
}

/**
 * Sends the user's message to the AI and displays the response.
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
    const thinkingMessage = displayChatMessage('...', 'gemini');

    try {
        const aiResponse = await getAiResponse(userPrompt, currentAiChatContext);
        if (thinkingMessage && thinkingMessage.querySelector('p')) {
            thinkingMessage.querySelector('p').innerHTML = escapeHTML(aiResponse);
        } else if (thinkingMessage) {
            thinkingMessage.innerHTML = `<div class="sender">gemini</div><p>${escapeHTML(aiResponse)}</p>`;
        }
    } catch (error) {
        if (thinkingMessage && thinkingMessage.querySelector('p')) {
            thinkingMessage.querySelector('p').textContent = `Error: ${error.message}`;
        } else if (thinkingMessage) {
            thinkingMessage.innerHTML = `<div class="sender">gemini</div><p>Error: ${error.message}</p>`;
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

async function getAiResponse(userPrompt, journalEntry) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key not found. Please save your key in the System tab.");
    }
    if (!journalEntry || !journalEntry.logs || !journalEntry.displayDate) {
        throw new Error("Invalid journal entry context provided for AI chat.");
    }

    const logsText = journalEntry.logs.map(log => `- ${log.time}: ${log.content}`).join('\n');
    const fullPrompt = `SYSTEM PREMISE: You are Gemma, a helpful AI assistant integrated into a personal journaling app called "System Log". Your persona is that of a slightly retro, cyberpunk AI. You are analyzing a journal entry for your user, whom you refer to as "Master". Be helpful, insightful, and maintain the persona.
JOURNAL CONTEXT: Date of Entry: ${journalEntry.displayDate} Logs:\n${logsText}\n---\nUSER QUERY: ${userPrompt}`;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: fullPrompt }] }],
                generationConfig: { temperature: 0.7, topK: 40 }
            })
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
            }
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
        console.error("Error fetching AI response:", error);
        throw error instanceof Error ? error : new Error("Network error or failed to fetch AI response.");
    }
}
