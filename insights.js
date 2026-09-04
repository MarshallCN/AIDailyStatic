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
      if (entry && entry.renderer2d && entry.renderer2d !== entry.renderer && typeof entry.renderer2d.destroy === 'function') {
        entry.renderer2d.destroy();
      }
      if (entry && entry.renderer3d && entry.renderer3d !== entry.renderer && typeof entry.renderer3d.destroy === 'function') {
        entry.renderer3d.destroy();
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
        '<div class="panel-head"><h3>相关子图</h3><div class="panel-actions"><button type="button" class="ghost-button ghost-button-compact" id="theme-graph-fullscreen-', String(index), '">全屏</button></div></div>',
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
      const graph = theme.graph;
      container.innerHTML = '';
      const stage = document.createElement('div');
      stage.className = 'clue-graph-stage';
      const host2d = document.createElement('div');
      host2d.className = 'clue-graph-host theme-graph-host-2d';
      const host3d = document.createElement('div');
      host3d.className = 'clue-graph-host theme-graph-host-3d hidden';
      stage.appendChild(host2d);
      stage.appendChild(host3d);
      const toolbar = document.createElement('div');
      toolbar.className = 'dynamic-graph-controls clue-graph-toolbar';
      toolbar.innerHTML = typeof StaticGraphRenderer === 'object' && typeof StaticGraphRenderer.buildToolbarHtml === 'function'
        ? StaticGraphRenderer.buildToolbarHtml({ includeStaticMode: false })
        : [
          '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="fit">重置视图</button>',
          '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="labels">显示边标签</button>',
          '<button type="button" class="ghost-button ghost-button-compact hidden" data-graph-action="nodelabels">隐藏节点标签</button>',
          '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="view3d">切到3D</button>'
        ].join('');
      container.appendChild(stage);
      container.appendChild(toolbar);

      const instance = {
        mode: '2d',
        showEdgeLabels: true,
        showNodeLabels: true,
        renderer: null,
        renderer2d: null,
        renderer3d: null,
        cleanup: null
      };

      function currentRenderer() {
        return instance.mode === '3d' ? instance.renderer3d : instance.renderer2d;
      }

      function syncToolbar() {
        const labelsButton = toolbar.querySelector('[data-graph-action="labels"]');
        const nodeLabelsButton = toolbar.querySelector('[data-graph-action="nodelabels"]');
        const view3dButton = toolbar.querySelector('[data-graph-action="view3d"]');
        toolbar.classList.toggle('is-3d', instance.mode === '3d');
        if (labelsButton) {
          labelsButton.textContent = instance.showEdgeLabels ? '隐藏边标签' : '显示边标签';
        }
        if (nodeLabelsButton) {
          nodeLabelsButton.classList.toggle('hidden', instance.mode !== '3d');
          nodeLabelsButton.textContent = instance.showNodeLabels ? '隐藏节点标签' : '显示节点标签';
        }
        if (view3dButton) {
          const available = typeof StaticGraph3DRenderer === 'object' && StaticGraph3DRenderer.isAvailable();
          view3dButton.disabled = !available;
          view3dButton.textContent = !available ? '3D不可用' : (instance.mode === '3d' ? '切回平面' : '切到3D');
          view3dButton.classList.toggle('is-active', instance.mode === '3d');
        }
      }

      function renderCurrent() {
        host2d.classList.toggle('hidden', instance.mode !== '2d');
        host3d.classList.toggle('hidden', instance.mode !== '3d');
        if (instance.mode === '3d') {
          if (instance.renderer2d) {
            instance.renderer2d.destroy();
            instance.renderer2d = null;
            host2d.innerHTML = '';
          }
          if (!instance.renderer3d && typeof StaticGraph3DRenderer === 'object') {
            instance.renderer3d = StaticGraph3DRenderer.create(host3d, {
              compact: true,
              showEdgeLabels: instance.showEdgeLabels,
              showNodeLabels: instance.showNodeLabels
            });
          }
          instance.renderer = instance.renderer3d;
          if (instance.renderer3d) {
            instance.renderer3d.options.showEdgeLabels = instance.showEdgeLabels;
            instance.renderer3d.options.showNodeLabels = instance.showNodeLabels;
            instance.renderer3d.render(graph);
            if (typeof instance.renderer3d.setNodeLabelsVisible === 'function') {
              instance.renderer3d.setNodeLabelsVisible(instance.showNodeLabels);
            }
          }
        } else {
          if (instance.renderer3d) {
            instance.renderer3d.destroy();
            instance.renderer3d = null;
            host3d.innerHTML = '';
          }
          if (!instance.renderer2d) {
            instance.renderer2d = StaticGraphRenderer.create(host2d, {
              compact: true,
              enableDetail: false,
              showEdgeLabels: instance.showEdgeLabels,
              showControls: false,
              fitPadding: 42
            });
          }
          instance.renderer = instance.renderer2d;
          instance.renderer2d.options.showEdgeLabels = instance.showEdgeLabels;
          instance.renderer2d.render(graph);
          if (typeof instance.renderer2d.syncEdgeLabelVisibility === 'function') {
            instance.renderer2d.syncEdgeLabelVisibility();
          }
        }
        syncToolbar();
      }

      toolbar.addEventListener('click', function (event) {
        const button = event.target.closest('button[data-graph-action]');
        if (!button) {
          return;
        }
        const action = button.getAttribute('data-graph-action');
        const renderer = currentRenderer();
        if (action === 'fit') {
          if (renderer && typeof renderer.fitToAll === 'function') {
            renderer.fitToAll();
          }
          return;
        }
        if (action === 'labels') {
          instance.showEdgeLabels = !instance.showEdgeLabels;
          if (renderer && typeof renderer.setEdgeLabelsVisible === 'function') {
            renderer.setEdgeLabelsVisible(instance.showEdgeLabels);
          } else if (renderer) {
            renderer.options.showEdgeLabels = instance.showEdgeLabels;
            if (typeof renderer.syncEdgeLabelVisibility === 'function') {
              renderer.syncEdgeLabelVisibility();
            }
          }
          syncToolbar();
          return;
        }
        if (action === 'nodelabels') {
          if (instance.mode !== '3d') {
            return;
          }
          instance.showNodeLabels = !instance.showNodeLabels;
          if (instance.renderer3d && typeof instance.renderer3d.setNodeLabelsVisible === 'function') {
            instance.renderer3d.setNodeLabelsVisible(instance.showNodeLabels);
          }
          syncToolbar();
          return;
        }
        if (action === 'view3d') {
          if (typeof StaticGraph3DRenderer !== 'object' || !StaticGraph3DRenderer.isAvailable()) {
            return;
          }
          instance.mode = instance.mode === '3d' ? '2d' : '3d';
          renderCurrent();
        }
      });

      renderCurrent();
      const fullscreenButton = document.getElementById('theme-graph-fullscreen-' + index);
      instance.cleanup = AnalysisUtils.bindFullscreenToggle(fullscreenButton, container, {
        onChange: function () {
          window.requestAnimationFrame(function () {
            const renderer = currentRenderer();
            if (renderer && typeof renderer.render === 'function') {
              renderer.render(graph);
            }
            if (renderer && typeof renderer.syncSize === 'function') {
              renderer.syncSize();
            }
            if (renderer && typeof renderer.setNodeLabelsVisible === 'function') {
              renderer.setNodeLabelsVisible(instance.showNodeLabels);
            }
          });
        }
      });
      state.graphInstances.push(instance);
    });
  }

  function renderReport(report) {
    state.report = report;
    let preparedThemes = (Array.isArray(report.themes) ? report.themes : [])
      .map(prepareTheme)
      .filter(function (theme) {
        return theme.title && theme.summary && theme.graph && theme.graph.nodes && theme.graph.nodes.length >= 2;
      });
    const seenJudgments = new Set();
    preparedThemes.forEach(function (theme) {
      const key = String(theme.summary || '').slice(0, 24);
      if (seenJudgments.has(key) && theme.report) {
        const fallback = AnalysisUtils.buildClueJudgment(theme, (theme.evidence || []).filter(function (entry) {
          return !/观察：/.test(entry.title || '');
        }));
        if (fallback && fallback.indexOf(key) === -1) {
          theme.summary = fallback;
          theme.report.judgment = fallback;
        }
      }
      seenJudgments.add(String(theme.summary || '').slice(0, 24));
    });
    preparedThemes = preparedThemes.sort(function (left, right) {
        function score(theme) {
          const evidenceCount = (theme.evidence || []).length;
          const usedObservation = theme.report && theme.report.judgment && (theme.evidence || []).some(function (entry) {
            return entry.summary && theme.report.judgment.indexOf(String(entry.summary).slice(0, 12)) !== -1 && (/观察：/.test(entry.title || '') || entry.source === '综合观察');
          });
          return evidenceCount + (theme.graph.nodes || []).length + (usedObservation ? 12 : 0) + ((theme.report && theme.report.factChain && theme.report.factChain.length) || 0) * 3;
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
