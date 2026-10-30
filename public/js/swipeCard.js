/**
 * ⭐ WOW FEATURE 2: Swipeable Discovery Deck JS
 */
document.addEventListener('DOMContentLoaded', () => {
  const deckContainer = document.getElementById('discover-deck');
  if (!deckContainer) return;

  const cards = Array.from(deckContainer.querySelectorAll('.swipe-card'));
  const btnPass = document.getElementById('btn-pass');
  const btnSave = document.getElementById('btn-save');
  const counterElem = document.getElementById('deck-counter');
  const emptyDeckElem = document.getElementById('empty-deck-notice');
  const toastElem = document.getElementById('swipe-toast');

  let currentIndex = 0;
  const totalCards = cards.length;

  function updateCounter() {
    if (counterElem) {
      if (currentIndex < totalCards) {
        counterElem.textContent = `Card ${currentIndex + 1} of ${totalCards}`;
      } else {
        counterElem.textContent = `All Completed!`;
      }
    }
  }

  function showToast(message, type = 'info') {
    if (!toastElem) return;
    toastElem.textContent = message;
    toastElem.className = `fixed bottom-6 left-1/2 transform -translate-x-1/2 px-5 py-3 rounded-full text-white font-medium text-sm shadow-xl transition-all duration-300 z-50 ${
      type === 'success' ? 'bg-emerald-600' : 'bg-gray-800'
    }`;
    toastElem.classList.remove('opacity-0', 'pointer-events-none');
    
    setTimeout(() => {
      toastElem.classList.add('opacity-0', 'pointer-events-none');
    }, 1800);
  }

  function getCurrentCard() {
    if (currentIndex < totalCards) {
      return cards[currentIndex];
    }
    return null;
  }

  async function handleSwipe(direction) {
    const activeCard = getCurrentCard();
    if (!activeCard) return;

    const oppId = activeCard.dataset.opportunityId;
    const oppTitle = activeCard.dataset.opportunityTitle;

    if (direction === 'left') {
      activeCard.classList.add('swipe-left');
      showToast(`Skipped: ${oppTitle}`, 'info');
    } else if (direction === 'right') {
      activeCard.classList.add('swipe-right');
      showToast(`Saved to Bookmarks! ⭐`, 'success');

      // Trigger AJAX bookmark with action 'save' so existing bookmarks aren't removed
      try {
        const res = await fetch(`/opportunities/${oppId}/bookmark`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ action: 'save' })
        });
        const data = await res.json();
        if (data && typeof data.bookmarkCount !== 'undefined') {
          const counterBadges = document.querySelectorAll('.bookmark-count-badge');
          counterBadges.forEach(badge => {
            badge.textContent = data.bookmarkCount;
          });
        }
      } catch (e) {
        console.error('Auto-bookmark on swipe right failed:', e);
      }
    }

    setTimeout(() => {
      activeCard.style.display = 'none';
      currentIndex++;
      updateCounter();

      if (currentIndex >= totalCards) {
        if (emptyDeckElem) emptyDeckElem.classList.remove('hidden');
        if (btnPass) btnPass.disabled = true;
        if (btnSave) btnSave.disabled = true;
      }
    }, 350);
  }

  if (btnPass) {
    btnPass.addEventListener('click', () => handleSwipe('left'));
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => handleSwipe('right'));
  }

  // Keyboard navigation support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      handleSwipe('left');
    } else if (e.key === 'ArrowRight') {
      handleSwipe('right');
    }
  });

  // Touch & Pointer Gesture Support (True mobile swipe)
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let isDragging = false;

  deckContainer.addEventListener('pointerdown', (e) => {
    const card = getCurrentCard();
    if (!card) return;
    startX = e.clientX;
    startY = e.clientY;
    currentX = startX;
    isDragging = true;
    card.style.transition = 'none';
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const card = getCurrentCard();
    if (!card) return;
    currentX = e.clientX;
    const deltaX = currentX - startX;
    const rotate = deltaX * 0.08;
    card.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;
  });

  window.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    const card = getCurrentCard();
    if (!card) return;
    const deltaX = currentX - startX;
    card.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.35s ease';

    if (deltaX > 80) {
      handleSwipe('right');
    } else if (deltaX < -80) {
      handleSwipe('left');
    } else {
      card.style.transform = '';
    }
  });

  updateCounter();
});
