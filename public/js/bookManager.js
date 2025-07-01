// public/js/bookManager.js
import { db, collection, doc, addDoc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, updateDoc, startAfter, limit } from './firebaseService.js';
import { uiElements, showFeedback } from './uiManager.js';
import { isGuestMode, getUserId, getGuestBookReviews, addGuestBookReview, updateGuestBookReview, deleteGuestBookReview } from './guestManager.js';
import { escapeHTML } from './utils.js';

const BOOKS_PAGE_SIZE = 12;

let bookCollectionRef = null;
let unsubscribeBooks = null;
let lastVisibleBookDoc = null;
let _hasBooksLoaded = false;
let currentOpenBook = null;

export function initializeBookReferences() {
    const userId = getUserId();
    if (userId && !isGuestMode()) {
        bookCollectionRef = collection(db, `users/${userId}/bookReviews`);
    } else {
        bookCollectionRef = null;
    }
}

export function setHasBooksLoaded(status) {
    _hasBooksLoaded = status;
}

export function getHasBooksLoaded() {
    return _hasBooksLoaded;
}

export function loadBooks(isGuest) {
    if (unsubscribeBooks) unsubscribeBooks();
    lastVisibleBookDoc = null; 
    if (!uiElements.bookList || !uiElements.bookListLoadMoreContainer) return;

    uiElements.bookList.innerHTML = `<p class="text-center p-2 opacity-70 col-span-full">Querying books...</p>`;
    uiElements.bookListLoadMoreContainer.innerHTML = '';

    if (isGuest) {
        const guestBooks = getGuestBookReviews();
        uiElements.bookList.innerHTML = guestBooks.length === 0 ? `<p class="text-center p-2 opacity-70 col-span-full">No books added yet.</p>` : "";
        guestBooks.forEach(book => renderBookCard(book, true));
    } else {
        if (!bookCollectionRef) {
            uiElements.bookList.innerHTML = `<p class="text-center p-2 opacity-70 col-span-full">Book review service not available.</p>`;
            return;
        }
        const q = query(bookCollectionRef, orderBy("lastUpdated", "desc"), limit(BOOKS_PAGE_SIZE));
        unsubscribeBooks = onSnapshot(q, (snapshot) => {
            uiElements.bookList.innerHTML = "";
            if (snapshot.empty && lastVisibleBookDoc === null) {
                uiElements.bookList.innerHTML = `<p class="text-center p-2 opacity-70 col-span-full">No books added yet.</p>`;
                return;
            }
            snapshot.docs.forEach(doc => renderBookCard({ id: doc.id, ...doc.data() }, false));

            if (snapshot.docs.length >= BOOKS_PAGE_SIZE) {
                lastVisibleBookDoc = snapshot.docs[snapshot.docs.length - 1];
                renderLoadMoreBooksButton();
            } else {
                lastVisibleBookDoc = null;
                uiElements.bookListLoadMoreContainer.innerHTML = '';
            }
        }, (error) => {
            console.error("Error loading books:", error);
            showFeedback("Error: Could not load book list.", true);
            uiElements.bookList.innerHTML = `<p class="text-center p-2 opacity-70 text-red-500 col-span-full">Error loading books.</p>`;
        });
    }
    _hasBooksLoaded = true;
}

function renderLoadMoreBooksButton() {
    if (!uiElements.bookListLoadMoreContainer) return;
    uiElements.bookListLoadMoreContainer.innerHTML = `<button id="bookListLoadMoreBtn" class="button-90s">Load More Books</button>`;
    const loadMoreBtn = document.getElementById('bookListLoadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreBooks);
    }
}

async function loadMoreBooks() {
    if (!lastVisibleBookDoc || isGuestMode() || !bookCollectionRef) return;

    const loadMoreBtn = document.getElementById('bookListLoadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.textContent = 'Loading...';
        loadMoreBtn.disabled = true;
    }

    try {
        const q = query(bookCollectionRef, orderBy("lastUpdated", "desc"), startAfter(lastVisibleBookDoc), limit(BOOKS_PAGE_SIZE));
        const snapshot = await getDocs(q);
        snapshot.docs.forEach(doc => renderBookCard({ id: doc.id, ...doc.data() }, false));

        if (snapshot.docs.length < BOOKS_PAGE_SIZE) {
            lastVisibleBookDoc = null;
            if (uiElements.bookListLoadMoreContainer) uiElements.bookListLoadMoreContainer.innerHTML = '';
        } else {
            lastVisibleBookDoc = snapshot.docs[snapshot.docs.length - 1];
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Load More Books';
                loadMoreBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error("Error loading more books:", error);
        showFeedback("Failed to load more books.", true);
        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Load More Books';
            loadMoreBtn.disabled = false;
        }
    }
}

function renderBookCard(book, isGuest) {
    if (!uiElements.bookList) return;

    const bookCard = document.createElement('div');
    bookCard.className = 'book-card';
    
    const placeholderIcon = '📚'; 
    let coverHtml;
    if (book.coverImageUrl && book.coverImageUrl.startsWith('http')) {
        coverHtml = `<img src="${escapeHTML(book.coverImageUrl)}" alt="${escapeHTML(book.title)} Cover" class="book-cover">`;
    } else {
        coverHtml = `<div class="book-cover-placeholder">${placeholderIcon}</div>`;
    }

    bookCard.innerHTML = `
        ${coverHtml}
        <div class="book-info">
            <div class="book-title" title="${escapeHTML(book.title)}">${escapeHTML(book.title)}</div>
            <div class="book-author" title="${escapeHTML(book.author)}">${escapeHTML(book.author)}</div>
        </div>
    `;

    bookCard.addEventListener('click', () => openBookNotesModal(book, isGuest));
    uiElements.bookList.appendChild(bookCard);
}

export function openAddBookModal() {
    if (!uiElements.addBookModal) return;
    uiElements.addBookModal.classList.remove('hidden');
    uiElements.addBookModal.classList.add('modal-visible');

    if (uiElements.bookTitleInput) uiElements.bookTitleInput.value = '';
    if (uiElements.bookAuthorInput) uiElements.bookAuthorInput.value = '';
    if (uiElements.bookCoverUrlInput) uiElements.bookCoverUrlInput.value = '';
    if (uiElements.bookTitleInput) uiElements.bookTitleInput.focus();
}

export function closeAddBookModal() {
    if (uiElements.addBookModal) {
        uiElements.addBookModal.classList.remove('modal-visible');
        setTimeout(() => uiElements.addBookModal.classList.add('hidden'), 300);
    }
}

export async function saveNewBook() {
    if (!uiElements.bookTitleInput || !uiElements.bookAuthorInput || !uiElements.bookCoverUrlInput) return;

    const title = uiElements.bookTitleInput.value.trim();
    const author = uiElements.bookAuthorInput.value.trim();
    const coverImageUrl = uiElements.bookCoverUrlInput.value.trim();

    if (!title || !author) {
        showFeedback("Book title and author are required.", true);
        return;
    }

    const newBookData = {
        title: title,
        author: author,
        coverImageUrl: coverImageUrl,
        notesContent: ""
    };

    if (isGuestMode()) {
        addGuestBookReview(newBookData);
        loadBooks(true);
        showFeedback(`"${title}" added to local collection.`);
    } else {
        if (!bookCollectionRef) {
            showFeedback("Error: Book service not available.", true);
            return;
        }
        try {
            await addDoc(bookCollectionRef, {
                ...newBookData,
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });
            showFeedback(`"${title}" added to your collection.`);
        } catch (error) {
            console.error("Error adding book:", error);
            showFeedback("Error: Could not add book.", true);
        }
    }
    closeAddBookModal();
}

export function openBookNotesModal(book, isGuest) {
    if (!uiElements.bookNotesModal || !uiElements.bookNotesModalTitle || !uiElements.bookNotesModalSubtitle || !uiElements.bookNotesInput) return;

    currentOpenBook = { ...book, isGuest: isGuest }; 
    
    uiElements.bookNotesModalTitle.textContent = escapeHTML(book.title);
    uiElements.bookNotesModalSubtitle.textContent = `by ${escapeHTML(book.author)}`;
    uiElements.bookNotesInput.value = book.notesContent || ''; 
    
    uiElements.bookNotesModal.classList.remove('hidden');
    uiElements.bookNotesModal.classList.add('modal-visible');
    uiElements.bookNotesInput.focus();
}

export function closeBookNotesModal() {
    if (uiElements.bookNotesModal) {
        uiElements.bookNotesModal.classList.remove('modal-visible');
        setTimeout(() => uiElements.bookNotesModal.classList.add('hidden'), 300);
    }
    currentOpenBook = null; 
}

export async function saveBookNotes() {
    if (!currentOpenBook || !uiElements.bookNotesInput) return;

    const newNotesContent = uiElements.bookNotesInput.value;

    if (currentOpenBook.isGuest) {
        updateGuestBookReview(currentOpenBook.id, { notesContent: newNotesContent, lastUpdated: new Date().toISOString() });
        showFeedback("Notes saved locally.");
        loadBooks(true); 
    } else {
        if (!bookCollectionRef) {
            showFeedback("Error: Book service not available.", true);
            return;
        }
        try {
            await updateDoc(doc(bookCollectionRef, currentOpenBook.id), {
                notesContent: newNotesContent,
                lastUpdated: serverTimestamp()
            });
            showFeedback("Notes saved to cloud.");
        } catch (error) {
            console.error("Error saving book notes:", error);
            showFeedback("Error: Could not save notes.", true);
        }
    }
    closeBookNotesModal();
}

export async function deleteBook() {
    if (!currentOpenBook) return;

    if (!confirm(`Are you sure you want to delete "${escapeHTML(currentOpenBook.title)}"? This action cannot be undone.`)) {
        return;
    }

    if (currentOpenBook.isGuest) {
        deleteGuestBookReview(currentOpenBook.id);
        showFeedback(`"${escapeHTML(currentOpenBook.title)}" deleted locally.`);
        loadBooks(true);
    } else {
        if (!bookCollectionRef) {
            showFeedback("Error: Book service not available.", true);
            return;
        }
        try {
            await deleteDoc(doc(bookCollectionRef, currentOpenBook.id));
            showFeedback(`"${escapeHTML(currentOpenBook.title)}" deleted from cloud.`);
        } catch (error) {
            console.error("Error deleting book:", error);
            showFeedback("Error: Could not delete book.", true);
        }
    }
    closeBookNotesModal();
}

export function clearBookData() {
    if (unsubscribeBooks) {
        unsubscribeBooks();
        unsubscribeBooks = null;
    }
    if (uiElements.bookList) uiElements.bookList.innerHTML = '';
    if (uiElements.bookListLoadMoreContainer) uiElements.bookListLoadMoreContainer.innerHTML = '';
    lastVisibleBookDoc = null;
    _hasBooksLoaded = false;
    currentOpenBook = null;
    console.log("Book data cleared.");
}