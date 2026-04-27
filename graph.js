window.GRAPH = (function () {
  const session = window.MOCK_SESSION;

  const NODE_R_MAIN = 14;
  const NODE_R_TANGENT = 10;
  const ROW_H = 70;
  const COL_W = 110;

  const TAG_PALETTE = [
    '#7aa2f7', '#9ece6a', '#bb9af7', '#e0af68', '#f7768e',
    '#73daca', '#ff9e64', '#7dcfff', '#c0caf5', '#cfc9c2'
  ];

  let nextTangentCounter = 1;
  let nextTagColorIdx = Object.keys(session.tags).length;

  const state = {
    nodeStates: {},
    selectedId: null,
    showPruned: false,
    isLoading: false,
  };
  session.nodes.forEach(n => state.nodeStates[n.id] = 'active');

  let nodeById = {};
  let childrenMap = {};
  let branchCols = {};
  let secondaryEdges = [];

  // ============ Indices ============
  function rebuildIndices() {
    nodeById = {};
    childrenMap = {};
    session.nodes.forEach(n => {
      nodeById[n.id] = n;
      if (n.parent_id) {
        if (!childrenMap[n.parent_id]) childrenMap[n.parent_id] = [];
        childrenMap[n.parent_id].push(n.id);
      }
    });
    branchCols = computeBranchColumns();
    session.nodes.forEach((n, i) => {
      n._row = i;
      n._col = branchCols[n.branch] != null ? branchCols[n.branch] : 0;
      n._x = n._col * COL_W;
      n._y = n._row * ROW_H;
    });
    secondaryEdges = computeSecondaryEdges();
  }

  function getDescendants(id) {
    const out = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      out.push(cur);
      (childrenMap[cur] || []).forEach(c => stack.push(c));
    }
    return out;
  }

  function isVisible(id) {
    const s = state.nodeStates[id];
    if (s === 'destructively_pruned') return state.showPruned;
    return true;
  }

  function isActive(id) {
    return state.nodeStates[id] === 'active';
  }

  function computeBranchColumns() {
    if (!session.nodes.length) return {};
    const cols = { main: 0 };
    const branchParents = {};
    for (const n of session.nodes) {
      if (branchParents[n.branch] === undefined) {
        const p = n.parent_id ? session.nodes.find(x => x.id === n.parent_id) : null;
        branchParents[n.branch] = p ? p.branch : null;
      }
    }
    let leftMax = 0, rightMax = 0;
    for (const n of session.nodes) {
      if (cols[n.branch] !== undefined) continue;
      const parentBranch = branchParents[n.branch];
      const parentCol = cols[parentBranch] != null ? cols[parentBranch] : 0;
      if (parentCol === 0) {
        if (Math.abs(leftMax) <= rightMax) {
          leftMax -= 1;
          cols[n.branch] = leftMax;
        } else {
          rightMax += 1;
          cols[n.branch] = rightMax;
        }
      } else if (parentCol < 0) {
        leftMax = Math.min(leftMax, parentCol - 1);
        cols[n.branch] = leftMax;
      } else {
        rightMax = Math.max(rightMax, parentCol + 1);
        cols[n.branch] = rightMax;
      }
    }
    return cols;
  }

  function computeSecondaryEdges() {
    const edges = [];
    const byTag = {};
    for (const n of session.nodes) {
      if (!byTag[n.tag]) byTag[n.tag] = [];
      byTag[n.tag].push(n);
    }
    for (const tag in byTag) {
      const arr = byTag[tag];
      for (let i = 0; i < arr.length - 1; i++) {
        const a = arr[i], b = arr[i + 1];
        if (b.parent_id === a.id || a.parent_id === b.id) continue;
        edges.push({ source: a, target: b, tag });
      }
    }
    return edges;
  }

  // ============ Side panel ============
  function renderLegend() {
    const list = document.getElementById('legend-list');
    list.innerHTML = '';
    const counts = {};
    session.nodes.forEach(n => counts[n.tag] = (counts[n.tag] || 0) + 1);
    const tagKeys = Object.keys(session.tags);
    if (!tagKeys.length) {
      const li = document.createElement('li');
      li.style.color = 'var(--fg-3)';
      li.style.justifyContent = 'center';
      li.textContent = '(no tags yet)';
      list.appendChild(li);
      return;
    }
    for (const tag of tagKeys) {
      const cfg = session.tags[tag];
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = cfg.color;
      const lbl = document.createElement('span');
      lbl.textContent = cfg.label || tag;
      const cnt = document.createElement('span');
      cnt.className = 'legend-count';
      const c = counts[tag] || 0;
      cnt.textContent = c + (c === 1 ? ' node' : ' nodes');
      li.appendChild(sw);
      li.appendChild(lbl);
      li.appendChild(cnt);
      list.appendChild(li);
    }
  }

  function updateStats() {
    let active = 0, soft = 0, destructive = 0;
    Object.values(state.nodeStates).forEach(s => {
      if (s === 'active') active++;
      else if (s === 'soft_pruned') soft++;
      else if (s === 'destructively_pruned') destructive++;
    });
    document.getElementById('stat-total').textContent = session.nodes.length;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-soft').textContent = soft;
    document.getElementById('stat-destructive').textContent = destructive;
  }

  function updateScore() {
    const activeNodes = session.nodes.filter(n => isActive(n.id));
    const avg = activeNodes.length
      ? activeNodes.reduce((s, n) => s + n.relevance, 0) / activeNodes.length
      : 0;
    const rot = activeNodes.length ? Math.round((1 - avg) * 100) : 0;
    const level = rot < 25 ? 'low' : rot < 55 ? 'mid' : 'high';
    const valueEl = document.getElementById('rotten-value');
    const fillEl = document.getElementById('rotten-bar-fill');
    valueEl.textContent = activeNodes.length ? rot + '%' : '—';
    valueEl.dataset.level = level;
    fillEl.style.width = rot + '%';
    fillEl.dataset.level = level;
  }

  function updateObjective() {
    document.getElementById('objective-text').textContent = session.objective || '(no objective set)';
  }

  // ============ SVG / Zoom ============
  const svg = d3.select('#graph-svg');
  let zoomLayer, gPrimary, gSecondary, gNodes, emptyText;
  let zoom;

  function initSvg() {
    svg.selectAll('*').remove();
    const defs = svg.append('defs');
    const pattern = defs.append('pattern')
      .attr('id', 'soft-stripes')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6).attr('height', 6)
      .attr('patternTransform', 'rotate(45)');
    pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'transparent');
    pattern.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', 0).attr('y2', 6)
      .attr('stroke', '#e0af68').attr('stroke-width', 2);

    zoomLayer = svg.append('g').attr('class', 'zoom-layer');
    gSecondary = zoomLayer.append('g').attr('class', 'edges-secondary');
    gPrimary = zoomLayer.append('g').attr('class', 'edges-primary');
    gNodes = zoomLayer.append('g').attr('class', 'nodes');

    emptyText = svg.append('text')
      .attr('class', 'empty-state')
      .attr('text-anchor', 'middle')
      .style('display', 'none')
      .text('No conversation yet. Type a message below to start.');

    zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .filter(event => !event.button && event.type !== 'dblclick')
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform);
      });

    svg.call(zoom).on('dblclick.zoom', null);
  }

  function resizeSvg() {
    const wrapper = document.getElementById('canvas-wrapper');
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    svg.attr('width', w).attr('height', h);
    if (emptyText) emptyText.attr('x', w / 2).attr('y', h / 2);
  }

  function fitToContent(animate) {
    if (!session.nodes.length) return;
    const wrapper = document.getElementById('canvas-wrapper');
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (!w || !h) return;
    const padding = 60;
    const xs = session.nodes.map(n => n._x);
    const ys = session.nodes.map(n => n._y);
    const minX = Math.min.apply(null, xs) - padding;
    const maxX = Math.max.apply(null, xs) + padding;
    const minY = Math.min.apply(null, ys) - padding;
    const maxY = Math.max.apply(null, ys) + padding;
    const scale = Math.min(w / (maxX - minX), h / (maxY - minY), 1.5);
    const tx = w / 2 - (minX + maxX) / 2 * scale;
    const ty = h / 2 - (minY + maxY) / 2 * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    if (animate) {
      svg.transition().duration(450).call(zoom.transform, t);
    } else {
      svg.call(zoom.transform, t);
    }
  }

  // ============ Path generators ============
  function primaryPathD(s, t) {
    if (s._x === t._x) {
      return `M${s._x},${s._y} L${t._x},${t._y}`;
    }
    return `M${s._x},${s._y} C${s._x},${(s._y + t._y) / 2} ${t._x},${(s._y + t._y) / 2} ${t._x},${t._y}`;
  }

  function secondaryPathD(e) {
    const s = e.source, t = e.target;
    const dx = t._x - s._x;
    const dy = t._y - s._y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sign = (s._col + t._col) <= 0 ? -1 : 1;
    const bow = sign * Math.min(90, dist * 0.45);
    const midX = (s._x + t._x) / 2 + bow;
    const midY = (s._y + t._y) / 2;
    return `M${s._x},${s._y} Q${midX},${midY} ${t._x},${t._y}`;
  }

  // ============ Render ============
  function render() {
    if (emptyText) emptyText.style('display', session.nodes.length ? 'none' : null);

    const primaryData = session.nodes
      .filter(n => n.parent_id)
      .map(n => ({ source: nodeById[n.parent_id], target: n, id: n.parent_id + '->' + n.id }))
      .filter(e => e.source && isVisible(e.source.id) && isVisible(e.target.id));

    const pSel = gPrimary.selectAll('path').data(primaryData, d => d.id);
    pSel.exit().remove();
    pSel.enter().append('path')
      .merge(pSel)
      .attr('class', d => {
        const cls = ['edge-primary'];
        const ss = state.nodeStates[d.source.id];
        const ts = state.nodeStates[d.target.id];
        if (ss === 'destructively_pruned' || ts === 'destructively_pruned') cls.push('ghost');
        else if (ss === 'soft_pruned' || ts === 'soft_pruned') cls.push('soft');
        return cls.join(' ');
      })
      .attr('d', d => primaryPathD(d.source, d.target));

    const secData = secondaryEdges.filter(e =>
      isActive(e.source.id) && isActive(e.target.id)
    );
    const sSel = gSecondary.selectAll('path').data(secData, d => d.source.id + '~' + d.target.id);
    sSel.exit().remove();
    sSel.enter().append('path')
      .merge(sSel)
      .attr('class', 'edge-secondary')
      .attr('stroke', d => session.tags[d.tag] ? session.tags[d.tag].color : '#888')
      .attr('d', d => secondaryPathD(d))
      .on('mouseenter', function (ev, d) {
        const cfg = session.tags[d.tag] || {};
        const tt = document.getElementById('tooltip');
        tt.innerHTML = `<div class="tooltip-tag" style="color:${cfg.color || '#fff'}">topical: ${cfg.label || d.tag}</div><div>same tag, no direct turn-by-turn link</div>`;
        tt.classList.remove('hidden');
        moveTooltip(ev);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip);

    const visibleNodes = session.nodes.filter(n => isVisible(n.id));
    const nSel = gNodes.selectAll('g.node-group').data(visibleNodes, d => d.id);
    nSel.exit().remove();

    const nEnter = nSel.enter().append('g');
    nEnter.append('circle').attr('class', 'node-circle');
    nEnter.append('circle').attr('class', 'node-stripe')
      .attr('fill', 'url(#soft-stripes)')
      .attr('pointer-events', 'none');
    nEnter.append('text').attr('class', 'node-label');
    nEnter.append('text').attr('class', 'oos-badge').text('OUT OF SCOPE');

    const nMerge = nEnter.merge(nSel);

    nMerge.attr('transform', d => `translate(${d._x},${d._y})`);
    nMerge.attr('class', d => {
      const cls = ['node-group'];
      const s = state.nodeStates[d.id];
      if (s === 'soft_pruned') cls.push('node-soft');
      if (s === 'destructively_pruned') cls.push('node-ghost');
      return cls.join(' ');
    });

    nMerge.select('.node-circle')
      .attr('class', d => {
        const cls = ['node-circle'];
        cls.push(d.is_main_path ? 'main-path' : 'tangent');
        if (d.id === state.selectedId) cls.push('selected');
        return cls.join(' ');
      })
      .attr('r', d => d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT)
      .attr('fill', d => {
        if (state.nodeStates[d.id] === 'destructively_pruned') return 'transparent';
        const cfg = session.tags[d.tag];
        return cfg ? cfg.color : '#888';
      });

    nMerge.select('.node-stripe')
      .attr('r', d => d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT)
      .style('display', d => state.nodeStates[d.id] === 'soft_pruned' ? null : 'none');

    nMerge.select('.node-label')
      .attr('y', d => (d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT) + 14)
      .attr('text-anchor', 'middle')
      .text(d => d.id);

    nMerge.select('.oos-badge')
      .attr('y', d => -(d.is_main_path ? NODE_R_MAIN : NODE_R_TANGENT) - 6)
      .attr('text-anchor', 'middle')
      .style('display', d => state.nodeStates[d.id] === 'soft_pruned' ? null : 'none');

    nMerge
      .on('mouseenter', function (ev, d) {
        showTooltip(ev, d);
        highlightSubtree(d.id);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', function () {
        hideTooltip();
        clearHighlight();
      })
      .on('click', function (ev, d) {
        ev.stopPropagation();
        selectNode(d.id);
      });
  }

  // ============ Hover highlight ============
  function highlightSubtree(rootId) {
    const ids = new Set(getDescendants(rootId));
    gNodes.selectAll('g.node-group').classed('subtree-hover', d => ids.has(d.id));
    gPrimary.selectAll('path').classed('subtree-hover', function (d) {
      return ids.has(d.source.id) && ids.has(d.target.id);
    });
  }

  function clearHighlight() {
    gNodes.selectAll('g.node-group.subtree-hover').classed('subtree-hover', false);
    gPrimary.selectAll('path.subtree-hover').classed('subtree-hover', false);
  }

  // ============ Tooltip ============
  const tooltip = document.getElementById('tooltip');

  function showTooltip(ev, d) {
    const cfg = session.tags[d.tag] || {};
    const txt = d.content_user.length > 90 ? d.content_user.slice(0, 90) + '…' : d.content_user;
    tooltip.innerHTML = `<div class="tooltip-tag" style="color:${cfg.color || '#fff'}">${cfg.label || d.tag} · ${d.id}</div><div>${txt}</div>`;
    tooltip.classList.remove('hidden');
    moveTooltip(ev);
  }

  function moveTooltip(ev) {
    const wrapper = document.getElementById('canvas-wrapper');
    const rect = wrapper.getBoundingClientRect();
    let x = ev.clientX - rect.left + 14;
    let y = ev.clientY - rect.top + 14;
    if (x + 280 > rect.width) x = ev.clientX - rect.left - 280;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  // ============ Selection / Detail ============
  function selectNode(id) {
    state.selectedId = id;
    renderDetail();
    render();
  }

  function deselect() {
    state.selectedId = null;
    document.getElementById('panel-default').classList.remove('hidden');
    document.getElementById('panel-detail').classList.add('hidden');
    render();
  }

  function renderDetail() {
    const n = nodeById[state.selectedId];
    if (!n) return deselect();
    document.getElementById('panel-default').classList.add('hidden');
    document.getElementById('panel-detail').classList.remove('hidden');

    const cfg = session.tags[n.tag] || { color: '#888', label: n.tag };
    const tagBadge = document.getElementById('detail-tag');
    tagBadge.textContent = cfg.label || n.tag;
    tagBadge.style.background = cfg.color + '33';
    tagBadge.style.color = cfg.color;
    tagBadge.style.borderLeft = `3px solid ${cfg.color}`;

    document.getElementById('detail-branch').textContent =
      `branch: ${n.branch}${n.is_main_path ? ' · main path' : ''} · ${n.id}`;

    document.getElementById('detail-relevance-num').textContent = Math.round(n.relevance * 100) + '%';
    document.getElementById('detail-relevance-fill').style.width = (n.relevance * 100) + '%';

    document.getElementById('detail-user').textContent = n.content_user;
    document.getElementById('detail-assistant').textContent = n.content_assistant;

    const descendants = getDescendants(n.id);
    document.getElementById('detail-affected').textContent = descendants.length;

    const cur = state.nodeStates[n.id];
    document.getElementById('btn-prune-destructive').disabled = cur === 'destructively_pruned';
    document.getElementById('btn-prune-soft').disabled = cur === 'soft_pruned';
    document.getElementById('btn-restore').disabled = cur === 'active';
  }

  // ============ Pruning ============
  function applyPruning(rootId, newState) {
    const ids = getDescendants(rootId);
    ids.forEach(id => state.nodeStates[id] = newState);
    updateStats();
    updateScore();
    renderDetail();
    render();
  }

  // ============ Add turn / new session ============
  function lastActiveNode() {
    for (let i = session.nodes.length - 1; i >= 0; i--) {
      if (isActive(session.nodes[i].id)) return session.nodes[i];
    }
    return null;
  }

  function nextNodeId() {
    let i = session.nodes.length + 1;
    while (session.nodes.find(n => n.id === 'n' + i)) i++;
    return 'n' + i;
  }

  function ensureTagRegistered(tag) {
    if (!session.tags[tag]) {
      session.tags[tag] = {
        color: TAG_PALETTE[nextTagColorIdx % TAG_PALETTE.length],
        label: tag.replace(/-/g, ' ')
      };
      nextTagColorIdx++;
    }
  }

  function decideParent(llmContinuesFrom) {
    if (state.selectedId && nodeById[state.selectedId] && isActive(state.selectedId)) {
      return state.selectedId;
    }
    if (llmContinuesFrom && nodeById[llmContinuesFrom] && isActive(llmContinuesFrom)) {
      return llmContinuesFrom;
    }
    const last = lastActiveNode();
    return last ? last.id : null;
  }

  async function addTurn(userMessage) {
    if (!userMessage || !userMessage.trim()) return;
    if (state.isLoading) return;
    state.isLoading = true;

    try {
      const objective = session.objective || '(no objective set)';
      const activeNodes = session.nodes.filter(n => isActive(n.id));
      const existingTags = Object.keys(session.tags);

      const llmResp = await window.LLM.tagAndAnswer({
        objective, activeNodes, userMessage: userMessage.trim(), existingTags
      });

      const parentId = decideParent(llmResp.continues_from);
      const parent = parentId ? nodeById[parentId] : null;

      let branch;
      if (!parent) {
        branch = 'main';
      } else if (llmResp.is_tangent) {
        branch = 't-' + nextTangentCounter++;
      } else {
        branch = parent.branch;
      }

      ensureTagRegistered(llmResp.tag);

      const newNode = {
        id: nextNodeId(),
        parent_id: parentId,
        tag: llmResp.tag,
        branch,
        is_main_path: branch === 'main',
        relevance: llmResp.relevance_to_objective,
        content_user: userMessage.trim(),
        content_assistant: llmResp.answer
      };

      session.nodes.push(newNode);
      state.nodeStates[newNode.id] = 'active';

      rebuildIndices();
      updateStats();
      updateScore();
      renderLegend();
      render();
      selectNode(newNode.id);
      fitToContent(true);

      return newNode;
    } finally {
      state.isLoading = false;
    }
  }

  function startNewSession(objective) {
    session.objective = objective || '(no objective set)';
    session.nodes = [];
    session.tags = {};
    state.nodeStates = {};
    state.selectedId = null;
    nextTangentCounter = 1;
    nextTagColorIdx = 0;
    updateObjective();
    rebuildIndices();
    updateStats();
    updateScore();
    renderLegend();
    deselect();
    render();
  }

  // ============ Bind static events ============
  document.getElementById('btn-prune-destructive').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'destructively_pruned');
  });
  document.getElementById('btn-prune-soft').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'soft_pruned');
  });
  document.getElementById('btn-restore').addEventListener('click', () => {
    if (state.selectedId) applyPruning(state.selectedId, 'active');
  });
  document.getElementById('toggle-show-pruned').addEventListener('change', (e) => {
    state.showPruned = e.target.checked;
    render();
  });
  document.getElementById('btn-fit-view').addEventListener('click', () => fitToContent(true));

  svg.on('click', function (event) {
    if (event.target === svg.node()) deselect();
  });

  window.addEventListener('resize', () => { resizeSvg(); });

  // ============ Init ============
  initSvg();
  resizeSvg();
  updateObjective();
  rebuildIndices();
  renderLegend();
  updateStats();
  updateScore();
  render();
  requestAnimationFrame(() => fitToContent(false));

  // Demo URL hashes — used to capture reproducible screenshots for docs.
  // #demo-prune=<id> applies destructive pruning to that node's subtree.
  // #demo-hover=<id> simulates a hover-highlight on that node's subtree.
  const hash = (location.hash || '').slice(1);
  if (hash.startsWith('demo-prune=')) {
    const id = hash.split('=')[1];
    setTimeout(() => { applyPruning(id, 'destructively_pruned'); fitToContent(false); }, 200);
  } else if (hash.startsWith('demo-hover=')) {
    const id = hash.split('=')[1];
    setTimeout(() => {
      const g = gNodes.selectAll('g.node-group').filter(d => d.id === id).node();
      if (g) g.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    }, 400);
  }

  return {
    addTurn,
    startNewSession,
    isLoading: () => state.isLoading,
    hasNodes: () => session.nodes.length > 0,
  };
})();
