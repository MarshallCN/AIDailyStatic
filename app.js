(function () {
  const state = {
    allItems: [],
    categories: ['全部'],
    activeCategory: '全部',
    dayFiles: [],
    nextDayIndex: 0,
    daysPerLoad: 3,
    loading: false,
    cacheVersion: (window.NEWS_MANIFEST && window.NEWS_MANIFEST.version) || String(Date.now())
  };

  $.ajaxSetup({ cache: false });

  const $filters = $('#filters');
  const $list = $('#news');
  const $empty = $('#empty');
  const $loading = $('#loading');

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
      id: `${day}-${idx}`,
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
    state.categories = ['全部', ...set];
    if (!state.categories.includes(state.activeCategory)) {
      state.activeCategory = '全部';
    }
  }

  function renderFilters() {
    $filters.html(state.categories.map(name => (
      `<button class="chip ${name === state.activeCategory ? 'active' : ''}" data-category="${name}">${name}</button>`
    )).join(''));
  }

  function renderNews() {
    const filtered = state.activeCategory === '全部'
      ? state.allItems
      : state.allItems.filter(item => item.category === state.activeCategory);

    if (!filtered.length) {
      $list.empty();
      $empty.removeClass('hidden');
      return;
    }

    $empty.addClass('hidden');
    $list.html(filtered.map(item => `
      <article>
        <h2><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a></h2>
        <div class="meta">
          <span>${item.date}</span>
          <span>${item.source}</span>
          <span class="tag">${item.category}</span>
        </div>
        <div>${item.summary}</div>
      </article>
    `).join(''));
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
      const parsed = parseNewsMarkdown(rawMarkdown, parseDayFromFile(fileName));
      const normalized = normalizeItems(parsed.day, parsed.items);
      state.allItems = state.allItems.concat(normalized);
      state.allItems.sort((a, b) => {
        if (a.date === b.date) return a.title.localeCompare(b.title, 'zh-Hans-CN');
        return b.date.localeCompare(a.date);
      });
    });
  }

  function loadMoreDays() {
    if (state.loading || state.nextDayIndex >= state.dayFiles.length) return;

    state.loading = true;
    $loading.removeClass('hidden');

    const slice = state.dayFiles.slice(state.nextDayIndex, state.nextDayIndex + state.daysPerLoad);
    const tasks = slice.map(loadOneDay);

    $.when.apply($, tasks)
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
  }

  function init() {
    const manifest = window.NEWS_MANIFEST;
    if (!manifest || !Array.isArray(manifest.files)) {
      $empty.removeClass('hidden').text('未找到 news/manifest.js 或格式不正确。');
      return;
    }

    const files = manifest.files.slice().sort((a, b) => parseDayFromFile(b).localeCompare(parseDayFromFile(a)));
    state.dayFiles = files;
    initEvents();
    initScrollLoad();
    loadMoreDays();
  }

  $(init);
})();
