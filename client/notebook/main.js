// client/notebook/main.js
(function () {
  const API_BASE_URL = window.__EVL_API_BASE__ || 'http://localhost:8000';
  const TOKEN_KEY = 'evl_access_token';

  const notebookTitle = document.getElementById('notebook-title');
  const notebookGrid = document.getElementById('notebook-grid');
  const notebookDetail = document.getElementById('notebook-detail');
  const selectedNotebookTitle = document.getElementById('selected-notebook-title');
  const vocabList = document.getElementById('vocab-list');
  const searchInput = document.getElementById('search-input');
  const srNow = document.getElementById('sr-now');
  const sr1 = document.getElementById('sr-1');
  const sr3 = document.getElementById('sr-3');
  const sr7 = document.getElementById('sr-7');
  const sr14 = document.getElementById('sr-14');
  const srMastered = document.getElementById('sr-mastered');
  const startReviewBtn = document.getElementById('start-review-btn');
  const reviewNowBtn = document.getElementById('review-now-btn');

  const reviewModal = document.getElementById('review-modal');
  const closeReview = document.getElementById('close-review');
  const reviewWordEl = document.getElementById('review-word');
  const reviewPhoneticEl = document.getElementById('review-phonetic');
  const reviewMeaningEl = document.getElementById('review-meaning');
  const btnShowMeaning = document.getElementById('btn-show-meaning');
  const btnWrong = document.getElementById('btn-wrong');
  const btnCorrect = document.getElementById('btn-correct');

  let notebooks = [];
  let currentNotebookId = null;
  let currentVocabList = [];
  let reviewQueue = [];
  let currentReviewIndex = 0;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function apiRequest(path, options = {}) {
    const headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(API_BASE_URL + path, {
      ...options,
      headers
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  function renderNotebookCards() {
    notebookGrid.innerHTML = '';

    if (notebooks.length === 0) {
      notebookGrid.innerHTML = '<div class="empty-state">Bạn chưa có sổ tay nào.</div>';
      return;
    }

    for (const n of notebooks) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'notebook-item-card';
      card.dataset.notebookId = String(n.id);
      card.innerHTML = `
        <div class="notebook-item-title">${n.title}</div>
        <div class="notebook-item-meta">${n.vocab_count || 0} từ</div>
      `;
      card.addEventListener('click', () => selectNotebook(n.id));
      notebookGrid.appendChild(card);
    }
  }

  async function loadNotebooks() {
    const data = await apiRequest('/notebooks');
    notebooks = data.notebooks || [];
    renderNotebookCards();

    if (notebooks.length === 0) {
      notebookDetail.classList.add('hidden');
      return;
    }

    await selectNotebook(notebooks[0].id);
  }

  async function selectNotebook(id) {
    currentNotebookId = Number(id);
    const nb = notebooks.find((x) => Number(x.id) === currentNotebookId);

    notebookTitle.textContent = 'Sổ tay của bạn';
    selectedNotebookTitle.textContent = nb ? nb.title : 'Sổ tay';
    notebookDetail.classList.remove('hidden');
    searchInput.value = '';

    Array.from(notebookGrid.querySelectorAll('.notebook-item-card')).forEach((card) => {
      const isActive = Number(card.dataset.notebookId) === currentNotebookId;
      card.classList.toggle('active', isActive);
    });

    await loadVocabsForNotebook(currentNotebookId);
    await loadSRSummary();
  }

  async function loadVocabsForNotebook(notebookId) {
    try {
      const data = await apiRequest(`/notebooks/${notebookId}/vocabs`);
      currentVocabList = data.vocabs || [];
      renderVocabList(currentVocabList);
    } catch (err) {
      console.error(err);
      vocabList.innerHTML = '<div class="empty-state">Không thể tải danh sách. Hãy đăng nhập để lấy tiến độ.</div>';
    }
  }

  function renderVocabList(list) {
    if (!currentNotebookId) {
      vocabList.innerHTML = '';
      return;
    }

    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? list.filter((v) => v.word.toLowerCase().includes(q) || (v.meaning || '').toLowerCase().includes(q))
      : list;

    vocabList.innerHTML = '';
    if (filtered.length === 0) {
      vocabList.innerHTML = '<div class="empty-state">Không có từ nào khớp tìm kiếm.</div>';
      return;
    }

    for (const v of filtered) {
      const card = document.createElement('div');
      card.className = 'vocab-card';
      card.innerHTML = `
        <div class="vocab-card-main">
          <h3>${v.word}</h3>
          <div class="vocab-card-phonetic">${v.phonetic || ''}</div>
          <div class="vocab-card-meaning">${v.meaning || ''}</div>
        </div>
        <div class="vocab-card-actions">
          <div class="vocab-card-level">${v.repetition_level !== null ? `Lv ${v.repetition_level}` : ''}</div>
          <div class="vocab-card-buttons">
            <button data-vocab-id="${v.id}" class="audio-btn">🔊</button>
            <button data-vocab-id="${v.id}" class="btn-outline btn-review">Ôn</button>
          </div>
        </div>
      `;
      vocabList.appendChild(card);
    }

    Array.from(document.querySelectorAll('.btn-review')).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const vid = Number(e.currentTarget.dataset.vocabId);
        startSingleReview(vid);
      });
    });
  }

  function openReviewModal() {
    reviewModal.classList.remove('hidden');
    reviewModal.setAttribute('aria-hidden', 'false');
  }

  function closeReviewModal() {
    reviewModal.classList.add('hidden');
    reviewModal.setAttribute('aria-hidden', 'true');
  }

  function showReviewVocab(v) {
    reviewWordEl.textContent = v.word;
    reviewPhoneticEl.textContent = v.phonetic || '';
    reviewMeaningEl.textContent = '';
    btnShowMeaning.disabled = false;
  }

  async function startReviewSession(queue) {
    reviewQueue = queue.slice();
    currentReviewIndex = 0;
    if (reviewQueue.length === 0) {
      alert('Không có từ nào để ôn.');
      return;
    }
    showCurrentReview();
    openReviewModal();
  }

  function showCurrentReview() {
    const v = reviewQueue[currentReviewIndex];
    showReviewVocab(v);
  }

  async function startSingleReview(vocabId) {
    const v = currentVocabList.find((x) => x.id === vocabId);
    if (!v) {
      alert('Không tìm thấy từ.');
      return;
    }
    await startReviewSession([v]);
  }

  btnShowMeaning.addEventListener('click', () => {
    const v = reviewQueue[currentReviewIndex];
    reviewMeaningEl.textContent = v.meaning || '';
    btnShowMeaning.disabled = true;
  });

  closeReview.addEventListener('click', () => closeReviewModal());

  btnCorrect.addEventListener('click', async () => {
    const v = reviewQueue[currentReviewIndex];
    try {
      const token = getToken();
      if (!token) throw new Error('Vui lòng đăng nhập để lưu tiến độ.');
      await apiRequest('/review', {
        method: 'POST',
        body: JSON.stringify({ vocab_id: v.id, result: 'correct' })
      });

      currentReviewIndex += 1;
      if (currentReviewIndex >= reviewQueue.length) {
        closeReviewModal();
        await loadVocabsForNotebook(currentNotebookId);
        await loadSRSummary();
        alert('Kết thúc phiên ôn. Good job!');
      } else {
        showCurrentReview();
      }
    } catch (err) {
      alert(err.message || 'Lỗi khi ghi tiến độ.');
    }
  });

  btnWrong.addEventListener('click', async () => {
    const v = reviewQueue[currentReviewIndex];
    try {
      const token = getToken();
      if (!token) throw new Error('Vui lòng đăng nhập để lưu tiến độ.');
      await apiRequest('/review', {
        method: 'POST',
        body: JSON.stringify({ vocab_id: v.id, result: 'wrong' })
      });

      currentReviewIndex += 1;
      if (currentReviewIndex >= reviewQueue.length) {
        closeReviewModal();
        await loadVocabsForNotebook(currentNotebookId);
        await loadSRSummary();
        alert('Kết thúc phiên ôn.');
      } else {
        showCurrentReview();
      }
    } catch (err) {
      alert(err.message || 'Lỗi khi ghi tiến độ.');
    }
  });

  async function loadSRSummary() {
    try {
      const data = await apiRequest('/repetition/summary');
      srNow.textContent = data.due_now || 0;
      sr1.textContent = data.due_1 || 0;
      sr3.textContent = data.due_3 || 0;
      sr7.textContent = data.due_7 || 0;
      sr14.textContent = data.due_14 || 0;
      srMastered.textContent = data.mastered || 0;
    } catch (err) {
      srNow.textContent = '-';
      sr1.textContent = '-';
      sr3.textContent = '-';
      sr7.textContent = '-';
      sr14.textContent = '-';
      srMastered.textContent = '-';
    }
  }

  startReviewBtn.addEventListener('click', async () => {
    try {
      if (!currentNotebookId) {
        alert('Hãy chọn một sổ tay trước khi ôn tập.');
        return;
      }

      const data = await apiRequest(`/notebooks/${currentNotebookId}/vocabs`);
      const vocs = data.vocabs || [];
      const due = vocs.filter((v) => {
        if (!v.next_review_at) return false;
        const nr = new Date(v.next_review_at);
        return nr <= new Date();
      });

      if (due.length === 0) {
        alert('Không có từ cần ôn ngay trong sổ tay này.');
        return;
      }
      await startReviewSession(due);
    } catch (err) {
      alert(err.message || 'Vui lòng đăng nhập để ôn tập.');
    }
  });

  reviewNowBtn.addEventListener('click', () => startReviewBtn.click());
  searchInput.addEventListener('input', () => renderVocabList(currentVocabList));

  (async function init() {
    try {
      await loadNotebooks();
      await loadSRSummary();
    } catch (err) {
      console.error(err);
    }
  })();
})();
