(function () {
  const PRESETS = [
    { id: '3d', label: '最近 3 天', days: 3 },
    { id: '7d', label: '最近 7 天', days: 7 },
    { id: '14d', label: '最近 14 天', days: 14 },
    { id: '30d', label: '最近 30 天', days: 30 },
    { id: 'all', label: '全部', days: 0 }
  ];

  const state = {
    allItems: [],
    signalRecordMap: new Map(),
    days: [],
    preset: '14d',
    startDate: '',
    endDate: '',
    category: '全部分类',
    graphMode: 'dynamic',
    graphView: 'clue',
    activeClueIds: {
      dynamic: '',
      static: ''
    },
    graphDatasets: {
      dynamic: null,
      static: null
    },
    graphRenderer: null,
    staticRenderer: null,
    staticDatasetRef: null,
    graphStage: null,
    dynamicHost: null,
    staticHost: null,
    graphToolbar: null,
    edgeLabelsVisible: false,
    resizeTimer: 0
  };

  const $summary = document.getElementById('clue-summary');
  const $empty = document.getElementById('clue-empty');
  const $graphMeta = document.getElementById('clue-graph-meta');
  const $graph = document.getElementById('clue-graph');
  const $list = document.getElementById('clue-list');
  const $evidence = document.getElementById('clue-evidence');
  const $notes = document.getElementById('clue-notes');
  const $startDate = document.getElementById('clue-start-date');
  const $endDate = document.getElementById('clue-end-date');
  const $presets = document.getElementById('clue-presets');
  const $categories = document.getElementById('clue-categories');
  const $showAllButton = document.getElementById('clue-show-all');
  const $fullscreenToggle = document.getElementById('clue-fullscreen-toggle');

  function escapeHtml(value) {
    return AnalysisUtils.escapeHtml(value);
  }

  function getCurrentPage() {
    const search = window.location.search || '';
    return 'clues.html' + search;
  }

  function getPresetRange(presetId) {
    const preset = PRESETS.find(function (entry) {
      return entry.id === presetId;
    }) || PRESETS[2];

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

  function renderPresetButtons() {
    $presets.innerHTML = PRESETS.map(function (preset) {
      return '<button class="chip ' + (preset.id === state.preset ? 'active' : '') + '" data-preset="' + preset.id + '" type="button">' + preset.label + '</button>';
    }).join('');
  }

  function renderCategoryChips() {
    const categories = ['全部分类'].concat(AnalysisUtils.FIXED_CATEGORIES);
    $categories.innerHTML = categories.map(function (category) {
      return '<button class="chip ' + (category === state.category ? 'active' : '') + '" data-category="' + category + '" type="button">' + category + '</button>';
    }).join('');
  }

  function populateDateOptions() {
    const options = state.days.map(function (day) {
      return '<option value="' + day + '">' + day + '</option>';
    }).join('');
    $startDate.innerHTML = options;
    $endDate.innerHTML = options;
  }

  function syncControls() {
    $startDate.value = state.startDate;
    $endDate.value = state.endDate;
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

  function getSignalRecordsForItems(items) {
    return (items || []).map(function (item) {
      return state.signalRecordMap.get(item.id) || KGUtils.buildRuleSignalRecord(item);
    });
  }

  function getCurrentDataset() {
    return state.graphDatasets[state.graphMode] || { nodes: [], edges: [], clues: [] };
  }

  function getActiveClueId() {
    return state.activeClueIds[state.graphMode] || '';
  }

  function setActiveClueId(value) {
    state.activeClueIds[state.graphMode] = value || '';
  }

  function getActiveClue(dataset) {
    if (!dataset || !Array.isArray(dataset.clues) || !dataset.clues.length) {
      return null;
    }
    const activeClueId = getActiveClueId();
    return dataset.clues.find(function (clue) {
      return clue.id === activeClueId;
    }) || dataset.clues[0];
  }

  function buildGraphSubset(dataset, activeClue) {
    const source = dataset || { nodes: [], edges: [], clues: [] };
    if (!activeClue) {
      return source;
    }

    const focusNodeIds = new Set(activeClue.focusNodeIds || []);
    const focusEdgeIds = new Set(activeClue.focusEdgeIds || []);
    const nodes = (source.nodes || []).filter(function (entry) {
      const data = entry.data || entry;
      return focusNodeIds.has(data.id);
    });
    const visibleNodeIds = new Set(nodes.map(function (entry) {
      const data = entry.data || entry;
      return data.id;
    }));
    const edges = (source.edges || []).filter(function (entry) {
      const data = entry.data || entry;
      if (focusEdgeIds.size) {
        return focusEdgeIds.has(data.id);
      }
      return visibleNodeIds.has(data.source) && visibleNodeIds.has(data.target);
    });

    return {
      nodes: nodes,
      edges: edges,
      clues: [activeClue]
    };
  }

  function countStaticStrongEdges(dataset) {
    return (dataset && dataset.edges ? dataset.edges : []).filter(function (entry) {
      const data = entry.data || entry;
      return data.type === 'entity-entity';
    }).length;
  }

  function ensureGraphShell() {
    if (
      state.graphStage &&
      state.dynamicHost &&
      state.staticHost &&
      state.graphToolbar &&
      $graph.contains(state.graphStage) &&
      $graph.contains(state.graphToolbar)
    ) {
      return;
    }

    $graph.innerHTML = '';

    const stage = document.createElement('div');
    stage.className = 'clue-graph-stage';
    const dynamicHost = document.createElement('div');
    dynamicHost.className = 'clue-graph-host clue-graph-host-dynamic';
    const staticHost = document.createElement('div');
    staticHost.className = 'clue-graph-host clue-graph-host-static hidden';
    stage.appendChild(dynamicHost);
    stage.appendChild(staticHost);

    const toolbar = document.createElement('div');
    toolbar.className = 'dynamic-graph-controls clue-graph-toolbar';
    toolbar.innerHTML = [
      '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="fit">重置视图</button>',
      '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="labels">显示边标签</button>',
      '<button type="button" class="ghost-button ghost-button-compact" data-graph-action="mode" aria-pressed="false">切到静态KG</button>'
    ].join('');
    toolbar.addEventListener('click', handleGraphToolbarClick);

    $graph.appendChild(stage);
    $graph.appendChild(toolbar);

    state.graphStage = stage;
    state.dynamicHost = dynamicHost;
    state.staticHost = staticHost;
    state.graphToolbar = toolbar;
  }

  function setVisibleGraphHost(mode) {
    ensureGraphShell();
    if (!state.dynamicHost || !state.staticHost) {
      return;
    }
    const showStatic = mode === 'static';
    state.dynamicHost.classList.toggle('hidden', showStatic);
    state.staticHost.classList.toggle('hidden', !showStatic);
  }

  function updateGraphToolbar() {
    ensureGraphShell();
    const fitButton = state.graphToolbar.querySelector('[data-graph-action="fit"]');
    const labelsButton = state.graphToolbar.querySelector('[data-graph-action="labels"]');
    const modeButton = state.graphToolbar.querySelector('[data-graph-action="mode"]');

    if (fitButton) {
      fitButton.textContent = state.graphMode === 'dynamic' ? '重置视图' : '重置静态图';
    }

    if (labelsButton) {
      if (state.graphMode === 'dynamic') {
        labelsButton.disabled = false;
        labelsButton.textContent = state.edgeLabelsVisible ? '隐藏边标签' : '显示边标签';
      } else {
        labelsButton.disabled = true;
        labelsButton.textContent = '静态图无边标签';
      }
    }

    if (modeButton) {
      const staticMode = state.graphMode === 'static';
      modeButton.textContent = staticMode ? '切到动态KG' : '切到静态KG';
      modeButton.classList.toggle('is-active', staticMode);
      modeButton.setAttribute('aria-pressed', staticMode ? 'true' : 'false');
    }
  }

  function destroyDynamicRenderer() {
    if (!state.graphRenderer) {
      return;
    }
    state.graphRenderer.destroy();
    state.graphRenderer = null;
    if (state.dynamicHost) {
      state.dynamicHost.innerHTML = '';
    }
  }

  function destroyStaticRenderer() {
    if (!state.staticRenderer) {
      return;
    }
    state.staticRenderer.destroy();
    state.staticRenderer = null;
    state.staticDatasetRef = null;
    if (state.staticHost) {
      state.staticHost.innerHTML = '';
    }
  }

  function ensureDynamicRenderer() {
    ensureGraphShell();
    if (state.graphRenderer || typeof StaticGraphRenderer !== 'object') {
      return;
    }
    state.graphRenderer = StaticGraphRenderer.create(state.dynamicHost, {
      compact: false,
      enableDetail: true,
      showEdgeLabels: state.edgeLabelsVisible,
      showControls: false
    });
  }

  function ensureStaticRenderer() {
    ensureGraphShell();
    if (state.staticRenderer || typeof cytoscape !== 'function') {
      return;
    }

    state.staticHost.innerHTML = '';
    state.staticRenderer = cytoscape({
      container: state.staticHost,
      layout: { name: 'grid' },
      style: [
        {
          selector: 'node',
          style: {
            'font-family': 'inherit',
            'font-size': 11,
            'text-wrap': 'wrap',
            'text-max-width': 120,
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#111827',
            'border-width': 1,
            'border-color': '#d1d5db'
          }
        },
        {
          selector: 'node[type = "article"]',
          style: {
            'shape': 'round-rectangle',
            'width': 90,
            'height': 42,
            'background-color': '#eff6ff'
          }
        },
        {
          selector: 'node[type = "source"]',
          style: {
            'shape': 'diamond',
            'width': 52,
            'height': 52,
            'background-color': '#dbeafe'
          }
        },
        {
          selector: 'node[type = "category"]',
          style: {
            'shape': 'round-rectangle',
            'width': 64,
            'height': 34,
            'background-color': '#ecfeff'
          }
        },
        {
          selector: 'node[type = "entity"]',
          style: {
            'shape': 'ellipse',
            'width': 58,
            'height': 58,
            'background-color': '#eef2ff'
          }
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'width': 1.5,
            'opacity': 0.85
          }
        },
        {
          selector: 'edge[type = "entity-entity"]',
          style: {
            'line-color': '#8b5cf6',
            'target-arrow-shape': 'none',
            'width': 'mapData(weight, 2, 6, 2, 7)'
          }
        },
        {
          selector: '.is-dim',
          style: {
            'opacity': 0.12
          }
        },
        {
          selector: '.is-focus',
          style: {
            'opacity': 1,
            'border-width': 2,
            'border-color': '#2563eb',
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb',
            'z-index': 999
          }
        }
      ]
    });
  }

  function fitStaticGraph(activeClue) {
    if (!state.staticRenderer) {
      return;
    }

    const elements = state.staticRenderer.elements();
    if (!elements.length) {
      return;
    }

    if (!activeClue || state.graphView === 'all') {
      state.staticRenderer.fit(elements, 56);
      return;
    }

    const nodeIds = new Set(activeClue.focusNodeIds || []);
    const edgeIds = new Set(activeClue.focusEdgeIds || []);
    const focusCollection = elements.filter(function (element) {
      return element.isNode() ? nodeIds.has(element.id()) : edgeIds.has(element.id());
    });

    if (focusCollection.length) {
      state.staticRenderer.fit(focusCollection, 56);
      return;
    }

    state.staticRenderer.fit(elements, 56);
  }

  function applyStaticFocus(activeClue) {
    if (!state.staticRenderer) {
      return;
    }

    const elements = state.staticRenderer.elements();
    elements.removeClass('is-dim is-focus');

    if (!elements.length) {
      return;
    }

    if (!activeClue || state.graphView === 'all') {
      fitStaticGraph(null);
      return;
    }

    const nodeIds = new Set(activeClue.focusNodeIds || []);
    const edgeIds = new Set(activeClue.focusEdgeIds || []);

    elements.addClass('is-dim');

    state.staticRenderer.nodes().forEach(function (node) {
      if (nodeIds.has(node.id())) {
        node.removeClass('is-dim');
        node.addClass('is-focus');
      }
    });

    state.staticRenderer.edges().forEach(function (edge) {
      if (edgeIds.has(edge.id())) {
        edge.removeClass('is-dim');
        edge.addClass('is-focus');
      }
    });

    fitStaticGraph(activeClue);
  }

  function renderDynamicGraph(dataset, activeClue) {
    destroyStaticRenderer();
    setVisibleGraphHost('dynamic');
    ensureDynamicRenderer();
    updateGraphToolbar();

    if (!state.graphRenderer) {
      return;
    }

    const fullDataset = dataset || { nodes: [], edges: [], clues: [] };
    const renderedDataset = state.graphView === 'all' || !activeClue
      ? fullDataset
      : buildGraphSubset(fullDataset, activeClue);

    state.graphRenderer.options.showEdgeLabels = state.edgeLabelsVisible;
    state.graphRenderer.render(renderedDataset);
    state.graphRenderer.syncEdgeLabelVisibility();
    state.graphRenderer.setFocus(null);
    $graphMeta.textContent = renderedDataset.nodes.length + ' 个节点 · ' + renderedDataset.edges.length + ' 条边';
  }

  function renderStaticGraph(dataset, activeClue) {
    destroyDynamicRenderer();
    setVisibleGraphHost('static');
    ensureStaticRenderer();
    updateGraphToolbar();

    if (!state.staticRenderer) {
      if (state.staticHost) {
        state.staticHost.innerHTML = '<div class="dynamic-graph-empty">缺少静态图谱依赖。</div>';
      }
      $graphMeta.textContent = '静态图不可用';
      return;
    }

    const source = dataset || { nodes: [], edges: [], clues: [] };
    if (state.staticDatasetRef !== source) {
      state.staticRenderer.elements().remove();
      state.staticRenderer.add((source.nodes || []).concat(source.edges || []));
      state.staticDatasetRef = source;
      state.staticRenderer.layout({
        name: 'cose',
        animate: false,
        fit: true,
        padding: 28,
        nodeRepulsion: 4500,
        idealEdgeLength: function (edge) {
          return edge.data('type') === 'entity-entity' ? 160 : 100;
        }
      }).run();
    }

    state.staticRenderer.resize();
    applyStaticFocus(activeClue);
    window.requestAnimationFrame(function () {
      if (!state.staticRenderer || state.graphMode !== 'static') {
        return;
      }
      state.staticRenderer.resize();
      fitStaticGraph(activeClue);
    });
    $graphMeta.textContent = source.nodes.length + ' 个节点 · ' + countStaticStrongEdges(source) + ' 条强共现边';
  }

  function renderGraph(dataset, activeClue) {
    ensureGraphShell();
    if (state.graphMode === 'static') {
      renderStaticGraph(dataset, activeClue);
      return;
    }
    renderDynamicGraph(dataset, activeClue);
  }

  function renderGraphButton(activeClue) {
    if (!activeClue) {
      $showAllButton.classList.add('hidden');
      $showAllButton.disabled = true;
      $showAllButton.textContent = '浏览全部图';
      return;
    }

    $showAllButton.classList.remove('hidden');
    $showAllButton.disabled = false;
    const isAllView = state.graphView === 'all';
    $showAllButton.textContent = isAllView ? '返回线索子图' : '浏览全部图';
    $showAllButton.classList.toggle('is-active', isAllView);
  }

  function renderEvidence(activeClue, itemMap) {
    if (!activeClue) {
      $evidence.innerHTML = '<div class="term-placeholder">当前范围内还没有形成足够稳定的线索证据，请尝试扩大时间范围。</div>';
      return;
    }

    const items = (activeClue.evidenceIds || [])
      .map(function (articleId) { return itemMap.get(articleId); })
      .filter(Boolean)
      .sort(function (a, b) { return b.date.localeCompare(a.date); });

    $evidence.innerHTML = items.map(function (item, index) {
      return [
        '<article class="mini-card">',
        '<h4><a href="', AnalysisUtils.buildDetailLink(item, getCurrentPage()), '">#', String(index + 1), ' · ', escapeHtml(item.title), '</a></h4>',
        '<div class="meta">',
        '<span>', escapeHtml(item.id), '</span>',
        '<span>', escapeHtml(item.date), '</span>',
        '<span>', escapeHtml(item.source), '</span>',
        AnalysisUtils.parseCategories(item.category).map(function (category) {
          return '<span class="tag">' + escapeHtml(category) + '</span>';
        }).join(''),
        '</div>',
        '<p>', escapeHtml(item.summary || ''), '</p>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderNotes(dataset, filteredItems, activeClue, rangeLabel) {
    const modeLabel = state.graphMode === 'dynamic'
      ? '动态图 KG（结构化实体 / 事件）'
      : '静态 KG（上一版实体共现图）';
    const graphScale = state.graphMode === 'dynamic'
      ? dataset.nodes.length + ' 个节点，' + dataset.edges.length + ' 条边'
      : dataset.nodes.length + ' 个节点，' + countStaticStrongEdges(dataset) + ' 条强共现边';

    const lines = [
      '<p><strong>当前范围</strong>：' + escapeHtml(rangeLabel) + ' · ' + escapeHtml(state.category) + ' · ' + filteredItems.length + ' 条新闻</p>',
      '<p><strong>图谱模式</strong>：' + modeLabel + '</p>',
      '<p><strong>图谱规模</strong>：' + graphScale + '</p>',
      '<p><strong>线索数量</strong>：' + dataset.clues.length + ' 条</p>'
    ];

    if (activeClue) {
      lines.push('<p><strong>当前线索</strong>：' + escapeHtml(activeClue.title) + '。</p>');
      if (state.graphMode === 'dynamic') {
        lines.push('<p>当前子图来自静态 KG 信号记录的聚类，强调结构化实体、事件和关系，而不是正文分词的即时共现。</p>');
        if (activeClue.trendSignals && activeClue.trendSignals.length) {
          lines.push('<p><strong>趋势信号</strong>：' + escapeHtml(activeClue.trendSignals.join('；')) + '</p>');
        }
      } else if (state.graphView === 'all') {
        lines.push('<p>当前展示的是上一版静态共现图的全图视图，方便和新的动态图直接对照。</p>');
      } else {
        lines.push('<p>当前展示的是上一版静态共现图中的高亮子图，保留原有的实体共现视角。</p>');
      }
    } else if (state.graphMode === 'dynamic') {
      lines.push('<p><strong>说明</strong>：当前范围内还没有形成足够稳定的主题簇，因此仅展示动态图全图。</p>');
    } else {
      lines.push('<p><strong>说明</strong>：当前范围内尚未形成足够强的共现社区，因此仅展示静态图全图。</p>');
    }

    $notes.innerHTML = lines.join('');
  }

  function renderClues(dataset, filteredItems) {
    const source = dataset || { nodes: [], edges: [], clues: [] };
    const itemMap = new Map(filteredItems.map(function (item) {
      return [item.id, item];
    }));
    const rangeLabel = AnalysisUtils.formatDateRangeLabel(state.startDate, state.endDate);

    if (!source.clues.length) {
      setActiveClueId('');
      state.graphView = 'all';
      $list.innerHTML = state.graphMode === 'dynamic'
        ? '<div class="term-placeholder">当前范围内还没有足够稳定的主题簇，图中仍可查看实体、事件与证据文章。</div>'
        : '<div class="term-placeholder">当前范围内的强共现社区不足，暂时没有可归纳的线索卡片。</div>';
      renderGraphButton(null);
      renderEvidence(null, itemMap);
      renderNotes(source, filteredItems, null, rangeLabel);
      renderGraph(source, null);
      return;
    }

    if (!source.clues.some(function (clue) { return clue.id === getActiveClueId(); })) {
      setActiveClueId(source.clues[0].id);
      state.graphView = 'clue';
    }

    const activeClue = getActiveClue(source);
    renderGraphButton(activeClue);

    $list.innerHTML = source.clues.map(function (clue) {
      const eventTypeMarkup = clue.eventTypes && clue.eventTypes.length
        ? '<div class="term-day-list">' + clue.eventTypes.map(function (eventType) {
          return '<span class="mini-tag">' + escapeHtml(eventType) + '</span>';
        }).join('') + '</div>'
        : '';
      const signalMarkup = clue.trendSignals && clue.trendSignals.length
        ? '<div class="clue-signal-list">' + clue.trendSignals.map(function (signal) {
          return '<span class="match-badge">' + escapeHtml(signal) + '</span>';
        }).join('') + '</div>'
        : '';

      return [
        '<article class="clue-card ', clue.id === activeClue.id ? 'is-active' : '', '">',
        '<div class="clue-card-head">',
        '<div>',
        '<h3>', escapeHtml(clue.title), '</h3>',
        eventTypeMarkup,
        '</div>',
        '<button class="ghost-button ghost-button-compact" data-clue-id="', clue.id, '" type="button">查看子图</button>',
        '</div>',
        '<p>', escapeHtml(clue.summary), '</p>',
        '<div class="term-day-list">',
        (clue.coreEntities || []).map(function (entry) {
          return '<span class="mini-tag">' + escapeHtml(entry) + '</span>';
        }).join(''),
        '<span class="mini-tag">', escapeHtml(clue.dominantCategory || '多主题'), '</span>',
        '</div>',
        signalMarkup,
        '</article>'
      ].join('');
    }).join('');

    renderEvidence(activeClue, itemMap);
    renderNotes(source, filteredItems, activeClue, rangeLabel);
    renderGraph(source, activeClue);
  }

  function renderCurrentView() {
    renderClues(getCurrentDataset(), getFilteredItems());
  }

  function fitCurrentGraph() {
    const dataset = getCurrentDataset();
    const activeClue = getActiveClue(dataset);

    if (state.graphMode === 'dynamic') {
      if (state.graphRenderer) {
        state.graphRenderer.fitToAll();
      }
      return;
    }

    fitStaticGraph(activeClue);
  }

  function handleGraphToolbarClick(event) {
    const button = event.target.closest('button[data-graph-action]');
    if (!button) {
      return;
    }

    const action = button.getAttribute('data-graph-action');
    if (action === 'fit') {
      fitCurrentGraph();
      return;
    }

    if (action === 'labels') {
      if (state.graphMode !== 'dynamic') {
        return;
      }
      state.edgeLabelsVisible = !state.edgeLabelsVisible;
      if (state.graphRenderer) {
        state.graphRenderer.options.showEdgeLabels = state.edgeLabelsVisible;
        state.graphRenderer.syncEdgeLabelVisibility();
      }
      updateGraphToolbar();
      return;
    }

    if (action === 'mode') {
      state.graphMode = state.graphMode === 'dynamic' ? 'static' : 'dynamic';
      renderCurrentView();
    }
  }

  function render() {
    const filteredItems = getFilteredItems();
    const rangeLabel = AnalysisUtils.formatDateRangeLabel(state.startDate, state.endDate);

    renderPresetButtons();
    renderCategoryChips();
    syncControls();
    updateGraphToolbar();

    $summary.textContent = rangeLabel + ' · ' + state.category + ' · ' + filteredItems.length + ' 条新闻';

    if (!filteredItems.length) {
      state.graphDatasets.dynamic = { nodes: [], edges: [], clues: [] };
      state.graphDatasets.static = { nodes: [], edges: [], clues: [] };
      $empty.classList.remove('hidden');
      $empty.textContent = '当前范围内没有可用新闻，请调整日期或分类。';
      $list.innerHTML = '';
      $evidence.innerHTML = '<div class="term-placeholder">暂无证据新闻。</div>';
      $notes.innerHTML = '<p>请先调整筛选条件以生成线索图谱。</p>';
      renderGraph(getCurrentDataset(), null);
      return;
    }

    $empty.classList.add('hidden');

    const signalRecords = getSignalRecordsForItems(filteredItems);
    state.graphDatasets.dynamic = KGUtils.buildKnowledgeGraphFromRecords(signalRecords, {
      rangeLabel: rangeLabel,
      maxClues: 6
    });
    state.graphDatasets.static = AnalysisUtils.buildClueGraph(filteredItems, {
      rangeLabel: rangeLabel,
      maxEntities: 40,
      minEntityEdgeWeight: 2,
      maxClues: 5
    });

    renderCurrentView();
  }

  function handleManualDateChange() {
    state.preset = 'custom';
    state.startDate = $startDate.value;
    state.endDate = $endDate.value;
    normalizeDateRange();
    render();
  }

  function initSignalRecordMap(items, kgPayloads) {
    const signalRecordMap = new Map();

    (kgPayloads || []).forEach(function (payload) {
      if (!payload || !Array.isArray(payload.signal_records)) {
        return;
      }
      payload.signal_records.forEach(function (record) {
        if (record.article_id) {
          signalRecordMap.set(record.article_id, record);
        }
      });
    });

    items.forEach(function (item) {
      if (!signalRecordMap.has(item.id)) {
        signalRecordMap.set(item.id, KGUtils.buildRuleSignalRecord(item));
      }
    });

    state.signalRecordMap = signalRecordMap;
  }

  function initEvents() {
    $presets.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-preset]');
      if (!button) {
        return;
      }
      setPreset(button.getAttribute('data-preset'));
      render();
    });

    $categories.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-category]');
      if (!button) {
        return;
      }
      state.category = button.getAttribute('data-category') || '全部分类';
      render();
    });

    $startDate.addEventListener('change', handleManualDateChange);
    $endDate.addEventListener('change', handleManualDateChange);

    $list.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-clue-id]');
      if (!button || !getCurrentDataset()) {
        return;
      }
      setActiveClueId(button.getAttribute('data-clue-id') || '');
      state.graphView = 'clue';
      renderCurrentView();
    });

    $showAllButton.addEventListener('click', function () {
      if ($showAllButton.disabled) {
        return;
      }
      state.graphView = state.graphView === 'all' ? 'clue' : 'all';
      renderCurrentView();
    });

    window.addEventListener('resize', function () {
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(function () {
        if (state.graphMode === 'static' && state.staticRenderer) {
          state.staticRenderer.resize();
          fitStaticGraph(getActiveClue(getCurrentDataset()));
        }
      }, 160);
    });
  }

  function init() {
    ensureGraphShell();
    state.days = NewsStore.getAvailableDays();
    populateDateOptions();
    setPreset(state.preset);
    initEvents();

    AnalysisUtils.bindFullscreenToggle($fullscreenToggle, $graph, {
      onChange: function () {
        window.requestAnimationFrame(function () {
          renderGraph(getCurrentDataset(), getActiveClue(getCurrentDataset()));
        });
      }
    });

    Promise.allSettled([NewsStore.preloadAll(), KGStore.preloadAll()])
      .then(function (results) {
        const newsResult = results[0];
        const kgResult = results[1];
        if (!newsResult || newsResult.status !== 'fulfilled') {
          throw new Error('news');
        }

        state.allItems = newsResult.value;
        initSignalRecordMap(
          newsResult.value,
          kgResult && kgResult.status === 'fulfilled' ? kgResult.value : []
        );
        render();
      })
      .catch(function () {
        $summary.textContent = '历史新闻加载失败。';
        $empty.classList.remove('hidden');
        $list.innerHTML = '<div class="term-placeholder">无法生成线索图谱，请检查本地服务或静态产物目录。</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
