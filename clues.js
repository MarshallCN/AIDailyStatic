(function () {
  const PRESETS = [
    { id: '3d', label: '最近 3 天', days: 3 },
    { id: '7d', label: '最近 7 天', days: 7 },
    { id: '14d', label: '最近 14 天', days: 14 },
    { id: 'all', label: '全部', days: 0 }
  ];

  const state = {
    allItems: [],
    days: [],
    preset: '7d',
    startDate: '',
    endDate: '',
    category: '全部分类',
    activeClueId: '',
    graphData: null,
    cy: null
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

  function escapeHtml(value) {
    return AnalysisUtils.escapeHtml(value);
  }

  function getCurrentPage() {
    const fileName = window.location.pathname.split('/').pop();
    return fileName || 'clues.html';
  }

  function getPresetRange(presetId) {
    const preset = PRESETS.find((entry) => entry.id === presetId) || PRESETS[1];
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

  function syncControls() {
    $startDate.value = state.startDate;
    $endDate.value = state.endDate;
  }

  function renderPresetButtons() {
    $presets.innerHTML = PRESETS.map((preset) => `
      <button class="chip ${preset.id === state.preset ? 'active' : ''}" data-preset="${preset.id}" type="button">${preset.label}</button>
    `).join('');
  }

  function renderCategoryChips() {
    const categories = ['全部分类'].concat(AnalysisUtils.FIXED_CATEGORIES);
    $categories.innerHTML = categories.map((category) => `
      <button class="chip ${category === state.category ? 'active' : ''}" data-category="${category}" type="button">${category}</button>
    `).join('');
  }

  function populateDateOptions() {
    const options = state.days.map((day) => `<option value="${day}">${day}</option>`).join('');
    $startDate.innerHTML = options;
    $endDate.innerHTML = options;
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

  function ensureCy() {
    if (state.cy || typeof cytoscape !== 'function') {
      return;
    }

    state.cy = cytoscape({
      container: $graph,
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

  function updateGraph(dataset) {
    ensureCy();
    if (!state.cy) {
      return;
    }

    state.cy.elements().remove();
    state.cy.add(dataset.nodes.concat(dataset.edges));
    state.cy.layout({
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

  function applyFocus(clue) {
    if (!state.cy) {
      return;
    }

    state.cy.elements().removeClass('is-dim is-focus');

    if (!clue) {
      return;
    }

    const nodeIds = new Set(clue.focusNodeIds || []);
    const edgeIds = new Set(clue.focusEdgeIds || []);
    state.cy.elements().addClass('is-dim');

    state.cy.nodes().forEach((node) => {
      if (nodeIds.has(node.id())) {
        node.removeClass('is-dim');
        node.addClass('is-focus');
      }
    });

    state.cy.edges().forEach((edge) => {
      if (edgeIds.has(edge.id())) {
        edge.removeClass('is-dim');
        edge.addClass('is-focus');
      }
    });

    const focusCollection = state.cy.elements().filter((element) => {
      return element.isNode() ? nodeIds.has(element.id()) : edgeIds.has(element.id());
    });

    if (focusCollection.length) {
      state.cy.fit(focusCollection, 56);
    }
  }

  function renderEvidence(activeClue, itemMap) {
    if (!activeClue) {
      $evidence.innerHTML = '<div class="term-placeholder">当前范围内的共现强度不足以形成稳定线索，请尝试扩大时间范围或切换分类。</div>';
      return;
    }

    const evidenceItems = activeClue.evidenceIds
      .map((id) => itemMap.get(id))
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));

    $evidence.innerHTML = evidenceItems.map((item) => `
      <article class="mini-card">
        <h4><a href="${AnalysisUtils.buildDetailLink(item, getCurrentPage())}">${escapeHtml(item.title)}</a></h4>
        <div class="meta">
          <span>${escapeHtml(item.date)}</span>
          <span>${escapeHtml(item.source)}</span>
          ${AnalysisUtils.parseCategories(item.category).map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join('')}
        </div>
        <p>${escapeHtml(AnalysisUtils.extractSnippet(item.summary || item.detail, activeClue.coreEntities, 160))}</p>
      </article>
    `).join('');
  }

  function renderNotes(dataset, filteredItems, activeClue, rangeLabel) {
    const strongEdges = dataset.edges.filter((edge) => edge.data.type === 'entity-entity').length;
    const clueCount = dataset.clues.length;
    const itemCount = filteredItems.length;

    const lines = [
      `<p><strong>当前范围</strong>：${escapeHtml(rangeLabel)} · ${escapeHtml(state.category)} · ${itemCount} 条新闻</p>`,
      `<p><strong>图谱规模</strong>：${dataset.nodes.length} 个节点，${strongEdges} 条强共现边</p>`,
      `<p><strong>线索数量</strong>：${clueCount} 条</p>`
    ];

    if (activeClue) {
      lines.push(`<p><strong>当前子图</strong>：${escapeHtml(activeClue.title)}。线索只依据重复出现、共同出现和跨分类聚集等可解释信号生成，不做因果断言。</p>`);
    } else {
      lines.push('<p><strong>说明</strong>：当前范围内尚未形成足够强的共现社区，因此没有激活的线索子图。</p>');
    }

    $notes.innerHTML = lines.join('');
  }

  function renderClueCards(dataset, itemMap, rangeLabel, filteredItems) {
    if (!dataset.clues.length) {
      state.activeClueId = '';
      $list.innerHTML = '<div class="term-placeholder">当前范围内的强共现社区不足，暂时没有可归纳的线索卡片。</div>';
      renderEvidence(null, itemMap);
      renderNotes(dataset, filteredItems, null, rangeLabel);
      applyFocus(null);
      return;
    }

    if (!dataset.clues.some((clue) => clue.id === state.activeClueId)) {
      state.activeClueId = dataset.clues[0].id;
    }

    const activeClue = dataset.clues.find((clue) => clue.id === state.activeClueId) || dataset.clues[0];

    $list.innerHTML = dataset.clues.map((clue) => `
      <article class="clue-card ${clue.id === activeClue.id ? 'is-active' : ''}">
        <div class="clue-card-head">
          <h3>${escapeHtml(clue.title)}</h3>
          <button class="ghost-button" data-clue-id="${clue.id}" type="button">查看子图</button>
        </div>
        <p>${escapeHtml(clue.summary)}</p>
        <div class="term-day-list">
          ${clue.coreEntities.map((entity) => `<span class="mini-tag">${escapeHtml(entity)}</span>`).join('')}
          <span class="mini-tag">${escapeHtml(clue.dominantCategory || '多主题')}</span>
        </div>
      </article>
    `).join('');

    renderEvidence(activeClue, itemMap);
    renderNotes(dataset, filteredItems, activeClue, rangeLabel);
    applyFocus(activeClue);
  }

  function render() {
    const filteredItems = getFilteredItems();
    const rangeLabel = AnalysisUtils.formatDateRangeLabel(state.startDate, state.endDate);
    const itemMap = new Map(filteredItems.map((item) => [item.id, item]));

    renderPresetButtons();
    renderCategoryChips();
    syncControls();

    $summary.textContent = `${rangeLabel} · ${state.category} · ${filteredItems.length} 条新闻`;

    if (!filteredItems.length) {
      $empty.classList.remove('hidden');
      $empty.textContent = '当前范围内没有可用新闻，请调整日期范围或切换分类。';
      $list.innerHTML = '';
      $evidence.innerHTML = '<div class="term-placeholder">暂无证据新闻。</div>';
      $notes.innerHTML = '<p>请先调整筛选条件以生成线索图谱。</p>';
      if (state.cy) {
        state.cy.elements().remove();
      }
      return;
    }

    const dataset = AnalysisUtils.buildClueGraph(filteredItems, {
      rangeLabel: rangeLabel,
      maxEntities: 40,
      minEntityEdgeWeight: 2,
      maxClues: 5
    });

    state.graphData = dataset;
    updateGraph(dataset);
    $graphMeta.textContent = `${dataset.nodes.length} 个节点 · ${dataset.edges.filter((edge) => edge.data.type === 'entity-entity').length} 条强共现边`;

    if (!dataset.clues.length) {
      $empty.classList.remove('hidden');
      $empty.textContent = '当前范围内的实体共现强度不足，图谱仍可查看，但线索卡片会较少。';
    } else {
      $empty.classList.add('hidden');
    }

    renderClueCards(dataset, itemMap, rangeLabel, filteredItems);
  }

  function handleManualDateChange() {
    state.preset = 'custom';
    state.startDate = $startDate.value;
    state.endDate = $endDate.value;
    normalizeDateRange();
    render();
  }

  function initEvents() {
    $presets.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-preset]');
      if (!button) return;
      setPreset(button.getAttribute('data-preset'));
      render();
    });

    $categories.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-category]');
      if (!button) return;
      state.category = button.getAttribute('data-category') || '全部分类';
      render();
    });

    $startDate.addEventListener('change', handleManualDateChange);
    $endDate.addEventListener('change', handleManualDateChange);

    $list.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-clue-id]');
      if (!button || !state.graphData) return;
      state.activeClueId = button.getAttribute('data-clue-id') || '';
      render();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (state.graphData) {
          render();
        }
      }, 180);
    });
  }

  function init() {
    state.days = NewsStore.getAvailableDays();
    populateDateOptions();
    setPreset(state.preset);
    initEvents();

    NewsStore.preloadAll()
      .then((items) => {
        state.allItems = items;
        render();
      })
      .catch(() => {
        $summary.textContent = '历史新闻加载失败。';
        $empty.classList.remove('hidden');
        $list.innerHTML = '<div class="term-placeholder">无法生成线索图谱，请检查本地服务或新闻数据格式。</div>';
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
