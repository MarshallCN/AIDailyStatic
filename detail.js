(function () {
  const state = {
    cacheVersion: (window.NEWS_MANIFEST && window.NEWS_MANIFEST.version) || String(Date.now())
  };

  $.ajaxSetup({ cache: false });

  const $title = $('#detail-title');
  const $date = $('#detail-date');
  const $category = $('#detail-category');
  const $source = $('#detail-source');
  const $body = $('#detail-body');
  const $origin = $('#detail-origin');
  const $error = $('#detail-error');

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(state.cacheVersion)}`;
  }

  function getNewsId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
  }

  function parseId(newsId) {
    const match = String(newsId).match(/^(\d{4}-\d{2}-\d{2})-(\d+)$/);
    if (!match) return null;
    return { day: match[1], index: Number(match[2]) };
  }

  function renderBody(item) {
    const hasDetail = Boolean(item.detail && item.detail.trim());
    const content = hasDetail ? item.detail : item.summary;
    const lines = String(content || '').split('\n').map(line => line.trim()).filter(Boolean);

    if (!lines.length) {
      $body.html('<p>暂无内容。</p>');
      return;
    }

    const html = lines.map(line => `<p>${line}</p>`).join('');
    if (hasDetail) {
      $body.html(html);
    } else {
      $body.html(`<div class="detail-tip">暂无完整详情，以下为简要摘要：</div>${html}`);
    }
  }

  function renderSource(item) {
    const text = item.source || '原文链接';
    const href = item.url || '#';
    $origin.html(`<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  }

  function renderDetail(item) {
    $title.text(item.title || '无标题');
    $date.text(item.date || '-');
    $category.text(item.category || '其他');
    $source.text(item.source || '未知来源');
    renderBody(item);
    renderSource(item);
  }

  function showError(message) {
    $error.removeClass('hidden').text(message);
  }

  function loadDetail() {
    const newsId = getNewsId();
    const parsedId = parseId(newsId);
    const manifest = window.NEWS_MANIFEST;

    if (!parsedId) {
      showError('新闻标识无效，请从首页重新进入详情页。');
      return;
    }

    if (!manifest || !Array.isArray(manifest.files)) {
      showError('未找到 news/manifest.js 或格式不正确。');
      return;
    }

    const targetFile = manifest.files.find(fileName => NewsParser.parseDayFromFile(fileName) === parsedId.day);
    if (!targetFile) {
      showError('未找到对应日期的新闻文件。');
      return;
    }

    $.get(withCacheVersion(`news/${targetFile}`))
      .done((rawMarkdown) => {
        const parsed = NewsParser.parseNewsMarkdown(rawMarkdown, parsedId.day);
        const normalized = NewsParser.normalizeItems(parsed.day, parsed.items);
        const item = normalized[parsedId.index];

        if (!item) {
          showError('未找到该条新闻内容。');
          return;
        }

        renderDetail(item);
      })
      .fail(() => {
        showError('详情加载失败，请稍后重试。');
      });
  }

  $(loadDetail);
})();
