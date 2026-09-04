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
    const rawGraph = theme.graph || { nodes: [], edges: [] };
    let graph = typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.sanitizeGraphDataset === 'function'
      ? AnalysisUtils.sanitizeGraphDataset(rawGraph, { keepTypes: ['entity', 'topic'], maxNodes: 36 })
      : rawGraph;
    if (typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.enrichGraphWithKnowledge === 'function') {
      graph = AnalysisUtils.enrichGraphWithKnowledge(graph, theme.evidence || [], { maxTopics: 8 });
    }
    const graphLabels = labelsFromGraph(graph, 3);
    const cleanedTitle = typeof AnalysisUtils !== 'undefined' ? AnalysisUtils.cleanClueTitle(theme.title) : '';
    const title = cleanedTitle || graphLabels.join(' / ');
    const report = typeof AnalysisUtils !== 'undefined' && typeof AnalysisUtils.buildInsightReport === 'function'
      ? AnalysisUtils.buildInsightReport(Object.assign({}, theme, {
        title: title,
        coreEntities: (theme.core_entities || theme.coreEntities || []).concat(graphLabels),
        eventTypes: theme.event_types || theme.eventTypes || []
      }))
      : null;
    return Object.assign({}, theme, {
      graph: graph,
      title: (report && report.title) || title,
      report: report,
      summary: report ? report.judgment : '',
      conclusion: report ? report.synthesis : '',
      trend_signals: (report && report.actions) || (theme.trend_signals || []).map(cleanSignal).filter(Boolean)
    });
  }

  function renderOverview(report, themes) {
    const themeTitles = (themes || []).map(function (theme) { return theme.title; }).filter(Boolean);
    const judgments = (themes || []).map(function (theme) {
      return theme.summary;
    }).filter(Boolean);
    const headline = themeTitles.length
      ? (report.date || '') + ' 精选 ' + themeTitles.length + ' 篇主题报告：' + themeTitles.join('；')
      : (report.date || '') + ' 暂无足够高质量主题';
    const summary = judgments.length
      ? judgments.map(function (entry, index) {
        return '（' + String(index + 1) + '）' + entry;
      }).join(' ')
      : '当前窗口还没有足够的证据把线索串成报告。';
    $overview.innerHTML = [
      '<div class="report-headline">', escapeHtml(headline), '</div>',
      '<p class="report-summary">', escapeHtml(summary), '</p>'
    ].join('');

    const evidenceCount = (themes || []).reduce(function (sum, theme) {
      return sum + ((theme.evidence && theme.evidence.length) || 0);
    }, 0);
    $meta.textContent = (themes || []).length + ' 篇主题报告 · ' + evidenceCount + ' 条直接证据';
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
        '<div class="theme-report">',
        theme.summary ? '<section class="theme-report-section"><h3>判断</h3><p class="theme-summary">' + escapeHtml(theme.summary) + '</p></section>' : '',
        theme.report && theme.report.factChain && theme.report.factChain.length ? '<section class="theme-report-section"><h3>事实链</h3><div class="theme-report-facts">' + theme.report.factChain.map(function (fact) {
          return '<p class="theme-report-fact">' + escapeHtml(fact) + '</p>';
        }).join('') + '</div></section>' : '',
        theme.conclusion ? '<section class="theme-report-section"><h3>串起来看</h3><div class="theme-conclusion">' + escapeHtml(theme.conclusion) + '</div></section>' : '',
        '</div>',
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
        showEdgeLabels: true,
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
        return theme.title && theme.summary && theme.graph && theme.graph.nodes && theme.graph.nodes.length >= 2;
      })
      .sort(function (left, right) {
        function score(theme) {
          const evidenceCount = (theme.evidence || []).length;
          const hasObservation = (theme.evidence || []).some(function (entry) {
            return /观察：/.test(entry.title || '') || entry.source === '综合观察';
          });
          return evidenceCount * 2 + (theme.graph.nodes || []).length + (hasObservation ? 10 : 0) + ((theme.report && theme.report.factChain && theme.report.factChain.length) || 0);
        }
        return score(right) - score(left);
      })
      .slice(0, 3);
    $empty.classList.add('hidden');
    renderOverview(report, preparedThemes);
    renderMemory(report);
    renderThemes(preparedThemes);
    $summary.textContent = report.date + ' · ' + preparedThemes.length + ' 篇精选主题报告';
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
