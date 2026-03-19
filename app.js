(function () {
  const HOME_STATE_KEY = 'ai-daily-home-state';
  const RESTORE_QUERY_KEY = 'restore';
  const DAILY_CATEGORY = '每日';
  const ALL_CATEGORY = '全部';
  const SEARCH_SORT_LABELS = {
    relevance: '相关性',
    'date-asc': '最旧',
    'date-desc': '最新'
  };

  const state = {
    allItems: [],
    categories: [DAILY_CATEGORY, ALL_CATEGORY],
    activeCategory: DAILY_CATEGORY,
    dayFiles: [],
    nextDayIndex: 0,
    visibleItemCount: 0,
    itemsPerLoad: 10,
    loading: false,
    restoreSnapshot: null,
    searchQuery: '',
    exactMatch: false,
    searchSort: 'relevance',
    visibleSearchResultCount: 10,
    visibleRelatedResultCount: 10,
    searchResults: [],
    relatedResults: [],
    searchReady: false,
    searchLoading: false,
    searchError: '',
    searchPromise: null,
    searchRunId: 0,
    searchDebounceId: 0
  };

  $.ajaxSetup({ cache: false });

  const $filters = $('#filters');
  const $list = $('#news');
  const $empty = $('#empty');
  const $loading = $('#loading');
  const $loadingText = $loading.find('.loading-text');
  const $searchInput = $('#search-input');
  const $searchSort = $('#search-sort');
  const $searchExact = $('#search-exact');
  const $searchClear = $('#search-clear');
  const $searchStatus = $('#search-status');
  const $searchSummary = $('#search-summary');

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
        loadedItemCount: Math.max(state.itemsPerLoad, Number(parsed.loadedItemCount) || 0),
        scrollY: Math.max(0, Number(parsed.scrollY) || 0),
        searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
        exactMatch: Boolean(parsed.exactMatch),
        visibleSearchResultCount: Math.max(state.itemsPerLoad, Number(parsed.visibleSearchResultCount) || state.itemsPerLoad),
        visibleRelatedResultCount: Math.max(state.itemsPerLoad, Number(parsed.visibleRelatedResultCount) || state.itemsPerLoad),
        searchSort: typeof parsed.searchSort === 'string' && SEARCH_SORT_LABELS[parsed.searchSort]
          ? parsed.searchSort
          : 'relevance'
      };
    } catch (error) {
      return null;
    }
  }

  function saveHomeState() {
    try {
      window.sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify({
        activeCategory: state.activeCategory,
        loadedItemCount: state.visibleItemCount || state.itemsPerLoad,
        scrollY: window.scrollY || window.pageYOffset || 0,
        searchQuery: state.searchQuery,
        exactMatch: state.exactMatch,
        visibleSearchResultCount: state.visibleSearchResultCount,
        visibleRelatedResultCount: state.visibleRelatedResultCount,
        searchSort: state.searchSort
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

  function isSearchMode() {
    return Boolean(state.searchQuery.trim());
  }

  function updateSearchStatus(message, tone) {
    $searchStatus
      .text(message || '')
      .removeClass('is-ready is-error');

    if (tone === 'ready') {
      $searchStatus.addClass('is-ready');
    } else if (tone === 'error') {
      $searchStatus.addClass('is-error');
    }
  }

  function updateSearchSummary(text) {
    if (!text) {
      $searchSummary.addClass('hidden').text('');
      return;
    }
    $searchSummary.removeClass('hidden').text(text);
  }

  function rebuildCategories() {
    state.categories = [DAILY_CATEGORY, ALL_CATEGORY].concat(AnalysisUtils.FIXED_CATEGORIES);
    if (!state.categories.includes(state.activeCategory)) {
      state.activeCategory = DAILY_CATEGORY;
    }
  }

  function renderFilters() {
    $filters.html(state.categories.map((name) => (
      `<button class="chip ${name === state.activeCategory ? 'active' : ''}" data-category="${name}">${name}</button>`
    )).join(''));
  }

  function escapeHtml(value) {
    return AnalysisUtils.escapeHtml(value);
  }

  function parseCategories(categoryString) {
    return AnalysisUtils.parseCategories(categoryString);
  }

  function itemHasCategory(item, targetCategory) {
    if (targetCategory === DAILY_CATEGORY || targetCategory === ALL_CATEGORY) {
      return true;
    }
    return parseCategories(item.category).includes(targetCategory);
  }

  function renderCategoryTags(categoryString) {
    const categories = parseCategories(categoryString);
    return categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join('');
  }

  function buildDetailLink(item) {
    return AnalysisUtils.buildDetailLink(item, 'index.html?restore=1');
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

    return dayGroups.map((group) => `
      <article class="day-card">
        <div class="day-card-header">
          <div>
            <div class="day-card-date">${escapeHtml(group.day)}</div>
            <div class="day-card-count">共 ${group.items.length} 条新闻</div>
          </div>
        </div>
        <div class="day-card-list">
          ${group.items.map((item) => `
            <section class="day-card-item">
              <h2><a href="${buildDetailLink(item)}" data-detail-link="1">${escapeHtml(item.title)}</a></h2>
              <div class="meta">
                <span>${escapeHtml(item.source)}</span>
                ${renderCategoryTags(item.category)}
              </div>
              <div>${escapeHtml(item.summary)}</div>
            </section>
          `).join('')}
        </div>
      </article>
    `).join('');
  }

  function renderItemNews(items) {
    return items.map((item) => `
      <article>
        <h2><a href="${buildDetailLink(item)}" data-detail-link="1">${escapeHtml(item.title)}</a></h2>
        <div class="meta">
          <span>${escapeHtml(item.date)}</span>
          <span>${escapeHtml(item.source)}</span>
          ${renderCategoryTags(item.category)}
        </div>
        <div>${escapeHtml(item.summary)}</div>
      </article>
    `).join('');
  }

  function getSearchFilteredItems(items) {
    if (state.activeCategory === DAILY_CATEGORY || state.activeCategory === ALL_CATEGORY) {
      return items;
    }
    return items.filter((item) => itemHasCategory(item, state.activeCategory));
  }

  function renderSearchCard(entry, kind, highlightTerms) {
    const item = entry.item;
    const sharedParts = [];

    if (kind === 'direct' && entry.matchedField) {
      const matchedFieldLabel = entry.matchedField === 'title'
        ? '标题命中'
        : (entry.matchedField === 'summary' ? '摘要命中' : '正文命中');
      sharedParts.push(`<span class="match-badge">${matchedFieldLabel}</span>`);
    }

    if (kind === 'related' && Array.isArray(entry.sharedTokens) && entry.sharedTokens.length) {
      sharedParts.push(`<span class="match-badge">共现词：${escapeHtml(entry.sharedTokens.slice(0, 3).join('、'))}</span>`);
    }

    if (kind === 'related' && Array.isArray(entry.sharedCategories) && entry.sharedCategories.length) {
      sharedParts.push(`<span class="match-badge">同类目：${escapeHtml(entry.sharedCategories.slice(0, 2).join('、'))}</span>`);
    }

    return `
      <article class="search-card">
        <div class="search-card-top">
          <div class="meta">
            <span>${escapeHtml(item.date)}</span>
            <span>${escapeHtml(item.source)}</span>
            ${renderCategoryTags(item.category)}
          </div>
          <div class="search-signals">${sharedParts.join('')}</div>
        </div>
        <h2><a href="${buildDetailLink(item)}" data-detail-link="1">${AnalysisUtils.highlightText(item.title, highlightTerms)}</a></h2>
        <div class="search-snippet">${AnalysisUtils.highlightText(entry.snippet || item.summary, highlightTerms)}</div>
      </article>
    `;
  }

  function renderSearchSection(title, description, entries, kind, highlightTerms) {
    const totalCount = entries.length;
    const visibleEntries = entries.slice(0, kind === 'direct' ? state.visibleSearchResultCount : state.visibleRelatedResultCount);
    const countLabel = visibleEntries.length < totalCount
      ? `${visibleEntries.length} / ${totalCount} 条`
      : `${totalCount} 条`;
    const loadMoreLabel = kind === 'direct' ? '加载更多搜索结果' : '加载更多相关新闻';

    return `
      <section class="search-section">
        <div class="search-section-head">
          <div>
            <h2>${escapeHtml(title)}</h2>
            <div class="search-section-sub">${escapeHtml(description)}</div>
          </div>
          <div class="search-section-count">${countLabel}</div>
        </div>
        <div class="search-section-list">
          ${visibleEntries.map((entry) => renderSearchCard(entry, kind, highlightTerms)).join('')}
        </div>
        ${visibleEntries.length < totalCount ? `
          <div class="search-section-actions">
            <button class="ghost-button" data-search-load-more="${kind}" type="button">${loadMoreLabel}</button>
          </div>
        ` : ''}
      </section>
    `;
  }

  function renderSearchLoading() {
    const progress = NewsStore.getProgress();
    $empty.addClass('hidden');
    $list.html(`
      <article class="search-placeholder">
        <h2>正在建立全量搜索索引</h2>
        <p>已加载 ${progress.loadedFiles}/${progress.totalFiles} 个新闻文件，稍后会显示完整历史结果。</p>
      </article>
    `);
  }

  function compareByRelevance(a, b) {
    if (a.score === b.score) {
      if (a.item.date === b.item.date) {
        return a.item.title.localeCompare(b.item.title, 'zh-Hans-CN');
      }
      return b.item.date.localeCompare(a.item.date);
    }
    return b.score - a.score;
  }

  function compareByDateAsc(a, b) {
    if (a.item.date === b.item.date) {
      if (a.score === b.score) {
        return a.item.title.localeCompare(b.item.title, 'zh-Hans-CN');
      }
      return b.score - a.score;
    }
    return a.item.date.localeCompare(b.item.date);
  }

  function compareByDateDesc(a, b) {
    if (a.item.date === b.item.date) {
      if (a.score === b.score) {
        return a.item.title.localeCompare(b.item.title, 'zh-Hans-CN');
      }
      return b.score - a.score;
    }
    return b.item.date.localeCompare(a.item.date);
  }

  function sortSearchEntries(entries) {
    const list = (entries || []).slice();
    if (state.searchSort === 'date-asc') {
      return list.sort(compareByDateAsc);
    }
    if (state.searchSort === 'date-desc') {
      return list.sort(compareByDateDesc);
    }
    return list.sort(compareByRelevance);
  }

  function resetSearchVisibleCounts() {
    state.visibleSearchResultCount = state.itemsPerLoad;
    state.visibleRelatedResultCount = state.itemsPerLoad;
  }

  function loadMoreSearchEntries(kind) {
    if (kind === 'direct') {
      const nextSearchCount = Math.min(state.searchResults.length, state.visibleSearchResultCount + state.itemsPerLoad);
      if (nextSearchCount === state.visibleSearchResultCount) {
        return;
      }
      state.visibleSearchResultCount = nextSearchCount;
    } else if (kind === 'related') {
      const nextRelatedCount = Math.min(state.relatedResults.length, state.visibleRelatedResultCount + state.itemsPerLoad);
      if (nextRelatedCount === state.visibleRelatedResultCount) {
        return;
      }
      state.visibleRelatedResultCount = nextRelatedCount;
    } else {
      return;
    }

    renderNews();
    saveHomeState();
  }

  function describeSearchSort(defaultDescription) {
    if (state.searchSort === 'date-asc') {
      return '当前按最旧优先展示，相关性分数仍用于筛选结果。';
    }
    if (state.searchSort === 'date-desc') {
      return '当前按最新优先展示，相关性分数仍用于筛选结果。';
    }
    return defaultDescription;
  }

  function renderSearchNews() {
    if (state.searchLoading && !state.searchReady && !state.searchError) {
      renderSearchLoading();
      return;
    }

    if (state.searchError) {
      $empty.addClass('hidden');
      $list.html(`
        <article class="search-placeholder is-error">
          <h2>搜索索引建立失败</h2>
          <p>${escapeHtml(state.searchError)}</p>
        </article>
      `);
      return;
    }

    const highlightTerms = AnalysisUtils.buildQueryProfile(state.searchQuery, state.exactMatch).highlightTerms;
    const sections = [];
    const searchResults = sortSearchEntries(state.searchResults);
    const relatedResults = sortSearchEntries(state.relatedResults);

    if (searchResults.length) {
      sections.push(renderSearchSection(
        '搜索结果',
        describeSearchSort(state.exactMatch ? '仅展示连续精确命中的历史新闻。' : '按关键词交集和字段权重排序。'),
        searchResults,
        'direct',
        highlightTerms
      ));
    }

    if (relatedResults.length) {
      sections.push(renderSearchSection(
        '相关新闻',
        describeSearchSort('基于共享高频词、分类与来源自动关联。'),
        relatedResults,
        'related',
        highlightTerms
      ));
    }

    if (!sections.length) {
      $list.empty();
      $empty.removeClass('hidden').text('没有找到符合条件的历史新闻，请尝试更换关键词或关闭精确匹配。');
      return;
    }

    $empty.addClass('hidden');
    $list.html(sections.join(''));
  }

  function renderNews() {
    if (isSearchMode()) {
      renderSearchNews();
      return;
    }

    const filtered = state.activeCategory === DAILY_CATEGORY || state.activeCategory === ALL_CATEGORY
      ? state.allItems
      : state.allItems.filter((item) => itemHasCategory(item, state.activeCategory));
    const visibleItems = filtered.slice(0, state.visibleItemCount);

    if (!visibleItems.length) {
      $list.empty();
      $empty.removeClass('hidden').text('当前分类暂无内容');
      return;
    }

    $empty.addClass('hidden');
    $list.html(
      state.activeCategory === DAILY_CATEGORY
        ? renderDailyNews(visibleItems)
        : renderItemNews(visibleItems)
    );
  }

  function rerenderAll() {
    rebuildCategories();
    renderFilters();
    renderNews();
  }

  function setLoadingState(mode) {
    if (isSearchMode()) {
      $loading.addClass('hidden').removeClass('is-complete');
      return;
    }

    if (mode === 'loading') {
      $loading.removeClass('hidden is-complete');
      $loadingText.text('继续加载中...');
      return;
    }

    if (mode === 'complete') {
      $loading.removeClass('hidden').addClass('is-complete');
      $loadingText.text('已加载全部新闻');
      return;
    }

    $loading.addClass('hidden').removeClass('is-complete');
    $loadingText.text('继续加载中...');
  }

  function updateVisibleItemCount(targetItemCount) {
    const normalizedTarget = Math.max(state.itemsPerLoad, Number(targetItemCount) || state.itemsPerLoad);
    state.visibleItemCount = Math.min(normalizedTarget, state.allItems.length);
  }

  function updateLoadingIndicator() {
    if (isSearchMode()) {
      setLoadingState('idle');
      return;
    }

    const allVisible = state.visibleItemCount >= state.allItems.length;
    const noMoreFiles = state.nextDayIndex >= state.dayFiles.length;

    if (state.loading) {
      setLoadingState('loading');
      return;
    }

    if (state.allItems.length > 0 && allVisible && noMoreFiles) {
      setLoadingState('complete');
      return;
    }

    setLoadingState('idle');
  }

  function mergeLoadedItems(nextItems) {
    const map = new Map();
    state.allItems.concat(nextItems).forEach((item) => {
      map.set(item.id, item);
    });
    state.allItems = Array.from(map.values()).sort((a, b) => {
      if (a.date === b.date) {
        return a.title.localeCompare(b.title, 'zh-Hans-CN');
      }
      return b.date.localeCompare(a.date);
    });
  }

  function loadOneDay(fileName) {
    return NewsStore.loadDayFile(fileName).then((items) => {
      mergeLoadedItems(items);
    });
  }

  function loadDaysUntil(targetItemCount) {
    if (state.allItems.length >= targetItemCount || state.nextDayIndex >= state.dayFiles.length) {
      return Promise.resolve();
    }

    const nextFile = state.dayFiles[state.nextDayIndex];
    state.nextDayIndex += 1;

    return loadOneDay(nextFile).then(() => loadDaysUntil(targetItemCount));
  }

  function loadMoreDays(targetItemCount) {
    if (state.loading || isSearchMode()) {
      return Promise.resolve();
    }

    if (state.allItems.length >= targetItemCount || state.nextDayIndex >= state.dayFiles.length) {
      updateVisibleItemCount(targetItemCount);
      rerenderAll();
      updateLoadingIndicator();
      return Promise.resolve();
    }

    state.loading = true;
    setLoadingState('loading');
    const itemCountTarget = Math.max(state.itemsPerLoad, Number(targetItemCount) || state.itemsPerLoad);

    return loadDaysUntil(itemCountTarget)
      .then(() => {
        updateVisibleItemCount(itemCountTarget);
        rerenderAll();
      })
      .catch(() => {
        $empty.removeClass('hidden').text('新闻数据加载失败，请检查 news/ 目录与 Markdown 格式。');
      })
      .finally(() => {
        state.loading = false;
        updateLoadingIndicator();
      });
  }

  function updateSearchStatusFromProgress() {
    const progress = NewsStore.getProgress();
    if (state.searchError) {
      updateSearchStatus(state.searchError, 'error');
      return;
    }
    if (state.searchReady) {
      updateSearchStatus('全量历史索引已就绪', 'ready');
      return;
    }
    updateSearchStatus(`正在建立全量历史索引（${progress.loadedFiles}/${progress.totalFiles}）`);
  }

  function refreshSearchSummary() {
    const query = state.searchQuery.trim();
    if (!query) {
      updateSearchSummary('');
      return;
    }

    const summaryParts = [`“${query}”`];
    if (state.exactMatch) {
      summaryParts.push('精确匹配');
    }
    if (state.activeCategory !== DAILY_CATEGORY && state.activeCategory !== ALL_CATEGORY) {
      summaryParts.push(state.activeCategory);
    }
    summaryParts.push(SEARCH_SORT_LABELS[state.searchSort] || SEARCH_SORT_LABELS.relevance);
    summaryParts.push(`直接命中 ${state.searchResults.length} 条`);
    summaryParts.push(`相关新闻 ${state.relatedResults.length} 条`);
    updateSearchSummary(summaryParts.join(' · '));
  }

  function ensureSearchIndex() {
    if (state.searchPromise) {
      return state.searchPromise;
    }

    state.searchLoading = true;
    updateSearchStatusFromProgress();

    state.searchPromise = NewsStore.preloadAll()
      .then((items) => {
        state.searchLoading = false;
        state.searchReady = true;
        state.searchError = '';
        updateSearchStatus('全量历史索引已就绪', 'ready');
        return items;
      })
      .catch(() => {
        state.searchLoading = false;
        state.searchReady = false;
        state.searchError = '全量新闻索引建立失败，请稍后重试。';
        state.searchPromise = null;
        updateSearchStatus(state.searchError, 'error');
        throw new Error(state.searchError);
      });

    return state.searchPromise;
  }

  function runSearch() {
    const query = state.searchQuery.trim();
    state.searchRunId += 1;
    const runId = state.searchRunId;

    if (!query) {
      resetSearchVisibleCounts();
      state.searchResults = [];
      state.relatedResults = [];
      state.searchError = '';
      updateSearchSummary('');
      rerenderAll();
      updateLoadingIndicator();
      return Promise.resolve();
    }

    state.searchLoading = true;
    updateSearchStatusFromProgress();
    renderNews();

    return ensureSearchIndex()
      .then((items) => {
        if (runId !== state.searchRunId) {
          return;
        }

        const queryProfile = AnalysisUtils.buildQueryProfile(state.searchQuery, state.exactMatch);
        const filteredItems = getSearchFilteredItems(items);

        state.searchResults = AnalysisUtils.rankSearchResults(filteredItems, queryProfile);
        state.relatedResults = AnalysisUtils.buildRelatedResults(filteredItems, state.searchResults, queryProfile, {
          limit: filteredItems.length
        });
        state.searchLoading = false;
        refreshSearchSummary();

        renderNews();
        updateLoadingIndicator();
      })
      .catch(() => {
        if (runId !== state.searchRunId) {
          return;
        }
        state.searchLoading = false;
        renderNews();
        updateLoadingIndicator();
      });
  }

  function scheduleSearch() {
    window.clearTimeout(state.searchDebounceId);
    state.searchDebounceId = window.setTimeout(() => {
      runSearch();
    }, 180);
  }

  function syncSearchControls() {
    $searchInput.val(state.searchQuery);
    $searchSort.val(state.searchSort);
    $searchExact.prop('checked', state.exactMatch);
  }

  function initScrollLoad() {
    $(window).on('scroll', function () {
      if (isSearchMode()) {
        return;
      }
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
      if (nearBottom) {
        const targetCount = state.allItems.length + state.itemsPerLoad;
        loadMoreDays(targetCount);
      }
    });
  }

  function initEvents() {
    $filters.on('click', 'button[data-category]', function () {
      state.activeCategory = $(this).data('category');
      renderFilters();
      if (isSearchMode()) {
        resetSearchVisibleCounts();
        runSearch();
      } else {
        renderNews();
        updateLoadingIndicator();
      }
    });

    $list.on('click', 'a[data-detail-link]', function () {
      saveHomeState();
    });

    $list.on('click', 'button[data-search-load-more]', function () {
      loadMoreSearchEntries(String($(this).data('search-load-more') || ''));
    });

    $searchInput.on('input', function () {
      state.searchQuery = String($(this).val() || '');
      resetSearchVisibleCounts();
      if (state.searchQuery.trim()) {
        ensureSearchIndex().catch(function () {});
      }
      scheduleSearch();
    });

    $searchExact.on('change', function () {
      state.exactMatch = Boolean($(this).is(':checked'));
      if (isSearchMode()) {
        resetSearchVisibleCounts();
        runSearch();
      }
    });

    $searchSort.on('change', function () {
      state.searchSort = String($(this).val() || 'relevance');
      if (isSearchMode()) {
        refreshSearchSummary();
        renderNews();
        saveHomeState();
      }
    });

    $searchClear.on('click', function () {
      resetSearchVisibleCounts();
      state.searchQuery = '';
      state.exactMatch = false;
      state.searchSort = 'relevance';
      syncSearchControls();
      updateSearchSummary('');
      runSearch();
    });

    window.addEventListener('newsstore:progress', function () {
      updateSearchStatusFromProgress();
      if (isSearchMode() && state.searchLoading && !state.searchReady) {
        renderNews();
      }
    });
  }

  function init() {
    const manifest = window.NEWS_MANIFEST;
    if (!manifest || !Array.isArray(manifest.files)) {
      $empty.removeClass('hidden').text('未找到 news/manifest.js 或格式不正确。');
      return;
    }

    state.dayFiles = NewsStore.getFiles();
    state.restoreSnapshot = shouldRestoreHomeState() ? readStoredHomeState() : null;
    if (state.restoreSnapshot) {
      state.activeCategory = state.restoreSnapshot.activeCategory;
      state.searchQuery = state.restoreSnapshot.searchQuery || '';
      state.exactMatch = Boolean(state.restoreSnapshot.exactMatch);
      state.visibleSearchResultCount = state.restoreSnapshot.visibleSearchResultCount || state.itemsPerLoad;
      state.visibleRelatedResultCount = state.restoreSnapshot.visibleRelatedResultCount || state.itemsPerLoad;
      state.searchSort = state.restoreSnapshot.searchSort || 'relevance';
    }

    initEvents();
    initScrollLoad();
    syncSearchControls();
    updateSearchStatusFromProgress();

    const initialLoadCount = state.restoreSnapshot
      ? Math.max(state.itemsPerLoad, state.restoreSnapshot.loadedItemCount)
      : state.itemsPerLoad;

    ensureSearchIndex().catch(function () {});

    loadMoreDays(initialLoadCount).then(() => {
      if (isSearchMode()) {
        runSearch().finally(() => {
          restoreHomeView();
        });
        return;
      }
      restoreHomeView();
    });
  }

  $(init);
})();
