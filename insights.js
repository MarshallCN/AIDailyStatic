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

  function cleanSignal(signal) {
    if (typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.cleanInsightSignal === 'function') {
      return AnalysisUtils.cleanInsightSignal(signal);
    }
    return signal;
  }

  function labelsFromGraph(graph, limit) {
    return (graph && graph.nodes || []).slice(0, limit || 3).map(function (entry) {
      return (entry.data || entry).label;
    }).filter(Boolean);
  }

  function prepareTheme(theme) {
    const graph = typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.sanitizeGraphDataset === 'function'
      ? AnalysisUtils.sanitizeGraphDataset(theme.graph || { nodes: [], edges: [] }, { keepTypes: ['entity'], maxNodes: 36 })
      : (theme.graph || { nodes: [], edges: [] });
    const graphLabels = labelsFromGraph(graph, 4);
    const cleanedTitle = typeof AnalysisUtils !== 'undefined' ? AnalysisUtils.cleanClueTitle(theme.title) : '';
    const title = cleanedTitle || graphLabels.slice(0, 3).join(' / ');
    const summary = title
      ? '近期报道里，' + title.replace(/\s*\/\s*/g, '、') + ' 反复共现，形成一条可以顺着实体往下看的主题。'
      : '';
    const trendSignals = (theme.trend_signals || []).map(cleanSignal).filter(Boolean);
    const rewrite = typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.rewriteConcatenatedMentions === 'function'
      ? AnalysisUtils.rewriteConcatenatedMentions
      : function (value) { return value; };
    return Object.assign({}, theme, {
      graph: graph,
      title: title,
      summary: summary || rewrite(theme.summary || ''),
      conclusion: rewrite(theme.conclusion || ''),
      trend_signals: trendSignals
    });
  }

  function renderOverview(report, themes) {
    const overview = report.overview || {};
    const themeTitles = (themes || []).map(function (theme) { return theme.title; }).filter(Boolean);
    const headline = themeTitles.length
      ? (report.date || '') + ' 的图谱留下 ' + themeTitles.length + ' 条可追踪主题：' + themeTitles.join('；')
      : (typeof AnalysisUtils !== 'undefined' ? AnalysisUtils.cleanClueTitle(overview.headline) : overview.headline);
    const leadEntities = themeTitles[0] ? themeTitles[0].replace(/\s*\/\s*/g, '、') : '';
    const summary = leadEntities
      ? '最近窗口里最稳定的结构，是围绕 ' + leadEntities + ' 形成的实体关系，而不是标题原句或来源标签。'
      : (overview.summary || '暂无总览摘要');
    const observations = (themes || []).map(function (theme) {
      return (theme.trend_signals || [])[0];
    }).filter(Boolean).slice(0, 4);
    $overview.innerHTML = [
      '<div class="report-headline">', escapeHtml(headline || '暂无总览标题'), '</div>',
      '<p class="report-summary">', escapeHtml(summary), '</p>',
      observations.length ? '<div class="report-observation-list">' + observations.map(function (entry) {
        return '<span class="match-badge">' + escapeHtml(entry) + '</span>';
      }).join('') + '</div>' : ''
    ].join('');

    const themeCount = (themes || []).length;
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

  function renderThemes(themes) {
    destroyGraphs();
    const preparedThemes = themes || [];
    if (!preparedThemes.length) {
      $themes.innerHTML = '';
      return;
    }

    $themes.innerHTML = preparedThemes.map(function (theme, index) {
      return [
        '<article class="panel theme-card">',
        '<div class="panel-head theme-card-head">',
        '<div>',
        '<div class="theme-kicker">主题 ', String(index + 1), '</div>',
        '<h2>', escapeHtml(theme.title), '</h2>',
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

    preparedThemes.forEach(function (theme, index) {
      const container = document.getElementById('theme-graph-' + index);
      if (!container || !theme.graph || !Array.isArray(theme.graph.nodes)) {
        return;
      }
      if (!theme.graph.nodes.length) {
        container.innerHTML = '<div class="dynamic-graph-empty">该主题暂无足够干净的实体子图，请看右侧证据新闻。</div>';
        return;
      }
      const renderer = StaticGraphRenderer.create(container, {
        compact: true,
        enableDetail: false,
        showEdgeLabels: false,
        fitPadding: 42
      });
      const graph = theme.graph;
      renderer.render(graph);
      const fullscreenButton = document.getElementById('theme-graph-fullscreen-' + index);
      const cleanup = AnalysisUtils.bindFullscreenToggle(fullscreenButton, container, {
        onChange: function () {
          window.requestAnimationFrame(function () {
            renderer.render(graph);
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
    const preparedThemes = (Array.isArray(report.themes) ? report.themes : [])
      .map(prepareTheme)
      .filter(function (theme) {
        return theme.title && theme.graph && theme.graph.nodes && theme.graph.nodes.length >= 2;
      });
    $empty.classList.add('hidden');
    renderOverview(report, preparedThemes);
    renderMemory(report);
    renderThemes(preparedThemes);
    $summary.textContent = report.date + ' · ' + preparedThemes.length + ' 个主题 · 静态洞察报告';
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
