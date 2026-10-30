/**
 * Interactive AJAX Bookmark Handler
 */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.bookmark-toggle-btn');
    if (!btn) return;

    e.preventDefault();
    const oppId = btn.dataset.opportunityId;
    if (!oppId) return;

    try {
      btn.disabled = true;
      const res = await fetch(`/opportunities/${oppId}/bookmark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      const data = await res.json();
      if (data.success) {
        const icon = btn.querySelector('.bookmark-icon');
        const text = btn.querySelector('.bookmark-text');
        
        if (data.bookmarked) {
          btn.classList.add('bg-indigo-600', 'text-white');
          btn.classList.remove('bg-slate-800', 'text-slate-300', 'text-slate-200', 'hover:bg-slate-700', 'bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
          if (icon) {
            icon.setAttribute('fill', 'currentColor');
          }
          if (text) {
            text.textContent = text.textContent.includes('Bookmark') && text.textContent.length > 8 ? 'Saved to Bookmarks' : 'Saved';
          }
        } else {
          btn.classList.remove('bg-indigo-600', 'text-white');
          btn.classList.add('bg-slate-800', 'text-slate-300', 'hover:bg-slate-700');
          if (icon) {
            icon.setAttribute('fill', 'none');
          }
          if (text) {
            text.textContent = text.textContent.includes('Saved') && text.textContent.length > 5 ? 'Bookmark' : 'Save';
          }
        }

        // Update badge counters if present
        const counterBadges = document.querySelectorAll('.bookmark-count-badge');
        counterBadges.forEach(badge => {
          badge.textContent = data.bookmarkCount;
        });
      }
    } catch (err) {
      console.error('Bookmark toggle failed:', err);
    } finally {
      btn.disabled = false;
    }
  });
});
