(function (global) {
  function getTypeStyles() {
    return (global.StaticGraphRenderer && global.StaticGraphRenderer.TYPE_STYLES) || {
      entity: { fill: '#eef2ff', stroke: '#a5b4fc', label: '实体' },
      topic: { fill: '#fae8ff', stroke: '#e879f9', label: '知识' }
    };
  }

  function getTypeStyle(node) {
    const styles = getTypeStyles();
    return styles[node && node.type] || styles.entity;
  }

  function truncateLabel(label, maxLength) {
    const text = String(label || '');
    if (!text) {
      return '';
    }
    if (typeof AnalysisUtils === 'object' && typeof AnalysisUtils.isSentenceLikeLabel === 'function' && AnalysisUtils.isSentenceLikeLabel(text)) {
      return '';
    }
    const limit = maxLength || 14;
    return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
  }

  function Graph3DRenderer(container, options) {
    this.container = container;
    this.options = Object.assign({
      compact: false,
      showEdgeLabels: false,
      background: '#f8fafc'
    }, options || {});
    this.graph = null;
    this.dataset = null;
    this.stage = null;
    this.legend = null;
    this.emptyState = null;
    this.caption = null;
    this.resizeTimer = 0;
    this.boundHandleResize = null;
    this.setup();
  }

  Graph3DRenderer.prototype.setup = function () {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = '';
    this.container.classList.add('graph-3d-root');

    this.stage = document.createElement('div');
    this.stage.className = 'graph-3d-stage';
    this.container.appendChild(this.stage);

    this.caption = document.createElement('div');
    this.caption.className = 'graph-3d-caption';
    this.caption.textContent = '拖转旋转 · 滚轮缩放 · 悬停看名称';
    this.container.appendChild(this.caption);

    this.emptyState = document.createElement('div');
    this.emptyState.className = 'dynamic-graph-empty hidden';
    this.emptyState.textContent = '当前图谱暂无可展示的数据。';
    this.container.appendChild(this.emptyState);

    this.legend = document.createElement('div');
    this.legend.className = 'dynamic-graph-legend hidden';
    this.container.appendChild(this.legend);

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
  };

  Graph3DRenderer.prototype.handleResize = function () {
    const self = this;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(function () {
      self.syncSize();
    }, 160);
  };

  Graph3DRenderer.prototype.syncSize = function () {
    if (!this.graph || !this.container) {
      return;
    }
    const width = Math.max(280, this.container.clientWidth || 320);
    const height = Math.max(this.options.compact ? 240 : 420, this.container.clientHeight || (this.options.compact ? 280 : 620));
    this.graph.width(width).height(height);
  };

  Graph3DRenderer.prototype.prepareData = function (dataset) {
    if (global.StaticGraphRenderer && typeof global.StaticGraphRenderer.prepareData === 'function') {
      return global.StaticGraphRenderer.prepareData(dataset);
    }
    return { nodes: [], edges: [] };
  };

  Graph3DRenderer.prototype.toGraphData = function (prepared) {
    return {
      nodes: (prepared.nodes || []).map(function (node) {
        const style = getTypeStyle(node);
        return {
          id: node.id,
          name: node.label,
          label: node.label,
          type: node.type,
          color: style.stroke,
          fill: style.fill
        };
      }),
      links: (prepared.edges || []).map(function (edge) {
        return {
          id: edge.id,
          source: edge.source && edge.source.id ? edge.source.id : edge.source,
          target: edge.target && edge.target.id ? edge.target.id : edge.target,
          label: edge.label || '',
          weight: edge.weight || 1
        };
      })
    };
  };

  Graph3DRenderer.prototype.ensureGraph = function () {
    if (this.graph || !this.container) {
      return this.graph;
    }
    if (typeof ForceGraph3D !== 'function') {
      this.emptyState.classList.remove('hidden');
      this.emptyState.textContent = '缺少 3D 图谱依赖。';
      return null;
    }

    const self = this;
    const create = ForceGraph3D({
      controlType: 'orbit',
      rendererConfig: { antialias: true, alpha: true }
    });
    this.graph = create(this.stage)
      .backgroundColor(this.options.background)
      .showNavInfo(false)
      .nodeId('id')
      .nodeLabel(function (node) { return node.label || node.name || ''; })
      .nodeColor(function (node) { return node.color; })
      .nodeRelSize(this.options.compact ? 5 : 6.4)
      .nodeOpacity(0.94)
      .linkLabel(function (link) { return link.label || ''; })
      .linkColor(function () { return '#64748b'; })
      .linkWidth(function (link) { return Math.max(0.35, Math.min(2.4, 0.35 + Number(link.weight || 1) * 0.28)); })
      .linkOpacity(0.7)
      .linkDirectionalArrowLength(2.8)
      .linkDirectionalArrowRelPos(0.92)
      .cooldownTicks(90)
      .onNodeHover(function (node) {
        if (!self.caption) {
          return;
        }
        self.caption.textContent = node && node.label
          ? node.label
          : '拖转旋转 · 滚轮缩放 · 悬停看名称';
      })
      .onEngineStop(function () {
        self.fitToAll({ animate: false });
      });

    try {
      if (typeof SpriteText === 'function') {
        this.graph
          .nodeThreeObject(function (node) {
            const text = truncateLabel(node.label, self.options.compact ? 10 : 14);
            if (!text) {
              return false;
            }
            const sprite = new SpriteText(text);
            sprite.color = '#1e293b';
            sprite.backgroundColor = 'rgba(255,255,255,0.9)';
            sprite.padding = 1.6;
            sprite.borderWidth = 0.35;
            sprite.borderColor = node.color || '#93c5fd';
            sprite.borderRadius = 2.4;
            sprite.textHeight = self.options.compact ? 3.4 : 4.2;
            return sprite;
          })
          .nodeThreeObjectExtend(true);
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('3D node labels fallback to hover tooltips.', error);
      }
    }

    this.applyLinkLabels();
    this.syncSize();
    return this.graph;
  };

  Graph3DRenderer.prototype.applyLinkLabels = function () {
    if (!this.graph || typeof SpriteText !== 'function') {
      return;
    }
    const self = this;
    try {
      if (!this.options.showEdgeLabels) {
        this.graph.linkThreeObject(null).linkThreeObjectExtend(false);
        return;
      }
      this.graph
        .linkThreeObject(function (link) {
          if (!link.label) {
            return false;
          }
          const sprite = new SpriteText(link.label);
          sprite.color = '#e2e8f0';
          sprite.backgroundColor = 'rgba(15,23,42,0.78)';
          sprite.padding = 1.4;
          sprite.textHeight = self.options.compact ? 2.8 : 3.2;
          return sprite;
        })
        .linkThreeObjectExtend(true)
        .linkPositionUpdate(function (obj, coords) {
          if (!obj || !coords) {
            return;
          }
          obj.position.x = coords.start.x + (coords.end.x - coords.start.x) / 2;
          obj.position.y = coords.start.y + (coords.end.y - coords.start.y) / 2;
          obj.position.z = coords.start.z + (coords.end.z - coords.start.z) / 2;
        });
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('3D edge labels fallback to hover tooltips.', error);
      }
    }
  };

  Graph3DRenderer.prototype.renderLegend = function (nodes) {
    const styles = getTypeStyles();
    const seen = [];
    const used = new Set();
    (nodes || []).forEach(function (node) {
      if (used.has(node.type)) {
        return;
      }
      used.add(node.type);
      seen.push(node.type);
    });
    if (!seen.length) {
      this.legend.classList.add('hidden');
      return;
    }
    this.legend.classList.remove('hidden');
    this.legend.innerHTML = seen.map(function (type) {
      const style = styles[type] || styles.entity;
      return [
        '<span class="dynamic-graph-legend-item">',
        '<span class="dynamic-graph-legend-dot" style="background:',
        style.fill,
        ';border-color:',
        style.stroke,
        '"></span>',
        style.label || type,
        '</span>'
      ].join('');
    }).join('');
  };

  Graph3DRenderer.prototype.render = function (dataset) {
    this.dataset = dataset || { nodes: [], edges: [] };
    const prepared = this.prepareData(this.dataset);
    if (!prepared.nodes.length) {
      if (this.graph && typeof this.graph.pauseAnimation === 'function') {
        this.graph.pauseAnimation();
      }
      this.emptyState.classList.remove('hidden');
      this.legend.classList.add('hidden');
      return;
    }
    this.emptyState.classList.add('hidden');
    this.renderLegend(prepared.nodes);
    if (!this.ensureGraph()) {
      return;
    }
    this.graph.graphData(this.toGraphData(prepared));
    this.applyLinkLabels();
    this.syncSize();
  };

  Graph3DRenderer.prototype.setEdgeLabelsVisible = function (visible) {
    this.options.showEdgeLabels = !!visible;
    this.applyLinkLabels();
  };

  Graph3DRenderer.prototype.syncEdgeLabelVisibility = function () {
    this.applyLinkLabels();
  };

  Graph3DRenderer.prototype.fitToAll = function (options) {
    if (!this.graph || typeof this.graph.zoomToFit !== 'function') {
      return;
    }
    const settings = Object.assign({ animate: true }, options || {});
    this.graph.zoomToFit(settings.animate ? 380 : 0, this.options.compact ? 28 : 48);
  };

  Graph3DRenderer.prototype.setFocus = function () {
    return;
  };

  Graph3DRenderer.prototype.destroy = function () {
    window.clearTimeout(this.resizeTimer);
    if (this.boundHandleResize) {
      window.removeEventListener('resize', this.boundHandleResize);
      this.boundHandleResize = null;
    }
    if (this.graph) {
      if (typeof this.graph.pauseAnimation === 'function') {
        this.graph.pauseAnimation();
      }
      if (typeof this.graph._destructor === 'function') {
        this.graph._destructor();
      }
      this.graph = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
      this.container.classList.remove('graph-3d-root');
    }
  };

  global.StaticGraph3DRenderer = {
    create: function (container, options) {
      return new Graph3DRenderer(container, options);
    },
    isAvailable: function () {
      return typeof ForceGraph3D === 'function';
    }
  };
})(window);
