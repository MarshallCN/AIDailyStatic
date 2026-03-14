(function () {
  $.ajaxSetup({ cache: false });

  const $card = $('#detail-card');
  const $empty = $('#detail-empty');
  const $title = $('#detail-title');
  const $date = $('#detail-date');
  const $source = $('#detail-source');
  const $category = $('#detail-category');
  const $summary = $('#detail-summary');
  const $originLink = $('#detail-origin-link');

  const cacheVersion = (window.NEWS_MANIFEST && window.NEWS_MANIFEST.version) || String(Date.now());

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(cacheVersion)}`;
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

  function parseId(rawId) {
    const match = (rawId || '').match(/^(\d{4}-\d{2}-\d{2})-(\d+)$/);
    if (!match) return null;

    return {
      day: match[1],
      index: Number(match[2])
    };
  }

  function showNotFound(reason) {
    $card.addClass('hidden');
    $empty.removeClass('hidden').text(`未找到该新闻（${reason}）`);
  }

  function showDetail(item) {
    $title.text(item.title);
    $date.text(item.date);
    $source.text(item.source);
    $category.text(item.category);
    $summary.text(item.summary || '暂无摘要');
    $originLink.attr('href', item.url || '#');

    $empty.addClass('hidden');
    $card.removeClass('hidden');
  }

  function findFromDayFile(parsedId) {
    const manifest = window.NEWS_MANIFEST;
    if (!manifest || !Array.isArray(manifest.files)) {
      showNotFound('数据索引不可用');
      return;
    }

    const dayFile = `${parsedId.day}.md`;
    if (!manifest.files.includes(dayFile)) {
      showNotFound('日期文件不存在');
      return;
    }

    $.get(withCacheVersion(`news/${dayFile}`))
      .done((rawMarkdown) => {
        const parsed = parseNewsMarkdown(rawMarkdown, parsedId.day);
        const items = normalizeItems(parsed.day, parsed.items);
        const found = items[parsedId.index];

        if (!found || found.id !== `${parsedId.day}-${parsedId.index}`) {
          showNotFound('新闻编号无效');
          return;
        }

        showDetail(found);
      })
      .fail(() => {
        showNotFound('详情数据加载失败');
      });
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '';
    if (!id) {
      showNotFound('缺少新闻编号');
      return;
    }

    const parsedId = parseId(id);
    if (!parsedId) {
      showNotFound('新闻编号格式错误');
      return;
    }

    findFromDayFile(parsedId);
  }

  $(init);
})();
