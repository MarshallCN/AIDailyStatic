(function () {
  const PRESETS = [
    { id: '3d', label: '最近 3 天', days: 3 },
    { id: '7d', label: '最近 7 天', days: 7 },
    { id: '14d', label: '最近 14 天', days: 14 },
    { id: 'all', label: '全部', days: 0 }
  ];

  const WORDCLOUD_FONT_FAMILY = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Source Han Sans SC", sans-serif';

  const state = {
    allItems: [],
    days: [],
    preset: '7d',
    startDate: '',
    endDate: '',
    category: '全部分类',
    minFrequency: 2,
    selectedTerm: '',
    visibleTerms: [],
    termMap: new Map(),
    visibleRelatedItemCount: 10,
    fontsReady: false,
    loadSeq: 0
  };

  const $summary = document.getElementById('wc-summary');
  const $empty = document.getElementById('wc-empty');
  const $cloudMeta = document.getElementById('wc-cloud-meta');
  const $canvas = document.getElementById('wordcloud-canvas');
  const $detail = document.getElementById('wc-detail');
  const $startDate = document.getElementById('wc-start-date');
  const $endDate = document.getElementById('wc-end-date');
  const $presets = document.getElementById('wc-presets');
  const $categories = document.getElementById('wc-categories');
  const $minFrequency = document.getElementById('wc-min-frequency');
  const $minFrequencyValue = document.getElementById('wc-min-frequency-value');
  const $fullscreenToggle = document.getElementById('wc-fullscreen-toggle');

  function waitForWordCloudFonts() {
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }

    return Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 2500))
    ]).catch(() => undefined);
  }

  function escapeHtml(value) {
    return AnalysisUtils.escapeHtml(value);
  }

  function getCurrentPage() {
    const fileName = window.location.pathname.split('/').pop();
    return fileName || 'wordcloud.html';
  }

  function getPresetRange(presetId) {
    const preset = PRESETS.find((entry) => entry.id === presetId) || PRESETS[1];
    if (!state.days.length) {
      return { startDate: '', endDate: '' };
    }
    if (!preset.days) {
      return {
        startDate: state.days[state.days.length - 1],
        endDate: state.days[0]
      };
    }
    const endDate = state.days[0];
    const startIndex = Math.min(state.days.length - 1, preset.days - 1);
    return {
      startDate: state.days[startIndex],
      endDate: endDate
    };
  }

  function syncControls() {
    $startDate.value = state.startDate;
    $endDate.value = state.endDate;
    $minFrequency.value = String(state.minFrequency);
    $minFrequencyValue.textContent = String(state.minFrequency);
  }

  function renderPresetButtons() {
    $presets.innerHTML = PRESETS.map((preset) => `
      <button class="chip ${preset.id === state.preset ? 'active' : ''}" data-preset="${preset.id}" type="button">${preset.label}</button>
    `).join('');
  }

  function renderCategoryChips() {
    const categories = ['全部分类'].concat(AnalysisUtils.FIXED_CATEGORIES);
    $categories.innerHTML = categories.map((category) => `
      <button class="chip ${category === state.category ? 'active' : ''}" data-category="${category}" type="button">${category}</button>
    `).join('');
  }

  function populateDateOptions() {
    const options = state.days.map((day) => `<option value="${day}">${day}</option>`).join('');
    $startDate.innerHTML = options;
    $endDate.innerHTML = options;
  }

  function setPreset(presetId) {
    state.preset = presetId;
    const range = getPresetRange(presetId);
    state.startDate = range.startDate;
    state.endDate = range.endDate;
    syncControls();
    renderPresetButtons();
  }

  function normalizeDateRange() {
    if (state.startDate && state.endDate && state.startDate > state.endDate) {
      const nextStart = state.endDate;
      state.endDate = state.startDate;
      state.startDate = nextStart;
    }
  }

  function getFilteredItems() {
    return AnalysisUtils.filterItems(state.allItems, {
      startDate: state.startDate,
      endDate: state.endDate,
      category: state.category
    });
  }

  function resetVisibleRelatedItems() {
    state.visibleRelatedItemCount = 10;
  }

  function getRelatedItems(termEntry, filteredItems) {
    if (!termEntry) {
      return [];
    }

    const itemMap = new Map(filteredItems.map((item) => [item.id, item]));
    return termEntry.articleIds
      .map((id) => itemMap.get(id))
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function hasMoreRelatedItems() {
    const termEntry = state.termMap.get(state.selectedTerm);
    const relatedItems = getRelatedItems(termEntry, getFilteredItems());
    return state.visibleRelatedItemCount < relatedItems.length;
  }

  function loadMoreRelatedItems() {
    const filteredItems = getFilteredItems();
    const termEntry = state.termMap.get(state.selectedTerm);
    const relatedItems = getRelatedItems(termEntry, filteredItems);
    const nextCount = Math.min(relatedItems.length, state.visibleRelatedItemCount + 10);

    if (nextCount === state.visibleRelatedItemCount) {
      return;
    }

    state.visibleRelatedItemCount = nextCount;
    renderDetailPanel(termEntry, filteredItems);
  }

  function renderDetailPanel(termEntry, filteredItems) {
    if (!termEntry) {
      $detail.innerHTML = '<div class="term-placeholder">当前词云中没有可展示的词条。</div>';
      return;
    }

    const relatedItems = getRelatedItems(termEntry, filteredItems);
    const visibleRelatedItems = relatedItems.slice(0, state.visibleRelatedItemCount);
    const countLabel = visibleRelatedItems.length < relatedItems.length
      ? `${visibleRelatedItems.length} / ${relatedItems.length} 条`
      : `${relatedItems.length} 条`;

    $detail.innerHTML = `
      <div class="term-head">
        <div class="term-pill">${escapeHtml(termEntry.term)}</div>
        <div class="term-stats">
          <span>总词频 ${termEntry.count}</span>
          <span>涉及新闻 ${termEntry.articleCount} 条</span>
        </div>
      </div>
      <div class="term-section">
        <h3>日期分布</h3>
        <div class="term-day-list">
          ${termEntry.dayCounts.map(([day, count]) => `
            <span class="mini-tag">${escapeHtml(day)} × ${count}</span>
          `).join('')}
        </div>
      </div>
      <div class="term-section">
        <div class="search-section-head">
          <h3>相关新闻</h3>
          <div class="search-section-count">${countLabel}</div>
        </div>
        <div class="term-article-list">
          ${visibleRelatedItems.map((item) => `
            <article class="mini-card">
              <h4><a href="${AnalysisUtils.buildDetailLink(item, getCurrentPage())}">${AnalysisUtils.highlightText(item.title, [termEntry.term])}</a></h4>
              <div class="meta">
                <span>${escapeHtml(item.date)}</span>
                <span>${escapeHtml(item.source)}</span>
                ${item.category ? AnalysisUtils.parseCategories(item.category).map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join('') : ''}
              </div>
              <p>${AnalysisUtils.highlightText(AnalysisUtils.extractSnippet(item.summary || item.detail, [termEntry.term], 150), [termEntry.term])}</p>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function mergeItems(existing, incoming) {
    const merged = new Map();
    (existing || []).forEach((item) => {
      if (item && item.id) {
        merged.set(item.id, item);
      }
    });
    (incoming || []).forEach((item) => {
      if (item && item.id) {
        merged.set(item.id, item);
      }
    });
    return Array.from(merged.values());
  }

  function measureCloudSize() {
    const width = Math.max(280, $canvas.clientWidth || ($canvas.parentElement && $canvas.parentElement.clientWidth) || 640);
    const height = Math.max(320, $canvas.clientHeight || 520);
    return { width, height };
  }

  function renderCloud(terms) {
    state.visibleTerms = terms;
    $canvas.innerHTML = '';

    if (!terms.length || typeof WordCloud !== 'function') {
      return;
    }

    const size = measureCloudSize();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('width', String(size.width));
    canvas.setAttribute('height', String(size.height));
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '词云');
    $canvas.appendChild(canvas);

    const maxCount = terms[0] && terms[0].count ? terms[0].count : 1;

    try {
      WordCloud(canvas, {
        list: terms.map((entry) => [entry.term, entry.count]),
        fontFamily: WORDCLOUD_FONT_FAMILY,
        gridSize: Math.max(8, Math.round(size.width / 48)),
        weightFactor: function (count) {
          const ratio = Math.max(0.15, count / maxCount);
          return 16 + ratio * Math.min(64, size.width / 12);
        },
        backgroundColor: 'rgba(0, 0, 0, 0)',
        color: function (_, weight) {
          if (weight >= 10) return '#1d4ed8';
          if (weight >= 6) return '#0f766e';
          return '#7c3aed';
        },
        rotateRatio: 0.12,
        minRotation: -Math.PI / 8,
        maxRotation: Math.PI / 8,
        drawOutOfBound: false,
        shrinkToFit: true,
        hover: function (item) {
          if (item && item[0]) {
            $cloudMeta.textContent = `悬停词条：${item[0]}`;
          }
        },
        click: function (item) {
          if (!item || !item[0]) {
            return;
          }
          state.selectedTerm = item[0];
          resetVisibleRelatedItems();
          renderDetailPanel(state.termMap.get(state.selectedTerm), getFilteredItems());
        }
      });
    } catch (error) {
      $cloudMeta.textContent = '词云绘制失败，右侧仍可查看词条详情。';
    }
  }

  function render() {
    const filteredItems = getFilteredItems();
    const rangeLabel = AnalysisUtils.formatDateRangeLabel(state.startDate, state.endDate);
    const stats = AnalysisUtils.buildWordCloudStats(filteredItems);
    const sliderMax = Math.max(6, stats.terms.length ? stats.terms[0].count : 6);
    $minFrequency.max = String(sliderMax);
    if (state.minFrequency > sliderMax) {
      state.minFrequency = sliderMax;
    }
    const terms = stats.terms
      .filter((entry) => entry.count >= state.minFrequency)
      .slice(0, 60);

    state.termMap = stats.termMap;
    renderPresetButtons();
    renderCategoryChips();
    syncControls();

    $summary.textContent = `${rangeLabel} · ${state.category} · ${filteredItems.length} 条新闻`;
    $cloudMeta.textContent = `${terms.length} 个展示词`;

    if (!filteredItems.length || !terms.length) {
      $empty.classList.remove('hidden');
      $canvas.innerHTML = '';
      $detail.innerHTML = '<div class="term-placeholder">调整日期范围、分类或词频阈值后再试。</div>';
      return;
    }

    $empty.classList.add('hidden');
    renderCloud(terms);

    const previousSelectedTerm = state.selectedTerm;
    if (!state.selectedTerm || !stats.termMap.has(state.selectedTerm) || terms.every((entry) => entry.term !== state.selectedTerm)) {
      state.selectedTerm = terms[0].term;
    }
    if (state.selectedTerm !== previousSelectedTerm) {
      resetVisibleRelatedItems();
    }

    renderDetailPanel(stats.termMap.get(state.selectedTerm), filteredItems);
  }

  function handleManualDateChange() {
    state.preset = 'custom';
    state.startDate = $startDate.value;
    state.endDate = $endDate.value;
    normalizeDateRange();
    resetVisibleRelatedItems();
    loadAndRender();
  }

  function initEvents() {
    $presets.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-preset]');
      if (!button) return;
      setPreset(button.getAttribute('data-preset'));
      resetVisibleRelatedItems();
      loadAndRender();
    });

    $categories.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-category]');
      if (!button) return;
      state.category = button.getAttribute('data-category') || '全部分类';
      resetVisibleRelatedItems();
      render();
    });

    $startDate.addEventListener('change', handleManualDateChange);
    $endDate.addEventListener('change', handleManualDateChange);
    $minFrequency.addEventListener('input', function () {
      state.minFrequency = Number($minFrequency.value) || 1;
      resetVisibleRelatedItems();
      render();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (state.visibleTerms.length) {
          render();
        }
      }, 160);
    });

    window.addEventListener('scroll', function () {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 120;
      if (nearBottom && hasMoreRelatedItems()) {
        loadMoreRelatedItems();
      }
    });
  }

  function loadAndRender() {
    const seq = ++state.loadSeq;
    const rangeLabel = AnalysisUtils.formatDateRangeLabel(state.startDate, state.endDate);
    $summary.textContent = `正在加载 ${rangeLabel} 的新闻...`;

    const fontsReady = waitForWordCloudFonts().then(() => {
      state.fontsReady = true;
    });

    return Promise.all([
      fontsReady,
      NewsStore.loadRange(state.startDate, state.endDate)
    ]).then((results) => {
      if (seq !== state.loadSeq) {
        return;
      }
      state.allItems = mergeItems(state.allItems, results[1] || []);
      render();
    }).catch(() => {
      if (seq !== state.loadSeq) {
        return;
      }
      $summary.textContent = '历史新闻加载失败。';
      $empty.classList.remove('hidden');
      $empty.textContent = '无法生成词云，请检查本地服务或新闻数据格式。';
      $detail.innerHTML = '<div class="term-placeholder">无法生成词云，请检查本地服务或新闻数据格式。</div>';
    });
  }

  function init() {
    state.days = NewsStore.getAvailableDays();
    populateDateOptions();
    setPreset(state.preset);
    initEvents();
    AnalysisUtils.bindFullscreenToggle($fullscreenToggle, $canvas, {
      onChange: function () {
        if (!state.visibleTerms.length) {
          return;
        }
        window.requestAnimationFrame(render);
      }
    });
    loadAndRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
