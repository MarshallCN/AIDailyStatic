(function () {
  const state = {
    activeDate: '',
    report: null,
    graphInstances: []
  };

  const $date = document.getElementById('insight-date');
  const $summary = document.getElementById('insight-summary');
  const $meta = document.getElementById('insight-meta');
  const $overview = document.getElementById('insight-overview');
  const $memory = document.getElementById('insight-memory');
  const $themes = document.getElementById('insight-themes');
  const $empty = document.getElementById('insight-empty');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getRequestedDate() {
    const params = new URLSearchParams(window.location.search);
    return params.get('date') || '';
  }

  function syncUrl(date) {
    const url = new URL(window.location.href);
    if (date) {
      url.searchParams.set('date', date);
    } else {
      url.searchParams.delete('date');
    }
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function destroyGraphs() {
    state.graphInstances.forEach(function (entry) {
      if (entry && typeof entry.cleanup === 'function') {
        entry.cleanup();
      }
      if (entry && entry.renderer && typeof entry.renderer.destroy === 'function') {
        entry.renderer.destroy();
      }
    });
    state.graphInstances = [];
  }

  function buildDetailLink(articleId) {
    const params = new URLSearchParams({
      id: articleId,
      from: 'insights.html?date=' + encodeURIComponent(state.activeDate)
    });
    return 'detail.html?' + params.toString();
  }

  function renderOverview(report) {
    const overview = report.overview || {};
    const observations = Array.isArray(overview.key_observations) ? overview.key_observations : [];
    $overview.innerHTML = [
      '<div class="report-headline">', escapeHtml(overview.headline || '暂无总览标题'), '</div>',
      '<p class="report-summary">', escapeHtml(overview.summary || '暂无总览摘要'), '</p>',
      observations.length ? '<div class="report-observation-list">' + observations.map(function (entry) {
        return '<span class="match-badge">' + escapeHtml(entry) + '</span>';
      }).join('') + '</div>' : ''
    ].join('');

    const themeCount = Array.isArray(report.themes) ? report.themes.length : 0;
    const evidenceCount = Array.isArray(report.evidence_index) ? report.evidence_index.length : 0;
    $meta.textContent = themeCount + ' 个主题 · ' + evidenceCount + ' 条索引新闻';
  }

  function renderMemory(report) {
    const memoryRefs = report.memory_refs || {};
    const recentWindow = memoryRefs.recent_window || {};
    const archiveRefs = Array.isArray(memoryRefs.archive_refs) ? memoryRefs.archive_refs : [];
    $memory.innerHTML = [
      '<div class="report-memory-row"><strong>近期详细记忆</strong><span>',
      escapeHtml((recentWindow.start_date || '-') + ' 至 ' + (recentWindow.end_date || '-')),
      '</span></div>',
      '<div class="report-memory-row"><strong>长期压缩记忆</strong><span>',
      archiveRefs.length ? escapeHtml(archiveRefs.join('、')) : '暂无',
      '</span></div>'
    ].join('');
  }

  function renderThemes(report) {
    destroyGraphs();
    const themes = Array.isArray(report.themes) ? report.themes : [];
    if (!themes.length) {
      $themes.innerHTML = '';
      return;
    }

    $themes.innerHTML = themes.map(function (theme, index) {
      return [
        '<article class="panel theme-card">',
        '<div class="panel-head theme-card-head">',
        '<div>',
        '<div class="theme-kicker">主题 ', String(index + 1), '</div>',
        '<h2>', escapeHtml(theme.title || '未命名主题'), '</h2>',
        '</div>',
        '<div class="theme-meta">', escapeHtml(theme.dominant_category || '多主题'), '</div>',
        '</div>',
        '<p class="theme-summary">', escapeHtml(theme.summary || ''), '</p>',
        '<div class="theme-conclusion">', escapeHtml(theme.conclusion || ''), '</div>',
        theme.trend_signals && theme.trend_signals.length ? '<div class="theme-signal-list">' + theme.trend_signals.map(function (signal) {
          return '<span class="match-badge">' + escapeHtml(signal) + '</span>';
        }).join('') + '</div>' : '',
        '<div class="insight-layout insight-layout-report">',
        '<section class="panel theme-graph-panel">',
        '<div class="panel-head"><h3>相关子图</h3><div class="panel-actions"><button type="button" id="theme-graph-fullscreen-', String(index), '">全屏</button></div></div>',
        '<div class="graph-canvas theme-graph-canvas" id="theme-graph-', String(index), '"></div>',
        '</section>',
        '<section class="panel theme-evidence-panel">',
        '<div class="panel-head"><h3>证据索引</h3></div>',
        '<div class="evidence-list">',
        (theme.evidence || []).map(function (evidence) {
          return [
            '<article class="mini-card">',
            '<h4><a href="', buildDetailLink(evidence.article_id), '">#', String(evidence.report_index || ''), ' · ', escapeHtml(evidence.title || evidence.article_id), '</a></h4>',
            '<div class="meta">',
            '<span>', escapeHtml(evidence.article_id || ''), '</span>',
            '<span>', escapeHtml(evidence.date || ''), '</span>',
            '<span>', escapeHtml(evidence.source || ''), '</span>',
            '</div>',
            '<p>', escapeHtml(evidence.summary || ''), '</p>',
            '</article>'
          ].join('');
        }).join(''),
        '</div>',
        '</section>',
        '</div>',
        '</article>'
      ].join('');
    }).join('');

    themes.forEach(function (theme, index) {
      const container = document.getElementById('theme-graph-' + index);
      if (!container || !theme.graph || !Array.isArray(theme.graph.nodes)) {
        return;
      }
      const renderer = StaticGraphRenderer.create(container, {
        compact: true,
        enableDetail: false,
        showEdgeLabels: false,
        fitPadding: 42
      });
      renderer.render(theme.graph);
      const fullscreenButton = document.getElementById('theme-graph-fullscreen-' + index);
      const cleanup = AnalysisUtils.bindFullscreenToggle(fullscreenButton, container, {
        onChange: function () {
          window.requestAnimationFrame(function () {
            renderer.render(theme.graph);
          });
        }
      });
      state.graphInstances.push({
        renderer: renderer,
        cleanup: cleanup
      });
    });
  }

  function renderReport(report) {
    state.report = report;
    $empty.classList.add('hidden');
    renderOverview(report);
    renderMemory(report);
    renderThemes(report);
    const themeCount = Array.isArray(report.themes) ? report.themes.length : 0;
    $summary.textContent = report.date + ' · ' + themeCount + ' 个主题 · 静态洞察报告';
  }

  function showEmpty(message) {
    destroyGraphs();
    $overview.innerHTML = '';
    $memory.innerHTML = '';
    $themes.innerHTML = '';
    $empty.classList.remove('hidden');
    $empty.textContent = message;
    $summary.textContent = message;
    $meta.textContent = '';
  }

  function populateDates() {
    const days = InsightStore.getAvailableDays();
    $date.innerHTML = days.map(function (day) {
      return '<option value="' + day + '">' + day + '</option>';
    }).join('');
    if (!days.length) {
      showEmpty('当前还没有可展示的洞察报告。');
      return false;
    }
    return true;
  }

  function loadReport(date) {
    state.activeDate = date;
    syncUrl(date);
    $summary.textContent = '正在加载 ' + date + ' 的洞察报告...';
    InsightStore.loadReport(date)
      .then(function (report) {
        renderReport(report);
      })
      .catch(function () {
        showEmpty('该日期的洞察报告加载失败，请检查静态产物目录。');
      });
  }

  function initEvents() {
    $date.addEventListener('change', function () {
      const nextDate = $date.value;
      if (!nextDate) return;
      loadReport(nextDate);
    });
  }

  function init() {
    if (!populateDates()) return;
    initEvents();
    const requested = getRequestedDate();
    const latest = InsightStore.getLatestDay();
    const nextDate = requested && InsightStore.getAvailableDays().indexOf(requested) !== -1 ? requested : latest;
    $date.value = nextDate;
    loadReport(nextDate);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
