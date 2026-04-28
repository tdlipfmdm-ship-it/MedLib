const PDFJS_SOURCES = [
  {
    lib: new URL('./pdfjs/pdf.min.mjs', import.meta.url).toString(),
    worker: new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).toString(),
    label: 'local',
  },
  {
    lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs',
    label: 'jsdelivr',
  },
  {
    lib: 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs',
    worker: 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs',
    label: 'unpkg',
  },
];

const KEY_USERS = 'medlib_users_v1';
const KEY_SESSION = 'medlib_session_v1';
const ROLE_ORDER = { reader: 1, editor: 2, admin: 3 };
const AUTO_IMMERSIVE_DELAY_MS = 2000;
const EDGE_EXIT_THRESHOLD_PX = 8;
const HOVER_TRANSLATE_DELAY_MS = 360;
const TRANSLATE_LANG_TARGET = 'tk';
const TRANSLATE_LANG_TARGET_LABEL = 'Türkmençe';
const SITE_NAME = 'Lukmançylyk sanly kitaphanasy';
const TRANSLATE_ENDPOINTS = [
  'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&dj=1&tl=' +
    TRANSLATE_LANG_TARGET +
    '&q=',
  'https://translate.google.com/translate_a/single?client=gtx&sl=auto&dt=t&dj=1&tl=' +
    TRANSLATE_LANG_TARGET +
    '&q=',
  'https://clients5.google.com/translate_a/single?client=gtx&sl=auto&dt=t&dj=1&tl=' +
    TRANSLATE_LANG_TARGET +
    '&q=',
];
const TRANSLATE_TIMEOUT_MS = 4500;
const CONTINUOUS_EDGE_MARGIN_PX = 2;
const CONTINUOUS_SWITCH_COOLDOWN_MS = 260;
const CONTINUOUS_SWITCH_DELAY_MS = 24;
const SITE_CONFIG = window.MEDLIB_CONFIG || {};

const state = {
  pdfLib: null,
  pdfDoc: null,
  pageNum: 1,
  pageCount: 0,
  zoomFactor: 1,
  fitMode: 'width',
  renderingTask: null,
  currentBookId: '',
  mouseZoomBusy: false,
  pageTextCache: new Map(),
  searchQuery: '',
  searchNorm: '',
  matchIndexByPage: new Map(),
  searchResults: [],
  activeMatchIndex: -1,
  searchToken: 0,
  pendingActiveMatchScroll: false,
  immersiveMode: false,
  idleImmersiveTimer: null,
  autoImmersiveBound: false,
  hoverTextRects: [],
  hoverPageNum: 0,
  hoverItemId: '',
  hoverTimer: null,
  hoverTranslateRequestToken: 0,
  hoverTranslateLastPoint: { x: 0, y: 0 },
  translationCache: new Map(),
  panDragging: false,
  panPointerId: null,
  panStartClientX: 0,
  panStartClientY: 0,
  panStartScrollLeft: 0,
  panStartScrollTop: 0,
  renderRequestId: 0,
  continuousSwitchLockUntil: 0,
  continuousSwitchTimer: null,
  lastStageScrollTop: 0,
};

const el = {
  title: document.getElementById('readerTitle'),
  back: document.getElementById('backLink'),
  loading: document.getElementById('loadingBox'),
  error: document.getElementById('errorBox'),
  stage: document.getElementById('readerStage'),
  canvas: document.getElementById('pdfCanvas'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  pageInput: document.getElementById('pageInput'),
  pageCount: document.getElementById('pageCount'),
  zoomText: document.getElementById('zoomText'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  fitBtn: document.getElementById('fitBtn'),
  actualBtn: document.getElementById('actualBtn'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  prevMatchBtn: document.getElementById('prevMatchBtn'),
  nextMatchBtn: document.getElementById('nextMatchBtn'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  matchStat: document.getElementById('matchStat'),
  translateTip: document.getElementById('translateTip'),
};

function qs(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function clean(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function isPdfReaderEnabled() {
  return SITE_CONFIG.pdfReaderEnabled !== false;
}

function getPdfUnavailableText() {
  return (
    clean(SITE_CONFIG.pdfUnavailableText) ||
    'PDF faýllary GitHub wersiýasyna goşulmady. Katalog we kitap maglumatlary elýeterli.'
  );
}

function normalizeSearchText(v) {
  return clean(v).toLocaleLowerCase('tk-TM');
}

function setSearchStatus(active, total) {
  if (!el.matchStat) return;
  const current = total > 0 && active >= 0 ? active + 1 : 0;
  el.matchStat.textContent = `${current}/${total}`;

  const hasMatches = total > 0;
  if (el.prevMatchBtn) el.prevMatchBtn.disabled = !hasMatches;
  if (el.nextMatchBtn) el.nextMatchBtn.disabled = !hasMatches;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return '&#39;';
  });
}

function resetHoverTranslationState() {
  if (state.hoverTimer) {
    clearTimeout(state.hoverTimer);
    state.hoverTimer = null;
  }

  state.hoverTranslateRequestToken += 1;
  state.hoverTextRects = [];
  state.hoverPageNum = 0;
  state.hoverItemId = '';
  hideTranslateTooltip();
}

function hideTranslateTooltip() {
  if (!el.translateTip) return;
  el.translateTip.classList.add('hidden');
  el.translateTip.classList.remove('is-visible');
}

function positionTranslateTooltip(clientX, clientY) {
  if (!el.translateTip) return;

  const margin = 12;
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

  const tipW = el.translateTip.offsetWidth || 300;
  const tipH = el.translateTip.offsetHeight || 90;

  let left = clientX + margin;
  let top = clientY + margin;

  if (left + tipW > viewportW - 6) {
    left = Math.max(6, clientX - tipW - margin);
  }
  if (top + tipH > viewportH - 6) {
    top = Math.max(6, clientY - tipH - margin);
  }

  el.translateTip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function showTranslateTooltip(contentHtml, clientX, clientY) {
  if (!el.translateTip) return;

  el.translateTip.innerHTML = contentHtml;
  el.translateTip.classList.remove('hidden');
  positionTranslateTooltip(clientX, clientY);
  el.translateTip.classList.add('is-visible');
}

function cacheTranslation(key, value) {
  if (!key) return;
  if (state.translationCache.has(key)) {
    state.translationCache.delete(key);
  }
  state.translationCache.set(key, value);

  if (state.translationCache.size > 600) {
    const firstKey = state.translationCache.keys().next().value;
    if (firstKey) state.translationCache.delete(firstKey);
  }
}

function getCachedTranslation(key) {
  if (!key) return null;
  if (!state.translationCache.has(key)) return null;
  const value = state.translationCache.get(key);
  // LRU touch
  state.translationCache.delete(key);
  state.translationCache.set(key, value);
  return value;
}

function parseGoogleTranslatePayload(data) {
  if (data && typeof data === 'object' && Array.isArray(data.sentences)) {
    const translated = clean(
      data.sentences
        .map((sentence) => sentence?.trans || '')
        .join(' ')
        .trim()
    );
    const sourceLang = clean(data.src || '').toLowerCase();
    return {
      translated,
      sourceLang,
    };
  }

  if (Array.isArray(data) && Array.isArray(data[0])) {
    const translated = clean(
      data[0]
        .map((segment) => (Array.isArray(segment) ? segment[0] || '' : ''))
        .join(' ')
        .trim()
    );
    const sourceLang = clean(data[2] || '').toLowerCase();
    return {
      translated,
      sourceLang,
    };
  }

  return null;
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : TRANSLATE_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: ac.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function translateWithGoogle(text) {
  const query = clean(text);
  if (!query) return null;

  let lastErr = null;

  for (let i = 0; i < TRANSLATE_ENDPOINTS.length; i++) {
    const endpoint = TRANSLATE_ENDPOINTS[i];
    try {
      const data = await fetchJsonWithTimeout(endpoint + encodeURIComponent(query), TRANSLATE_TIMEOUT_MS);
      const parsed = parseGoogleTranslatePayload(data);
      if (parsed && parsed.translated) {
        return parsed;
      }
      lastErr = new Error('Boş terjime jogaby.');
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Terjime hyzmaty wagtlaýyn elýeterli däl.');
}

function clearIdleImmersiveTimer() {
  if (state.idleImmersiveTimer) {
    clearTimeout(state.idleImmersiveTimer);
    state.idleImmersiveTimer = null;
  }
}

function isPointerAtViewportEdge(x, y) {
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  if (w <= 0 || h <= 0) return false;
  return (
    x <= EDGE_EXIT_THRESHOLD_PX ||
    y <= EDGE_EXIT_THRESHOLD_PX ||
    x >= w - EDGE_EXIT_THRESHOLD_PX ||
    y >= h - EDGE_EXIT_THRESHOLD_PX
  );
}

function scheduleIdleImmersive() {
  clearIdleImmersiveTimer();
  if (state.immersiveMode || !state.pdfDoc) return;

  state.idleImmersiveTimer = setTimeout(() => {
    state.idleImmersiveTimer = null;
    if (state.immersiveMode || !state.pdfDoc) return;
    enterImmersiveMode().catch(handleError);
  }, AUTO_IMMERSIVE_DELAY_MS);
}

async function enterImmersiveMode() {
  if (state.immersiveMode || !state.pdfDoc) return;
  state.immersiveMode = true;
  document.body.classList.add('reader-immersive');
  clearIdleImmersiveTimer();

  if (state.fitMode === 'width') {
    await renderPage(state.pageNum, { scrollMode: 'preserve', silent: true });
  }
}

async function exitImmersiveMode() {
  if (!state.immersiveMode) return;
  state.immersiveMode = false;
  document.body.classList.remove('reader-immersive');

  if (state.fitMode === 'width') {
    await renderPage(state.pageNum, { scrollMode: 'preserve', silent: true });
  }

  scheduleIdleImmersive();
}

function bindAutoImmersiveMode() {
  if (state.autoImmersiveBound) return;
  state.autoImmersiveBound = true;

  window.addEventListener(
    'mousemove',
    (e) => {
      if (!state.pdfDoc) return;

      if (state.immersiveMode) {
        if (isPointerAtViewportEdge(e.clientX, e.clientY)) {
          exitImmersiveMode().catch(handleError);
        }
        return;
      }

      scheduleIdleImmersive();
    },
    { passive: true }
  );

  window.addEventListener(
    'pointerdown',
    () => {
      if (!state.pdfDoc || state.immersiveMode) return;
      scheduleIdleImmersive();
    },
    { passive: true }
  );

  window.addEventListener(
    'wheel',
    () => {
      if (!state.pdfDoc || state.immersiveMode) return;
      scheduleIdleImmersive();
    },
    { passive: true }
  );

  window.addEventListener('blur', clearIdleImmersiveTimer);
  window.addEventListener('focus', () => {
    if (!state.immersiveMode) scheduleIdleImmersive();
  });
}

function readJsonLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getMemberUser() {
  const session = readJsonLocal(KEY_SESSION, null);
  if (!session || !session.userId) return null;

  const users = readJsonLocal(KEY_USERS, []);
  if (!Array.isArray(users)) return null;

  const user = users.find((item) => item && item.id === session.userId) || null;
  if (!user) return null;

  const role = clean(user.role).toLowerCase();
  if (!ROLE_ORDER[role]) return null;
  return user;
}

function disableReaderControls() {
  clearIdleImmersiveTimer();
  resetHoverTranslationState();
  state.immersiveMode = false;
  document.body.classList.remove('reader-immersive');

  [
    el.prevBtn,
    el.nextBtn,
    el.pageInput,
    el.zoomInBtn,
    el.zoomOutBtn,
    el.fitBtn,
    el.actualBtn,
    el.searchInput,
    el.searchBtn,
    el.prevMatchBtn,
    el.nextMatchBtn,
    el.clearSearchBtn,
  ].forEach((control) => {
    if (control) control.disabled = true;
  });

  el.canvas.classList.add('hidden');
}

function ensureReaderMemberAccess() {
  const user = getMemberUser();
  if (user) return user;

  disableReaderControls();
  const loginHref = `login.html?next=${encodeURIComponent(location.href)}`;
  showError(
    `Bu bolumi dine agzalar okap bilyar. Dowam etmek ucin <a href="${loginHref}">giris edin</a>.`
  );
  el.title.textContent = 'Agza girisi gerek';
  document.title = `Agza girisi gerek | ${SITE_NAME}`;
  return null;
}

function showLoading(text) {
  el.loading.textContent = text || 'PDF açylýar...';
  el.loading.classList.remove('hidden');
  el.error.classList.add('hidden');
}

function showError(text) {
  el.error.innerHTML = text;
  el.error.classList.remove('hidden');
  el.loading.classList.add('hidden');
}

function hideInfoBoxes() {
  el.loading.classList.add('hidden');
  el.error.classList.add('hidden');
}

function buildCandidates() {
  const bookId = clean(qs('book'));
  const explicit = clean(qs('pdf'));
  const list = [];

  if (explicit) list.push(explicit);

  if (bookId) {
    list.push(`assets/pdfs/${bookId}.pdf`);
    list.push(`assets/files/${bookId}.pdf`);
    list.push(`files/${bookId}.pdf`);
    list.push(`books/files/${bookId}.pdf`);
  }

  // remove duplicates
  return [...new Set(list)];
}

async function loadPdfMap() {
  try {
    const res = await fetch('assets/pdf-map.json', { cache: 'no-cache' });
    if (!res.ok) return {};
    const data = await res.json();
    if (!data || typeof data !== 'object') return {};
    return data;
  } catch {
    return {};
  }
}

function buildCandidatesWithMap(pdfMap) {
  const bookId = clean(qs('book'));
  const explicit = clean(qs('pdf'));
  const list = [];

  if (explicit) list.push(explicit);

  if (bookId && pdfMap && typeof pdfMap[bookId] === 'string') {
    list.push(clean(pdfMap[bookId]));
  }

  if (bookId) {
    list.push(`BooksDB/${bookId}.pdf`);
  }

  // legacy fallbacks
  list.push(...buildCandidates());
  return [...new Set(list)];
}

function setBackLink() {
  const from = clean(qs('from'));
  const book = clean(qs('book'));
  if (from) {
    el.back.href = from;
    return;
  }
  if (book) {
    el.back.href = `books/${book}.html`;
    return;
  }
  el.back.href = 'index.html';
}

async function loadPdfJs() {
  for (const src of PDFJS_SOURCES) {
    try {
      const mod = await import(src.lib);
      if (mod && mod.GlobalWorkerOptions && mod.getDocument) {
        mod.GlobalWorkerOptions.workerSrc = src.worker;
        return mod;
      }
    } catch {
      // try next
    }
  }
  throw new Error('PDF.js ýükläp bolmady.');
}

async function openFirstAvailablePdf(candidates) {
  if (!candidates.length) {
    throw new Error(
      'PDF salgy görkezilmedi. Reader-iň işlemegi üçin URL-de <code>?book=ID</code> ýa-da <code>?pdf=path/to/file.pdf</code> gerek.'
    );
  }

  let lastErr = null;

  for (const url of candidates) {
    try {
      showLoading(`PDF açylýar: ${url}`);
      const task = state.pdfLib.getDocument({
        url,
        cMapPacked: true,
        isEvalSupported: false,
        disableFontFace: false,
      });

      const doc = await task.promise;
      return { url, doc };
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    `PDF tapylmady. Synanyşylan ýerler: <code>${candidates.join('</code>, <code>')}</code>. ${lastErr ? `Ýalňyş: ${clean(lastErr.message)}` : ''}`
  );
}

function resetSearchState() {
  state.matchIndexByPage = new Map();
  state.searchResults = [];
  state.activeMatchIndex = -1;
  state.pendingActiveMatchScroll = false;
  setSearchStatus(-1, 0);
}

function clearSearchInputAndMatches() {
  state.searchToken += 1;
  state.searchQuery = '';
  state.searchNorm = '';
  resetSearchState();
  if (el.searchInput) el.searchInput.value = '';
}

async function getTextContentForPage(pageNum, pageObj) {
  if (state.pageTextCache.has(pageNum)) {
    return state.pageTextCache.get(pageNum);
  }

  const page = pageObj || (await state.pdfDoc.getPage(pageNum));
  const textContent = await page.getTextContent();
  state.pageTextCache.set(pageNum, textContent);
  return textContent;
}

function buildPageMatchIndexes(textContent, queryNorm) {
  if (!textContent || !Array.isArray(textContent.items) || !queryNorm) return [];

  let composed = '';
  const charToItem = [];

  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i];
    const token = normalizeSearchText(item?.str || '');
    if (!token) continue;

    if (composed.length > 0) {
      composed += ' ';
      charToItem.push(-1);
    }

    for (let k = 0; k < token.length; k++) {
      composed += token.charAt(k);
      charToItem.push(i);
    }
  }

  if (!composed) return [];

  const found = [];
  let from = 0;
  while (from < composed.length) {
    const at = composed.indexOf(queryNorm, from);
    if (at < 0) break;

    const indexSet = new Set();
    const end = at + queryNorm.length;
    for (let i = at; i < end && i < charToItem.length; i++) {
      const itemIdx = charToItem[i];
      if (itemIdx >= 0) indexSet.add(itemIdx);
    }

    if (indexSet.size > 0) {
      found.push({ itemIndexes: Array.from(indexSet).sort((a, b) => a - b) });
    }

    from = at + 1;
  }

  return found;
}

function getItemViewportRect(item, viewport) {
  if (!item || !viewport || !state.pdfLib?.Util) return null;

  const tx = state.pdfLib.Util.transform(
    state.pdfLib.Util.transform(viewport.transform, item.transform),
    [1, 0, 0, -1, 0, 0]
  );

  let x = Number(tx[4]);
  let y = Number(tx[5]);
  let width = Number(item.width) * viewport.scale;
  let height = Math.hypot(tx[2], tx[3]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (!Number.isFinite(height) || height < 1) {
    height = Math.abs(Number(item.height) * viewport.scale) || 10;
  }

  if (!Number.isFinite(width) || width < 1) {
    const glyphScale = Math.hypot(tx[0], tx[1]) || Math.max(6, height * 0.45);
    width = Math.max(6, glyphScale * Math.max(1, clean(item.str).length * 0.58));
  }

  return {
    x: x - 1,
    y: y - 1,
    width: width + 2,
    height: height + 2,
  };
}

async function prepareHoverTextRects(pageNum, page, viewport) {
  const textContent = await getTextContentForPage(pageNum, page);
  const entries = [];

  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i];
    const text = clean(item?.str || '');
    if (!text) continue;

    const rect = getItemViewportRect(item, viewport);
    if (!rect) continue;

    entries.push({
      index: i,
      text,
      rect,
      midY: rect.y + rect.height / 2,
    });
  }

  state.hoverTextRects = entries;
  state.hoverPageNum = pageNum;
}

function findHoverTextEntry(clientX, clientY) {
  if (!state.hoverTextRects.length || state.hoverPageNum !== state.pageNum) return null;

  const stageRect = el.stage.getBoundingClientRect();
  const stageX = clientX - stageRect.left + el.stage.scrollLeft;
  const stageY = clientY - stageRect.top + el.stage.scrollTop;
  const pageX = stageX - el.canvas.offsetLeft;
  const pageY = stageY - el.canvas.offsetTop;

  for (let i = 0; i < state.hoverTextRects.length; i++) {
    const item = state.hoverTextRects[i];
    const r = item.rect;
    if (
      pageX >= r.x - 1 &&
      pageX <= r.x + r.width + 1 &&
      pageY >= r.y - 1 &&
      pageY <= r.y + r.height + 1
    ) {
      return item;
    }
  }

  return null;
}

function buildHoverPhrase(entry) {
  if (!entry) return '';

  const sameLine = [];
  const tolerance = Math.max(6, entry.rect.height * 0.78);

  for (let i = 0; i < state.hoverTextRects.length; i++) {
    const candidate = state.hoverTextRects[i];
    if (Math.abs(candidate.midY - entry.midY) <= tolerance) {
      sameLine.push(candidate);
    }
  }

  if (!sameLine.length) return entry.text;

  sameLine.sort((a, b) => a.rect.x - b.rect.x);
  const at = sameLine.findIndex((item) => item.index === entry.index);
  if (at < 0) return entry.text;

  const start = Math.max(0, at - 4);
  const end = Math.min(sameLine.length - 1, at + 4);
  const phrase = clean(
    sameLine
      .slice(start, end + 1)
      .map((item) => item.text)
      .join(' ')
  );

  if (!phrase) return entry.text;
  return phrase.length > 220 ? `${phrase.slice(0, 220)}...` : phrase;
}

async function resolveHoverTranslation(entry, clientX, clientY) {
  if (!entry || !state.pdfDoc) return;

  const phrase = clean(buildHoverPhrase(entry));
  if (phrase.length < 2) {
    hideTranslateTooltip();
    return;
  }

  const cacheKey = normalizeSearchText(phrase);
  const itemId = `${state.pageNum}:${entry.index}`;
  if (state.hoverItemId !== itemId) return;

  const cached = getCachedTranslation(cacheKey);
  if (cached) {
    if (state.hoverItemId !== itemId) return;
    if (
      cached.sourceLang.startsWith(TRANSLATE_LANG_TARGET) ||
      normalizeSearchText(cached.translated) === normalizeSearchText(phrase)
    ) {
      hideTranslateTooltip();
      return;
    }

    showTranslateTooltip(
      `<div class="tr-meta">${escapeHtml(cached.sourceLang || 'auto')} → ${escapeHtml(TRANSLATE_LANG_TARGET_LABEL)}</div>
       <div class="tr-src">${escapeHtml(phrase)}</div>
       <div class="tr-dst">${escapeHtml(cached.translated || '')}</div>`,
      clientX,
      clientY
    );
    return;
  }

  showTranslateTooltip(
    `<div class="tr-meta">Google Translate...</div><div class="tr-src">${escapeHtml(phrase)}</div>`,
    clientX,
    clientY
  );

  const token = ++state.hoverTranslateRequestToken;

  try {
    const result = await translateWithGoogle(phrase);
    if (token !== state.hoverTranslateRequestToken) return;
    if (state.hoverItemId !== itemId) return;
    if (!result || !result.translated) {
      hideTranslateTooltip();
      return;
    }

    const sourceLang = clean(result.sourceLang || '').toLowerCase();
    const translated = clean(result.translated || '');
    cacheTranslation(cacheKey, { sourceLang, translated });

    if (
      sourceLang.startsWith(TRANSLATE_LANG_TARGET) ||
      normalizeSearchText(translated) === normalizeSearchText(phrase)
    ) {
      hideTranslateTooltip();
      return;
    }

    showTranslateTooltip(
      `<div class="tr-meta">${escapeHtml(sourceLang || 'auto')} → ${escapeHtml(TRANSLATE_LANG_TARGET_LABEL)}</div>
       <div class="tr-src">${escapeHtml(phrase)}</div>
       <div class="tr-dst">${escapeHtml(translated)}</div>`,
      clientX,
      clientY
    );
  } catch (_err) {
    if (token !== state.hoverTranslateRequestToken) return;
    if (state.hoverItemId !== itemId) return;
    showTranslateTooltip(
      `<div class="tr-meta">Google Translate wagtlaýyn elýeterli däl.</div><div class="tr-src">${escapeHtml(phrase)}</div>`,
      clientX,
      clientY
    );
  }
}

function bindHoverTranslate() {
  if (!el.stage) return;

  el.stage.addEventListener(
    'mousemove',
    (e) => {
      if (state.panDragging) return;
      if (!state.pdfDoc || !state.hoverTextRects.length) return;

      state.hoverTranslateLastPoint = { x: e.clientX, y: e.clientY };
      const entry = findHoverTextEntry(e.clientX, e.clientY);
      if (!entry) {
        if (state.hoverTimer) {
          clearTimeout(state.hoverTimer);
          state.hoverTimer = null;
        }
        state.hoverItemId = '';
        state.hoverTranslateRequestToken += 1;
        hideTranslateTooltip();
        return;
      }

      const nextItemId = `${state.pageNum}:${entry.index}`;
      if (state.hoverItemId === nextItemId) {
        if (el.translateTip && !el.translateTip.classList.contains('hidden')) {
          positionTranslateTooltip(e.clientX, e.clientY);
        }
        return;
      }

      state.hoverItemId = nextItemId;
      state.hoverTranslateRequestToken += 1;
      if (state.hoverTimer) clearTimeout(state.hoverTimer);

      state.hoverTimer = setTimeout(() => {
        state.hoverTimer = null;
        resolveHoverTranslation(
          entry,
          state.hoverTranslateLastPoint.x,
          state.hoverTranslateLastPoint.y
        ).catch(() => {
          hideTranslateTooltip();
        });
      }, HOVER_TRANSLATE_DELAY_MS);
    },
    { passive: true }
  );

  el.stage.addEventListener(
    'mouseleave',
    () => {
      if (state.hoverTimer) {
        clearTimeout(state.hoverTimer);
        state.hoverTimer = null;
      }
      state.hoverItemId = '';
      state.hoverTranslateRequestToken += 1;
      hideTranslateTooltip();
    },
    { passive: true }
  );
}

function setPanCursor(active) {
  if (!el.canvas) return;
  if (active) {
    el.canvas.classList.add('is-grabbing');
    document.body.classList.add('reader-panning');
  } else {
    el.canvas.classList.remove('is-grabbing');
    document.body.classList.remove('reader-panning');
  }
}

function stopPanDrag() {
  if (!state.panDragging) return;
  state.panDragging = false;
  state.panPointerId = null;
  setPanCursor(false);
}

function bindPanDrag() {
  if (!el.canvas || !el.stage) return;

  el.canvas.addEventListener('pointerdown', (e) => {
    if (!state.pdfDoc) return;
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    state.panDragging = true;
    state.panPointerId = e.pointerId;
    state.panStartClientX = e.clientX;
    state.panStartClientY = e.clientY;
    state.panStartScrollLeft = el.stage.scrollLeft;
    state.panStartScrollTop = el.stage.scrollTop;

    if (state.hoverTimer) {
      clearTimeout(state.hoverTimer);
      state.hoverTimer = null;
    }
    state.hoverItemId = '';
    state.hoverTranslateRequestToken += 1;
    hideTranslateTooltip();
    setPanCursor(true);

    try {
      el.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer-capture errors
    }

    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!state.panDragging) return;
    if (state.panPointerId !== null && e.pointerId !== state.panPointerId) return;

    const dx = e.clientX - state.panStartClientX;
    const dy = e.clientY - state.panStartClientY;
    el.stage.scrollLeft = Math.max(0, state.panStartScrollLeft - dx);
    el.stage.scrollTop = Math.max(0, state.panStartScrollTop - dy);
    e.preventDefault();
  });

  const endPan = (e) => {
    if (!state.panDragging) return;
    if (
      state.panPointerId !== null &&
      e?.pointerId !== undefined &&
      e.pointerId !== state.panPointerId
    ) {
      return;
    }
    stopPanDrag();
  };

  window.addEventListener('pointerup', endPan, { passive: true });
  window.addEventListener('pointercancel', endPan, { passive: true });
  window.addEventListener('blur', stopPanDrag);
}

function buildMatchRectsForPage(pageNum, textContent, viewport) {
  const pageMatches = state.matchIndexByPage.get(pageNum) || [];
  if (!pageMatches.length) return [];

  const out = new Array(pageMatches.length).fill(null);
  for (let i = 0; i < pageMatches.length; i++) {
    const match = pageMatches[i];
    const rects = [];

    (match.itemIndexes || []).forEach((itemIdx) => {
      const item = textContent.items[itemIdx];
      const rect = getItemViewportRect(item, viewport);
      if (rect) rects.push(rect);
    });

    if (!rects.length) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    rects.forEach((r) => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    });

    out[i] = {
      rects,
      union: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  }

  return out;
}

async function drawSearchHighlights(pageNum, page, viewport, ctx, dpr) {
  if (!state.searchNorm) return null;

  const pageMatches = state.matchIndexByPage.get(pageNum) || [];
  if (!pageMatches.length) return null;

  const textContent = await getTextContentForPage(pageNum, page);
  const renderedMatches = buildMatchRectsForPage(pageNum, textContent, viewport);
  if (!renderedMatches.length || renderedMatches.every((m) => !m)) return null;

  const activeRef = state.searchResults[state.activeMatchIndex];
  const activePageMatchIndex =
    activeRef && activeRef.pageNum === pageNum ? activeRef.pageMatchIndex : -1;

  let activeRect = null;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (let i = 0; i < renderedMatches.length; i++) {
    const match = renderedMatches[i];
    if (!match) continue;
    const isActive = i === activePageMatchIndex;

    ctx.fillStyle = isActive ? 'rgba(255, 138, 0, 0.44)' : 'rgba(255, 235, 0, 0.34)';
    match.rects.forEach((rect) => {
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    });

    if (isActive) {
      ctx.strokeStyle = 'rgba(196, 92, 2, 0.95)';
      ctx.lineWidth = 1.2;
      match.rects.forEach((rect) => {
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      });
      activeRect = match.union;
    }
  }

  ctx.restore();
  return activeRect;
}

function scrollStageToRect(rect) {
  if (!rect) return;

  const margin = 26;
  const rectLeft = el.canvas.offsetLeft + rect.x;
  const rectTop = el.canvas.offsetTop + rect.y;
  const rectRight = rectLeft + rect.width;
  const rectBottom = rectTop + rect.height;

  const viewLeft = el.stage.scrollLeft;
  const viewTop = el.stage.scrollTop;
  const viewRight = viewLeft + el.stage.clientWidth;
  const viewBottom = viewTop + el.stage.clientHeight;

  if (rectLeft - margin < viewLeft) {
    el.stage.scrollLeft = Math.max(0, rectLeft - margin);
  } else if (rectRight + margin > viewRight) {
    el.stage.scrollLeft = Math.max(0, rectRight + margin - el.stage.clientWidth);
  }

  if (rectTop - margin < viewTop) {
    el.stage.scrollTop = Math.max(0, rectTop - margin);
  } else if (rectBottom + margin > viewBottom) {
    el.stage.scrollTop = Math.max(0, rectBottom + margin - el.stage.clientHeight);
  }
}

async function jumpToMatch(nextIndex, shouldScroll) {
  const total = state.searchResults.length;
  if (!total) {
    state.activeMatchIndex = -1;
    setSearchStatus(-1, 0);
    return;
  }

  let idx = nextIndex;
  if (idx < 0) idx = total - 1;
  if (idx >= total) idx = 0;

  state.activeMatchIndex = idx;
  state.pendingActiveMatchScroll = Boolean(shouldScroll);
  setSearchStatus(state.activeMatchIndex, total);

  const target = state.searchResults[idx];
  await renderPage(target.pageNum, { scrollMode: 'preserve' });
}

async function runSearch(rawQuery) {
  if (!state.pdfDoc) return;

  const queryNorm = normalizeSearchText(rawQuery);
  state.searchToken += 1;
  const token = state.searchToken;

  state.searchQuery = String(rawQuery || '');
  state.searchNorm = queryNorm;
  resetSearchState();

  if (!queryNorm) {
    hideInfoBoxes();
    await renderPage(state.pageNum);
    updateControls();
    return;
  }

  showLoading('Tekst gozlenyar...');

  for (let pageNum = 1; pageNum <= state.pageCount; pageNum++) {
    if (token !== state.searchToken) return;

    const page = await state.pdfDoc.getPage(pageNum);
    const textContent = await getTextContentForPage(pageNum, page);
    const pageMatches = buildPageMatchIndexes(textContent, queryNorm);

    if (pageMatches.length) {
      state.matchIndexByPage.set(pageNum, pageMatches);
      for (let i = 0; i < pageMatches.length; i++) {
        state.searchResults.push({ pageNum, pageMatchIndex: i });
      }
    }

    if (pageNum % 8 === 0 || pageNum === state.pageCount) {
      showLoading(`Tekst gozlenyar... ${pageNum}/${state.pageCount}`);
    }
  }

  hideInfoBoxes();
  setSearchStatus(-1, state.searchResults.length);

  if (!state.searchResults.length) {
    state.activeMatchIndex = -1;
    await renderPage(state.pageNum);
    updateControls();
    return;
  }

  await jumpToMatch(0, true);
  updateControls();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function getPageScale(page) {
  const rawViewport = page.getViewport({ scale: 1 });
  const stageWidth = Math.max(240, el.stage.clientWidth - 24);
  const base = state.fitMode === 'width' ? stageWidth / rawViewport.width : 1;
  return clamp(base * state.zoomFactor, 0.3, 4.5);
}

function isStageNearTop(margin = 2) {
  return el.stage.scrollTop <= Math.max(0, Number(margin) || 0);
}

function isStageNearBottom(margin = 2) {
  const edge = Math.max(0, Number(margin) || 0);
  return el.stage.scrollTop + el.stage.clientHeight >= el.stage.scrollHeight - edge;
}

function shouldTurnPageOnWheel(deltaY) {
  const canScroll = el.stage.scrollHeight > el.stage.clientHeight + 2;
  if (!canScroll) return true;
  if (deltaY > 0) return isStageNearBottom(CONTINUOUS_EDGE_MARGIN_PX);
  return isStageNearTop(CONTINUOUS_EDGE_MARGIN_PX);
}

function applyPageTurnScroll(scrollMode) {
  if (scrollMode === 'bottom' || scrollMode === 'bottom-continuous') {
    el.stage.scrollLeft = 0;
    el.stage.scrollTop = Math.max(0, el.stage.scrollHeight - el.stage.clientHeight);
    return;
  }

  if (scrollMode === 'top-continuous') {
    el.stage.scrollLeft = 0;
    el.stage.scrollTop = 0;
    return;
  }

  if (scrollMode === 'preserve') return;
  // 'top' or default
  el.stage.scrollTop = 0;
  el.stage.scrollLeft = 0;
}

function clearContinuousSwitchTimer() {
  if (!state.continuousSwitchTimer) return;
  clearTimeout(state.continuousSwitchTimer);
  state.continuousSwitchTimer = null;
}

function canRunContinuousSwitch() {
  return Date.now() >= Number(state.continuousSwitchLockUntil || 0);
}

function lockContinuousSwitchWindow() {
  state.continuousSwitchLockUntil = Date.now() + CONTINUOUS_SWITCH_COOLDOWN_MS;
}

function queueContinuousPageSwitch(direction, source = 'wheel') {
  if (!state.pdfDoc || state.panDragging) return;
  const dir = direction > 0 ? 1 : -1;
  if (dir === 0) return;
  if (!canRunContinuousSwitch()) return;

  const nextPage = clamp(state.pageNum + dir, 1, state.pageCount);
  if (nextPage === state.pageNum) return;

  clearContinuousSwitchTimer();
  lockContinuousSwitchWindow();

  state.continuousSwitchTimer = setTimeout(() => {
    state.continuousSwitchTimer = null;
    if (!state.pdfDoc) return;
    const mode = dir > 0 ? 'top-continuous' : 'bottom-continuous';
    renderPage(nextPage, { scrollMode: mode, silent: true, source }).catch(handleError);
  }, CONTINUOUS_SWITCH_DELAY_MS);
}

async function renderPage(pageNum, options = {}) {
  if (!state.pdfDoc) return;

  const prevPage = state.pageNum;
  const target = clamp(pageNum, 1, state.pageCount);
  const pageChanged = target !== prevPage;
  const scrollMode =
    clean(options.scrollMode) || (pageChanged && !state.pendingActiveMatchScroll ? 'top' : 'preserve');
  const silent = Boolean(options.silent);
  const requestId = ++state.renderRequestId;

  state.pageNum = target;
  state.hoverItemId = '';
  state.hoverTranslateRequestToken += 1;
  hideTranslateTooltip();

  if (state.renderingTask) {
    try {
      state.renderingTask.cancel();
    } catch {
      // ignore
    }
    state.renderingTask = null;
  }

  if (!silent) {
    showLoading('Sahypa çyzylýar...');
  } else {
    hideInfoBoxes();
  }

  const page = await state.pdfDoc.getPage(target);
  if (requestId !== state.renderRequestId) return;
  const scale = await getPageScale(page);
  if (requestId !== state.renderRequestId) return;
  const viewport = page.getViewport({ scale });
  const dpr = window.devicePixelRatio || 1;

  const canvas = el.canvas;
  const ctx = canvas.getContext('2d', { alpha: false });

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    enableWebGL: false,
  });

  state.renderingTask = renderTask;

  try {
    await renderTask.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException') {
      throw e;
    }
    return;
  }

  if (state.renderingTask === renderTask) {
    state.renderingTask = null;
  }
  if (requestId !== state.renderRequestId) return;

  if (pageChanged && !state.pendingActiveMatchScroll) {
    applyPageTurnScroll(scrollMode);
  }

  await prepareHoverTextRects(target, page, viewport);
  if (requestId !== state.renderRequestId) return;

  const activeRect = await drawSearchHighlights(target, page, viewport, ctx, dpr);
  if (requestId !== state.renderRequestId) return;
  if (activeRect && state.pendingActiveMatchScroll) {
    scrollStageToRect(activeRect);
  }
  state.pendingActiveMatchScroll = false;

  hideInfoBoxes();
  updateControls();
  state.lastStageScrollTop = el.stage.scrollTop;
}

function updateControls() {
  el.pageInput.value = String(state.pageNum || 1);
  el.pageCount.textContent = `/ ${state.pageCount || 0}`;
  el.prevBtn.disabled = state.pageNum <= 1;
  el.nextBtn.disabled = state.pageNum >= state.pageCount;

  const zoomPercent = Math.round((state.zoomFactor || 1) * 100);
  el.zoomText.textContent = `${zoomPercent}%`;

  el.fitBtn.disabled = state.fitMode === 'width';
  el.actualBtn.disabled = state.fitMode === 'actual';

  if (el.searchBtn) el.searchBtn.disabled = !state.pdfDoc;
  if (el.clearSearchBtn) el.clearSearchBtn.disabled = !state.searchNorm;
}

function setReaderTitle(pdfUrl) {
  const title = clean(qs('title'));
  if (title) {
    el.title.textContent = title;
    document.title = `${title} | ${SITE_NAME}`;
    return;
  }

  if (state.currentBookId) {
    el.title.textContent = `Kitap ${state.currentBookId}`;
    document.title = `Kitap ${state.currentBookId} | ${SITE_NAME}`;
    return;
  }

  el.title.textContent = clean(pdfUrl) || 'PDF okyjy';
  document.title = `${el.title.textContent} | ${SITE_NAME}`;
}

async function zoomAroundPoint(deltaY, clientX, clientY) {
  if (!state.pdfDoc) return;

  const oldWidth = parseFloat(el.canvas.style.width) || el.canvas.clientWidth || 1;
  const oldHeight = parseFloat(el.canvas.style.height) || el.canvas.clientHeight || 1;
  const rect = el.stage.getBoundingClientRect();
  const pointerX = clientX - rect.left;
  const pointerY = clientY - rect.top;
  const anchorX = pointerX + el.stage.scrollLeft;
  const anchorY = pointerY + el.stage.scrollTop;

  const factor = deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextZoom = clamp(state.zoomFactor * factor, 0.3, 4.5);
  if (Math.abs(nextZoom - state.zoomFactor) < 0.0001) return;

  state.zoomFactor = nextZoom;
  await renderPage(state.pageNum, { scrollMode: 'preserve', silent: true });

  const newWidth = parseFloat(el.canvas.style.width) || el.canvas.clientWidth || oldWidth;
  const newHeight = parseFloat(el.canvas.style.height) || el.canvas.clientHeight || oldHeight;
  const ratioX = newWidth / oldWidth;
  const ratioY = newHeight / oldHeight;

  el.stage.scrollLeft = Math.max(0, anchorX * ratioX - pointerX);
  el.stage.scrollTop = Math.max(0, anchorY * ratioY - pointerY);
}

function bindControls() {
  bindAutoImmersiveMode();
  bindHoverTranslate();
  bindPanDrag();

  el.prevBtn.addEventListener('click', () => {
    if (state.pageNum > 1) renderPage(state.pageNum - 1, { scrollMode: 'bottom' }).catch(handleError);
  });

  el.nextBtn.addEventListener('click', () => {
    if (state.pageNum < state.pageCount) renderPage(state.pageNum + 1, { scrollMode: 'top' }).catch(handleError);
  });

  el.pageInput.addEventListener('change', () => {
    const next = Number(el.pageInput.value || 1);
    if (Number.isFinite(next)) {
      renderPage(next, { scrollMode: 'top' }).catch(handleError);
    }
  });

  el.pageInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = Number(el.pageInput.value || 1);
    if (Number.isFinite(next)) {
      renderPage(next, { scrollMode: 'top' }).catch(handleError);
    } else {
      el.pageInput.value = String(state.pageNum || 1);
    }
  });

  el.zoomInBtn.addEventListener('click', () => {
    state.zoomFactor = clamp(state.zoomFactor * 1.12, 0.3, 4.5);
    renderPage(state.pageNum, { scrollMode: 'preserve', silent: true }).catch(handleError);
  });

  el.zoomOutBtn.addEventListener('click', () => {
    state.zoomFactor = clamp(state.zoomFactor / 1.12, 0.3, 4.5);
    renderPage(state.pageNum, { scrollMode: 'preserve', silent: true }).catch(handleError);
  });

  el.fitBtn.addEventListener('click', () => {
    state.fitMode = 'width';
    state.zoomFactor = 1;
    renderPage(state.pageNum, { scrollMode: 'preserve', silent: true }).catch(handleError);
  });

  el.actualBtn.addEventListener('click', () => {
    state.fitMode = 'actual';
    state.zoomFactor = 1;
    renderPage(state.pageNum, { scrollMode: 'preserve', silent: true }).catch(handleError);
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.fitMode === 'width') {
        renderPage(state.pageNum, { scrollMode: 'preserve', silent: true }).catch(handleError);
      }
    }, 140);
  });

  const handleStageWheel = (e) => {
    if (!state.pdfDoc) return;

    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      if (state.mouseZoomBusy) return;
      state.mouseZoomBusy = true;
      zoomAroundPoint(e.deltaY, e.clientX, e.clientY)
        .catch(handleError)
        .finally(() => {
          state.mouseZoomBusy = false;
        });
      return;
    }

    // Mouse wheel without modifiers: smooth in-page scroll + edge-based continuous page switch
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      if (shouldTurnPageOnWheel(e.deltaY)) {
        e.preventDefault();
        const direction = e.deltaY > 0 ? 1 : -1;
        queueContinuousPageSwitch(direction, 'wheel');
      }
    }
  };

  const handleStageScroll = () => {
    if (!state.pdfDoc || state.panDragging) return;

    const currentTop = el.stage.scrollTop;
    const delta = currentTop - state.lastStageScrollTop;
    state.lastStageScrollTop = currentTop;

    if (Math.abs(delta) < 1) return;
    if (Math.abs(el.stage.scrollHeight - el.stage.clientHeight) <= 2) return;

    if (delta > 0 && isStageNearBottom(CONTINUOUS_EDGE_MARGIN_PX)) {
      queueContinuousPageSwitch(1, 'scroll');
      return;
    }

    if (delta < 0 && isStageNearTop(CONTINUOUS_EDGE_MARGIN_PX)) {
      queueContinuousPageSwitch(-1, 'scroll');
      return;
    }
  };

  el.stage.addEventListener('wheel', handleStageWheel, { passive: false });
  el.stage.addEventListener(
    'scroll',
    () => {
      if (!state.pdfDoc) return;
      handleStageScroll();
    },
    { passive: true }
  );

  el.stage.addEventListener(
    'pointerenter',
    () => {
      state.lastStageScrollTop = el.stage.scrollTop;
    },
    { passive: true }
  );

  el.stage.addEventListener(
    'touchstart',
    () => {
      state.lastStageScrollTop = el.stage.scrollTop;
    },
    { passive: true }
  );

  window.addEventListener(
    'blur',
    () => {
      clearContinuousSwitchTimer();
    },
    { passive: true }
  );

  el.canvas.addEventListener('dblclick', (e) => {
    if (!state.pdfDoc) return;
    if (state.mouseZoomBusy) return;
    state.mouseZoomBusy = true;
    zoomAroundPoint(-1, e.clientX, e.clientY)
      .catch(handleError)
      .finally(() => {
        state.mouseZoomBusy = false;
      });
  });

  if (el.searchBtn) {
    el.searchBtn.addEventListener('click', () => {
      runSearch(el.searchInput?.value || '').catch(handleError);
    });
  }

  if (el.searchInput) {
    el.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch(el.searchInput.value || '').catch(handleError);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        clearSearchInputAndMatches();
        renderPage(state.pageNum).catch(handleError);
        return;
      }
    });
  }

  if (el.nextMatchBtn) {
    el.nextMatchBtn.addEventListener('click', () => {
      if (!state.searchResults.length) {
        runSearch(el.searchInput?.value || '').catch(handleError);
        return;
      }
      jumpToMatch(state.activeMatchIndex + 1, true).catch(handleError);
    });
  }

  if (el.prevMatchBtn) {
    el.prevMatchBtn.addEventListener('click', () => {
      if (!state.searchResults.length) {
        runSearch(el.searchInput?.value || '').catch(handleError);
        return;
      }
      jumpToMatch(state.activeMatchIndex - 1, true).catch(handleError);
    });
  }

  if (el.clearSearchBtn) {
    el.clearSearchBtn.addEventListener('click', () => {
      clearSearchInputAndMatches();
      renderPage(state.pageNum).catch(handleError);
    });
  }

  window.addEventListener('keydown', (e) => {
    const key = String(e.key || '').toLowerCase();
    const activeEl = document.activeElement;
    const activeTag = String(activeEl?.tagName || '').toLowerCase();
    const isTypingContext =
      activeEl &&
      (activeEl.isContentEditable || activeTag === 'textarea' || activeTag === 'input');

    if ((e.ctrlKey || e.metaKey) && key === 'f') {
      e.preventDefault();
      if (el.searchInput) {
        el.searchInput.focus();
        el.searchInput.select();
      }
      return;
    }

    if (key === 'f3') {
      e.preventDefault();
      if (e.shiftKey) {
        jumpToMatch(state.activeMatchIndex - 1, true).catch(handleError);
      } else {
        jumpToMatch(state.activeMatchIndex + 1, true).catch(handleError);
      }
      return;
    }

    if (isTypingContext) return;

    if (key === 'arrowright' || key === 'pagedown') {
      e.preventDefault();
      renderPage(state.pageNum + 1, { scrollMode: 'top' }).catch(handleError);
      return;
    }

    if (key === 'arrowleft' || key === 'pageup') {
      e.preventDefault();
      renderPage(state.pageNum - 1, { scrollMode: 'bottom' }).catch(handleError);
      return;
    }

    if (key === 'home') {
      e.preventDefault();
      renderPage(1, { scrollMode: 'top' }).catch(handleError);
      return;
    }

    if (key === 'end') {
      e.preventDefault();
      renderPage(state.pageCount, { scrollMode: 'bottom' }).catch(handleError);
    }
  });
}

function blockRestrictedActions() {
  const blockedKeys = new Set(['s', 'p', 'c', 'x', 'u']);

  window.addEventListener('keydown', (e) => {
    const key = String(e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && blockedKeys.has(key)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (key === 'printscreen' || key === 'f12') {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach((eventName) => {
    document.addEventListener(eventName, (e) => {
      e.preventDefault();
    });
  });

  window.addEventListener('beforeprint', (e) => {
    e.preventDefault?.();
    showError('Çap etmek bu readerde ýapyk.');
  });
}

function handleError(err) {
  const msg = clean(err?.message || err || 'Näbelli ýalňyşlyk.');
  showError(msg);
  console.error(err);
}

async function init() {
  blockRestrictedActions();
  setBackLink();

  if (!isPdfReaderEnabled()) {
    if (el.title) el.title.textContent = 'PDF okyjy ýapyk';
    showError(getPdfUnavailableText());
    updateControls();
    return;
  }

  if (!ensureReaderMemberAccess()) return;
  bindControls();

  const book = clean(qs('book'));
  state.currentBookId = book;

  showLoading('PDF kitaphanasy ýükläp dur...');
  state.pdfLib = await loadPdfJs();

  const pdfMap = await loadPdfMap();
  const candidates = buildCandidatesWithMap(pdfMap);
  const { url, doc } = await openFirstAvailablePdf(candidates);

  state.pdfDoc = doc;
  state.pageCount = doc.numPages || 0;
  state.pageNum = 1;
  state.pageTextCache = new Map();
  clearSearchInputAndMatches();

  setReaderTitle(url);
  updateControls();
  await renderPage(1);
  scheduleIdleImmersive();
}

init().catch(handleError);
