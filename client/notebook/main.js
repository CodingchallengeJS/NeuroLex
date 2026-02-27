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
  const srItemNow = document.getElementById('sr-item-now');
  const srItem1 = document.getElementById('sr-item-1');
  const srItem3 = document.getElementById('sr-item-3');
  const srItem7 = document.getElementById('sr-item-7');
  const srItem14 = document.getElementById('sr-item-14');
  const srItemMastered = document.getElementById('sr-item-mastered');
  const startReviewBtn = document.getElementById('start-review-btn');
  const reviewNowBtn = document.getElementById('review-now-btn');

  const reviewModal = document.getElementById('review-modal');
  const closeReview = document.getElementById('close-review');
  const reviewWordEl = document.getElementById('review-word');
  const reviewPhoneticEl = document.getElementById('review-phonetic');
  const reviewMeaningEl = document.getElementById('review-meaning');
  const reviewCardEl = document.getElementById('review-card');
  const reviewProgressEl = document.getElementById('review-progress');
  const reviewHintEl = document.getElementById('review-hint');
  const reviewActionsEl = document.getElementById('review-actions');
  const btnWrong = document.getElementById('btn-wrong');
  const btnCorrect = document.getElementById('btn-correct');

  let notebooks = [];
  let currentNotebookId = null;
  let currentVocabList = [];

  let reviewQueue = [];
  let currentReviewIndex = 0;
  let reviewMode = 'sequence'; // 'sequence' | 'single' | 'bucket'
  let reviewBucketLabel = '';
  let meaningRevealed = false;

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
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
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
      vocabList.innerHTML = '<div class="empty-state">Không thể tải danh sách.</div>';
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
      const lvLabel = v.repetition_level !== null ? `Lv ${v.repetition_level}` : '';
      const card = document.createElement('div');
      card.className = 'vocab-card';
      card.innerHTML = `
        <div class="vocab-card-main">
          <h3>${v.word}</h3>
          <div class="vocab-card-phonetic">${v.phonetic || ''}</div>
          <div class="vocab-card-meaning">${v.meaning || ''}</div>
        </div>
        <div class="vocab-card-actions">
          <div class="vocab-card-level">${lvLabel}</div>
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
    reviewPhoneticEl.textContent = '';
    reviewMeaningEl.textContent = '';
    meaningRevealed = false;
    reviewActionsEl.classList.add('hidden');
    reviewHintEl.classList.remove('hidden');

    if (reviewMode === 'sequence') {
      reviewProgressEl.textContent = `Từ ${currentReviewIndex + 1}/${reviewQueue.length} (hết sẽ quay lại từ đầu)`;
    } else if (reviewMode === 'bucket') {
      reviewProgressEl.textContent = `${reviewBucketLabel}: ${currentReviewIndex + 1}/${reviewQueue.length}`;
    } else {
      reviewProgressEl.textContent = 'Ôn từng từ';
    }
  }

  function showCurrentReview() {
    const v = reviewQueue[currentReviewIndex];
    if (!v) return;
    showReviewVocab(v);
  }

  function revealMeaning() {
    if (meaningRevealed) return;
    const v = reviewQueue[currentReviewIndex];
    if (!v) return;
    reviewPhoneticEl.textContent = v.phonetic || '';
    reviewMeaningEl.textContent = v.meaning || '';
    meaningRevealed = true;
    reviewHintEl.classList.add('hidden');
    reviewActionsEl.classList.remove('hidden');
  }

  async function startSingleReview(vocabId) {
    const token = getToken();
    if (!token) {
      alert('Vui lòng đăng nhập để lưu tiến độ.');
      return;
    }

    const v = currentVocabList.find((x) => Number(x.id) === vocabId);
    if (!v) {
      alert('Không tìm thấy từ.');
      return;
    }

    reviewMode = 'single';
    reviewBucketLabel = '';
    reviewQueue = [v];
    currentReviewIndex = 0;
    showCurrentReview();
    openReviewModal();
  }

  async function startNotebookReviewSession() {
    if (!currentNotebookId) {
      alert('Hãy chọn một sổ tay trước khi ôn tập.');
      return;
    }

    const token = getToken();
    if (!token) {
      alert('Vui lòng đăng nhập để ôn tập và lưu tiến độ.');
      return;
    }

    const data = await apiRequest(`/notebooks/${currentNotebookId}/review-sequence`);
    const vocabs = data.vocabs || [];
    if (vocabs.length === 0) {
      alert('Sổ tay này chưa có từ nào để ôn.');
      return;
    }

    reviewMode = 'sequence';
    reviewBucketLabel = '';
    reviewQueue = vocabs;
    currentReviewIndex = Number(data.currentIndex) || 0;
    showCurrentReview();
    openReviewModal();
  }

  async function startSRBucketReview(bucketKey) {
    const token = getToken();
    if (!token) {
      alert('Vui lòng đăng nhập để ôn tập và lưu tiến độ.');
      return;
    }

    const bucketConfig = {
      due_now: { label: 'Ôn tập ngay', random: true },
      due_1: { label: 'Ngày mai', random: false },
      due_3: { label: '3 ngày', random: false },
      due_7: { label: '7 ngày', random: false },
      due_14: { label: '14 ngày', random: false },
      mastered: { label: 'Nhớ sâu', random: true }
    };

    const config = bucketConfig[bucketKey];
    if (!config) return;

    const data = await apiRequest(`/repetition/items?bucket=${encodeURIComponent(bucketKey)}`);
    const vocabs = (data.vocabs || []).slice();

    if (config.random) {
      shuffleInPlace(vocabs);
    }

    reviewMode = 'bucket';
    reviewBucketLabel = config.label;
    reviewQueue = vocabs;
    currentReviewIndex = 0;

    if (reviewQueue.length === 0) {
      reviewWordEl.textContent = 'Không có từ vựng nào trong mục này';
      reviewPhoneticEl.textContent = '';
      reviewMeaningEl.textContent = '';
      reviewProgressEl.textContent = config.label;
      reviewHintEl.classList.add('hidden');
      reviewActionsEl.classList.add('hidden');
      openReviewModal();
      return;
    }

    showCurrentReview();
    openReviewModal();
  }

  async function submitReview(result) {
    const v = reviewQueue[currentReviewIndex];
    if (!v) return;
    if (!meaningRevealed) return;

    try {
      if (reviewMode === 'sequence') {
        const resp = await apiRequest(`/notebooks/${currentNotebookId}/review-step`, {
          method: 'POST',
          body: JSON.stringify({ vocab_id: Number(v.id), result })
        });
        currentReviewIndex = Number(resp.nextIndex) || 0;
        showCurrentReview();
      } else if (reviewMode === 'bucket') {
        await apiRequest('/review', {
          method: 'POST',
          body: JSON.stringify({ vocab_id: Number(v.id), result })
        });

        currentReviewIndex += 1;
        if (currentReviewIndex >= reviewQueue.length) {
          closeReviewModal();
        } else {
          showCurrentReview();
        }
      } else {
        await apiRequest('/review', {
          method: 'POST',
          body: JSON.stringify({ vocab_id: Number(v.id), result })
        });
        closeReviewModal();
      }

      if (currentNotebookId) {
        await loadVocabsForNotebook(currentNotebookId);
      }
      await loadSRSummary();
    } catch (err) {
      alert(err.message || 'Lỗi khi lưu tiến độ.');
    }
  }

  async function loadSRSummary() {
    try {
      const data = await apiRequest('/repetition/summary');
      srNow.textContent = data.due_now || 0;
      sr1.textContent = data.due_1 || 0;
      sr3.textContent = data.due_3 || 0;
      sr7.textContent = data.due_7 || 0;
      sr14.textContent = data.due_14 || 0;
      srMastered.textContent = data.mastered || 0;
    } catch (_err) {
      srNow.textContent = '-';
      sr1.textContent = '-';
      sr3.textContent = '-';
      sr7.textContent = '-';
      sr14.textContent = '-';
      srMastered.textContent = '-';
    }
  }

  function bindSRItem(el, bucketKey) {
    if (!el) return;
    el.addEventListener('click', async () => {
      try {
        await startSRBucketReview(bucketKey);
      } catch (err) {
        alert(err.message || 'Không thể bắt đầu phiên ôn.');
      }
    });
    el.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      try {
        await startSRBucketReview(bucketKey);
      } catch (err) {
        alert(err.message || 'Không thể bắt đầu phiên ôn.');
      }
    });
  }

  reviewCardEl.addEventListener('click', revealMeaning);
  closeReview.addEventListener('click', closeReviewModal);
  btnCorrect.addEventListener('click', () => submitReview('correct'));
  btnWrong.addEventListener('click', () => submitReview('wrong'));

  startReviewBtn.addEventListener('click', async () => {
    try {
      await startNotebookReviewSession();
    } catch (err) {
      alert(err.message || 'Không thể bắt đầu phiên ôn.');
    }
  });

  bindSRItem(srItemNow, 'due_now');
  bindSRItem(srItem1, 'due_1');
  bindSRItem(srItem3, 'due_3');
  bindSRItem(srItem7, 'due_7');
  bindSRItem(srItem14, 'due_14');
  bindSRItem(srItemMastered, 'mastered');

  reviewNowBtn.addEventListener('click', async () => {
    try {
      await startSRBucketReview('due_now');
    } catch (err) {
      alert(err.message || 'Không thể bắt đầu phiên ôn.');
    }
  });
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
