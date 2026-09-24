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
  const $kimi = document.getElementById('detail-kimi');
  const $kimiMeta = document.getElementById('detail-kimi-meta');
  const $kimiBody = document.getElementById('detail-kimi-body');
  const $empty = document.getElementById('detail-empty');
  const $back = document.getElementById('detail-back');

  function withCacheVersion(path) {
    return `${path}?v=${encodeURIComponent(state.cacheVersion)}`;
  }

  function parseCategories(categoryString) {
    return String(categoryString || '')
      .split(',')
      .map(cat => cat.trim())
      .filter(cat => cat.length > 0);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCategoryTags(categoryString) {
    const categories = parseCategories(categoryString);
    return categories.map(cat => `<span class="tag">${escapeHtml(cat)}</span>`).join('');
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

  function isPublicUrl(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function renderSource(item, extraLinks) {
    const links = [];
    const originalHref = item.url || '';
    const originalLabel = item.source || '原文链接';
    if (isPublicUrl(originalHref)) {
      links.push({ label: originalLabel, href: originalHref });
    }
    (extraLinks || []).forEach((link) => {
      if (!link || !link.href) return;
      const already = links.some((entry) => entry.href.replace(/\/$/, '') === link.href.replace(/\/$/, ''));
      if (!already) links.push(link);
    });

    const originSection = $origin ? $origin.closest('section') : null;
    if (!links.length) {
      if ($origin) $origin.innerHTML = '';
      if (originSection) originSection.classList.add('hidden');
    } else {
      if (originSection) originSection.classList.remove('hidden');
      $origin.innerHTML = `<ul class="detail-origin-list">${links.map((link) => `
      <li class="detail-origin-item">
        <span class="detail-origin-label">${escapeHtml(link.label)}</span>
        <a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.href)}</a>
      </li>
    `).join('')}</ul>`;
    }

    $source.innerHTML = NewsParser.sourceMetaHtml(item);
  }

  function sanitizeFaqHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  }

  function protectMath(markdown) {
    const slots = [];
    const protectedText = String(markdown || '').replace(/\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+\$/g, (match) => {
      const index = slots.length;
      slots.push(match);
      return `@@MATH${index}@@`;
    });
    return { protectedText, slots };
  }

  function restoreMath(html, slots) {
    return String(html || '').replace(/@@MATH(\d+)@@/g, (_, index) => slots[Number(index)] || '');
  }

  function renderKimiMarkdown(markdown) {
    const { protectedText, slots } = protectMath(markdown);
    const parse = window.marked && (marked.parse || marked);
    if (typeof parse !== 'function') {
      return `<pre>${escapeHtml(markdown)}</pre>`;
    }
    return restoreMath(parse.call(marked, protectedText, { gfm: true, breaks: true }), slots);
  }

  function renderKimiFaq(raw) {
    const wrap = document.createElement('div');
    wrap.innerHTML = sanitizeFaqHtml(raw);
    wrap.querySelectorAll('.faq-a').forEach((el) => {
      if (/<a\s/i.test(el.innerHTML)) {
        el.innerHTML = sanitizeFaqHtml(el.innerHTML);
        return;
      }
      el.innerHTML = renderKimiMarkdown(el.textContent || '');
    });
    wrap.querySelectorAll('a').forEach((anchor) => {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    });
    return wrap.innerHTML;
  }

  function typesetKimiMath() {
    if (!window.MathJax) return Promise.resolve();
    const ready = MathJax.startup && MathJax.startup.promise
      ? MathJax.startup.promise
      : Promise.resolve();
    return ready.then(() => {
      if (typeof MathJax.typesetPromise === 'function') {
        return MathJax.typesetPromise([$kimiBody]);
      }
      return null;
    });
  }

  function loadKimiSummary(item) {
    const arxivId = NewsParser.extractArxivId(item.url, item.source, item.title, item.summary);
    if (!arxivId || !$kimi || !$kimiBody) {
      if ($kimi) $kimi.classList.add('hidden');
      return;
    }

    const coolUrl = NewsParser.papersCoolUrl(arxivId);
    const kimiUrl = `https://papers.cool/arxiv/kimi?paper=${encodeURIComponent(arxivId)}`;
    $kimi.classList.remove('hidden');
    $kimiMeta.innerHTML = `来自 <a href="${escapeHtml(coolUrl)}" target="_blank" rel="noopener noreferrer">papers.cool</a> 的 Kimi FAQ。`;
    $kimiBody.innerHTML = '<p class="detail-kimi-status">正在加载 Kimi 总结…</p>';

    fetch(withCacheVersion(`kimi/${arxivId}.html`))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .catch(() => fetch(kimiUrl, { method: 'GET', cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      }))
      .then((raw) => {
        if (!/faq-q/.test(raw)) throw new Error('empty faq');
        $kimiBody.innerHTML = renderKimiFaq(raw);
        return typesetKimiMath();
      })
      .catch(() => {
        $kimiBody.innerHTML = `<p class="detail-kimi-status">本地尚未缓存这篇 Kimi 总结。可打开 <a href="${escapeHtml(coolUrl)}" target="_blank" rel="noopener noreferrer">papers.cool</a> 点击 [Kimi]，或查看 <a href="${escapeHtml(kimiUrl)}" target="_blank" rel="noopener noreferrer">已生成的 FAQ</a>。</p>`;
      });
  }

  function renderDetail(item) {
    $title.textContent = item.title || '无标题';
    $date.textContent = item.date || '-';
    $category.innerHTML = renderCategoryTags(item.category) || '<span class="tag">其他</span>';
    renderBody(item);
    renderSource(item, NewsParser.extraSourceLinks(item));
    loadKimiSummary(item);
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
