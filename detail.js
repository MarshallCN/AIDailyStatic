(function () {
  const state = {
    cacheVersion: (window.NEWS_MANIFEST && window.NEWS_MANIFEST.version) || String(Date.now())
  };

  const $card = document.getElementById('detail-card');
  const $title = document.getElementById('detail-title');
  const $date = document.getElementById('detail-date');
  const $category = document.getElementById('detail-category');
  const $source = document.getElementById('detail-source');
  const $body = document.getElementById('detail-body');
  const $origin = document.getElementById('detail-origin');
  const $empty = document.getElementById('detail-empty');
  const $back = document.getElementById('detail-back');

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(state.cacheVersion)}`;
  }

  function getNewsId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || '';
  }

  function getBackUrl() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    if (!from) return 'index.html?restore=1';

    try {
      const url = new URL(from, window.location.href);
      if (url.origin !== window.location.origin) {
        return 'index.html?restore=1';
      }
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      return 'index.html?restore=1';
    }
  }

  function initBackButton() {
    if (!$back) return;

    $back.addEventListener('click', () => {
      window.location.href = getBackUrl();
    });
  }

  function parseId(newsId) {
    const match = String(newsId).match(/^(\d{4}-\d{2}-\d{2})-(\d+)$/);
    if (!match) return null;
    return { day: match[1], index: Number(match[2]) };
  }

  function renderBody(item) {
    const hasDetail = Boolean(item.detail && item.detail.trim());
    const content = hasDetail ? item.detail : item.summary;
    const lines = String(content || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      $body.innerHTML = '<p>暂无内容。</p>';
      return;
    }

    const html = lines.map(line => `<p>${line}</p>`).join('');
    if (hasDetail) {
      $body.innerHTML = html;
    } else {
      $body.innerHTML = `<div class="detail-tip">暂无完整详情，以下为简要摘要：</div>${html}`;
    }
  }

  function renderSource(item) {
    const text = item.source || '原文链接';
    const href = item.url || '#';
    $origin.innerHTML = `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  function renderDetail(item) {
    $title.textContent = item.title || '无标题';
    $date.textContent = item.date || '-';
    $category.textContent = item.category || '其他';
    $source.textContent = item.source || '未知来源';
    renderBody(item);
    renderSource(item);
    $empty.classList.add('hidden');
    $card.classList.remove('hidden');
  }

  function showError(message) {
    $card.classList.add('hidden');
    $empty.classList.remove('hidden');
    $empty.textContent = message;
  }

  function fetchText(path) {
    return fetch(withCacheVersion(path), { cache: 'no-store' }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    });
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

    fetchText(`news/${targetFile}`)
      .then((rawMarkdown) => {
        const parsed = NewsParser.parseNewsMarkdown(rawMarkdown, parsedId.day);
        const normalized = NewsParser.normalizeItems(parsed.day, parsed.items);
        const item = normalized[parsedId.index];

        if (!item) {
          showError('未找到该条新闻内容。');
          return;
        }

        renderDetail(item);
      })
      .catch(() => {
        showError('详情加载失败，请稍后重试。');
      });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initBackButton();
    loadDetail();
  });
})();
