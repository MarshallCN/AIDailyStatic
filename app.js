(function () {
  const HOME_STATE_KEY = 'ai-daily-home-state';
  const RESTORE_QUERY_KEY = 'restore';
  const DAILY_CATEGORY = '每日';
  const ALL_CATEGORY = '全部';

  const state = {
    allItems: [],
    categories: [DAILY_CATEGORY, ALL_CATEGORY],
    activeCategory: DAILY_CATEGORY,
    dayFiles: [],
    nextDayIndex: 0,
    daysPerLoad: 3,
    loading: false,
    restoreSnapshot: null,
    cacheVersion: (window.NEWS_MANIFEST && window.NEWS_MANIFEST.version) || String(Date.now())
  };

  $.ajaxSetup({ cache: false });

  const $filters = $('#filters');
  const $list = $('#news');
  const $empty = $('#empty');
  const $loading = $('#loading');

  function readStoredHomeState() {
    try {
      const raw = window.sessionStorage.getItem(HOME_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      return {
        activeCategory: typeof parsed.activeCategory === 'string' && parsed.activeCategory.trim()
          ? parsed.activeCategory.trim()
          : DAILY_CATEGORY,
        loadedDayCount: Math.max(state.daysPerLoad, Number(parsed.loadedDayCount) || 0),
        scrollY: Math.max(0, Number(parsed.scrollY) || 0)
      };
    } catch (error) {
      return null;
    }
  }

  function saveHomeState() {
    try {
      window.sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify({
        activeCategory: state.activeCategory,
        loadedDayCount: state.nextDayIndex || state.daysPerLoad,
        scrollY: window.scrollY || window.pageYOffset || 0
      }));
    } catch (error) {
      // Ignore sessionStorage failures and fall back to a normal navigation flow.
    }
  }

  function clearStoredHomeState() {
    try {
      window.sessionStorage.removeItem(HOME_STATE_KEY);
    } catch (error) {
      // Ignore sessionStorage failures.
    }
  }

  function shouldRestoreHomeState() {
    const params = new URLSearchParams(window.location.search);
    return params.get(RESTORE_QUERY_KEY) === '1';
  }

  function cleanRestoreParam() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;

    const url = new URL(window.location.href);
    url.searchParams.delete(RESTORE_QUERY_KEY);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, '', nextUrl || 'index.html');
  }

  function restoreHomeView() {
    if (!state.restoreSnapshot) {
      if (shouldRestoreHomeState()) cleanRestoreParam();
      return;
    }

    const snapshot = state.restoreSnapshot;
    state.restoreSnapshot = null;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, snapshot.scrollY);
        clearStoredHomeState();
        cleanRestoreParam();
      });
    });
  }

  function parseDayFromFile(fileName) {
    const m = fileName.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '1970-01-01';
  }

  function parseNewsMarkdown(raw, fallbackDay) {
    const dayMatch = raw.match(/^day:\s*(\d{4}-\d{2}-\d{2})\s*$/m);
    const day = dayMatch ? dayMatch[1] : fallbackDay;
    const blocks = raw
      .split(/\n##\s+/)
      .map((part, index) => (index === 0 ? part : `## ${part}`))
      .filter(part => part.startsWith('## '));

    const items = blocks.map((block) => {
      const titleMatch = block.match(/^##\s+(.+)$/m);
      const sourceMatch = block.match(/^-\s*source:\s*(.+)$/m);
      const dateMatch = block.match(/^-\s*date:\s*(.+)$/m);
      const categoryMatch = block.match(/^-\s*category:\s*(.+)$/m);
      const urlMatch = block.match(/^-\s*url:\s*(.+)$/m);
      const summaryMatch = block.match(/^-\s*summary:\s*(.+)$/m);

      return {
        title: titleMatch ? titleMatch[1].trim() : '无标题',
        source: sourceMatch ? sourceMatch[1].trim() : '未知来源',
        date: dateMatch ? dateMatch[1].trim() : day,
        category: categoryMatch ? categoryMatch[1].trim() : '其他',
        url: urlMatch ? urlMatch[1].trim() : '#',
        summary: summaryMatch ? summaryMatch[1].trim() : ''
      };
    });

    return { day, items };
  }

  function normalizeItems(day, items) {
    return (items || []).map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `${day}-${idx}`,
      day,
      title: item.title || '无标题',
      source: item.source || '未知来源',
      date: item.date || day,
      category: item.category || '其他',
      summary: item.summary || '',
      url: item.url || '#'
    }));
  }

  function rebuildCategories() {
    const set = new Set(state.allItems.map(item => item.category));
    state.categories = [DAILY_CATEGORY, ALL_CATEGORY, ...set];
    if (!state.categories.includes(state.activeCategory)) {
      state.activeCategory = DAILY_CATEGORY;
    }
  }

  function renderFilters() {
    $filters.html(state.categories.map(name => (
      `<button class="chip ${name === state.activeCategory ? 'active' : ''}" data-category="${name}">${name}</button>`
    )).join(''));
  }

  function buildDetailLink(item) {
    const params = new URLSearchParams({
      id: item.id || '',
      from: 'index.html?restore=1'
    });
    return `detail.html?${params.toString()}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function groupItemsByDay(items) {
    const groups = [];
    const map = new Map();

    items.forEach((item) => {
      const dayKey = item.day || item.date || '1970-01-01';
      if (!map.has(dayKey)) {
        const group = { day: dayKey, items: [] };
        map.set(dayKey, group);
        groups.push(group);
      }
      map.get(dayKey).items.push(item);
    });

    return groups;
  }

  function renderDailyNews(items) {
    const dayGroups = groupItemsByDay(items);

    return dayGroups.map(group => `
      <article class="day-card">
        <div class="day-card-header">
          <div>
            <div class="day-card-date">${escapeHtml(group.day)}</div>
            <div class="day-card-count">共 ${group.items.length} 条新闻</div>
          </div>
        </div>
        <div class="day-card-list">
          ${group.items.map(item => `
            <section class="day-card-item">
              <h2><a href="${buildDetailLink(item)}" data-detail-link="1">${escapeHtml(item.title)}</a></h2>
              <div class="meta">
                <span>${escapeHtml(item.source)}</span>
                <span class="tag">${escapeHtml(item.category)}</span>
              </div>
              <div>${escapeHtml(item.summary)}</div>
            </section>
          `).join('')}
        </div>
      </article>
    `).join('');
  }

  function renderItemNews(items) {
    return items.map(item => `
      <article>
        <h2><a href="${buildDetailLink(item)}" data-detail-link="1">${escapeHtml(item.title)}</a></h2>
        <div class="meta">
          <span>${escapeHtml(item.date)}</span>
          <span>${escapeHtml(item.source)}</span>
          <span class="tag">${escapeHtml(item.category)}</span>
        </div>
        <div>${escapeHtml(item.summary)}</div>
      </article>
    `).join('');
  }

  function renderNews() {
    const filtered = state.activeCategory === DAILY_CATEGORY || state.activeCategory === ALL_CATEGORY
      ? state.allItems
      : state.allItems.filter(item => item.category === state.activeCategory);

    if (!filtered.length) {
      $list.empty();
      $empty.removeClass('hidden');
      return;
    }

    $empty.addClass('hidden');
    $list.html(
      state.activeCategory === DAILY_CATEGORY
        ? renderDailyNews(filtered)
        : renderItemNews(filtered)
    );
  }

  function rerenderAll() {
    rebuildCategories();
    renderFilters();
    renderNews();
  }

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(state.cacheVersion)}`;
  }

  function loadOneDay(fileName) {
    return $.get(withCacheVersion(`news/${fileName}`)).then((rawMarkdown) => {
      const parsed = NewsParser.parseNewsMarkdown(rawMarkdown, NewsParser.parseDayFromFile(fileName));
      const normalized = NewsParser.normalizeItems(parsed.day, parsed.items);
      state.allItems = state.allItems.concat(normalized);
      state.allItems.sort((a, b) => {
        if (a.date === b.date) return a.title.localeCompare(b.title, 'zh-Hans-CN');
        return b.date.localeCompare(a.date);
      });
    });
  }

  function loadMoreDays(count) {
    if (state.loading || state.nextDayIndex >= state.dayFiles.length) {
      return $.Deferred().resolve().promise();
    }

    state.loading = true;
    $loading.removeClass('hidden');

    const batchSize = Math.max(1, Number(count) || state.daysPerLoad);
    const slice = state.dayFiles.slice(state.nextDayIndex, state.nextDayIndex + batchSize);
    const tasks = slice.map(loadOneDay);

    return $.when.apply($, tasks)
      .done(() => {
        state.nextDayIndex += slice.length;
        rerenderAll();
      })
      .fail(() => {
        $empty.removeClass('hidden').text('新闻数据加载失败，请检查 news/ 目录与 Markdown 格式。');
      })
      .always(() => {
        state.loading = false;
        if (state.nextDayIndex >= state.dayFiles.length) {
          $loading.addClass('hidden').text('已加载全部新闻');
        } else {
          $loading.addClass('hidden').text('正在加载更多新闻...');
        }
      });
  }

  function initScrollLoad() {
    $(window).on('scroll', function () {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
      if (nearBottom) loadMoreDays();
    });
  }

  function initEvents() {
    $filters.on('click', 'button[data-category]', function () {
      state.activeCategory = $(this).data('category');
      renderFilters();
      renderNews();
    });

    $list.on('click', 'a[data-detail-link]', function () {
      saveHomeState();
    });
  }

  function init() {
    const manifest = window.NEWS_MANIFEST;
    if (!manifest || !Array.isArray(manifest.files)) {
      $empty.removeClass('hidden').text('未找到 news/manifest.js 或格式不正确。');
      return;
    }

    const files = manifest.files.slice().sort((a, b) => NewsParser.parseDayFromFile(b).localeCompare(NewsParser.parseDayFromFile(a)));
    state.dayFiles = files;
    state.restoreSnapshot = shouldRestoreHomeState() ? readStoredHomeState() : null;
    if (state.restoreSnapshot) {
      state.activeCategory = state.restoreSnapshot.activeCategory;
    }
    initEvents();
    initScrollLoad();

    const initialLoadCount = state.restoreSnapshot
      ? Math.max(state.daysPerLoad, state.restoreSnapshot.loadedDayCount)
      : state.daysPerLoad;

    loadMoreDays(initialLoadCount).done(() => {
      restoreHomeView();
    });
  }

  $(init);
})();
