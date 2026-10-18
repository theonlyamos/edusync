// Keep generated activities at their actual iframe size without remounting them.
export const SANDBOX_RESPONSIVE_STYLES = `
  html, body { width: 100%; min-height: 100%; }
  body { overflow: auto; }
  #root { min-width: 0; display: block; overflow-wrap: anywhere; }
  #root > * { min-width: 0 !important; max-width: 100%; }
  img:not(.leaflet-tile):not(.leaflet-marker-icon):not(.leaflet-marker-shadow), canvas, svg { max-width: 100%; }
  img:not(.leaflet-tile):not(.leaflet-marker-icon):not(.leaflet-marker-shadow), canvas, svg[viewBox] { height: auto !important; }
  .leaflet-container svg { max-width: none; height: initial !important; }
  #canvas-container { width: 100%; min-width: 0; }
  canvas { display: block; }
  button, input, select, textarea { max-width: 100%; }
  @media (pointer: coarse) {
    button, [role="button"], select, input:not([type="checkbox"]):not([type="radio"]) { min-height: 44px !important; }
    button, [role="button"] { min-width: 44px; }
    input, select, textarea { font-size: 16px !important; }
  }
`;

export const SANDBOX_RESPONSIVE_SCRIPT = `
  (function () {
    var adaptedSvgs = new WeakMap();
    function updateViewport() {
      var width = document.documentElement.clientWidth || window.innerWidth;
      var height = window.innerHeight;
      if (!(width > 0 && height > 0)) return;
      var next = {
        width: width,
        height: height,
        pixelRatio: window.devicePixelRatio || 1,
        orientation: width >= height ? 'landscape' : 'portrait'
      };
      var previous = window.lessonViewport;
      if (previous && previous.width === next.width && previous.height === next.height && previous.pixelRatio === next.pixelRatio) return;
      window.lessonViewport = next;
      document.documentElement.style.setProperty('--lesson-viewport-width', width + 'px');
      document.documentElement.style.setProperty('--lesson-viewport-height', height + 'px');
      window.dispatchEvent(new CustomEvent('lesson-viewport-change', { detail: next }));
    }

    // Legacy SVGs need a coordinate viewBox before their CSS width can shrink without cropping.
    function prepareSvg(element) {
      if (element.tagName.toLowerCase() !== 'svg') return;
      var viewBox = element.getAttribute('viewBox');
      if (viewBox !== null && viewBox !== adaptedSvgs.get(element)) return;
      var width = element.getAttribute('width') || '';
      var height = element.getAttribute('height') || '';
      var dimension = /^(?:\\d+\\.?\\d*|\\.\\d+)(?:px)?$/;
      if (dimension.test(width) && dimension.test(height) && parseFloat(width) > 0 && parseFloat(height) > 0) {
        var nextViewBox = '0 0 ' + parseFloat(width) + ' ' + parseFloat(height);
        element.setAttribute('viewBox', nextViewBox);
        adaptedSvgs.set(element, nextViewBox);
      }
    }

    function prepareMedia(node) {
      if (node.nodeType !== 1) return;
      prepareSvg(node);
      node.querySelectorAll('svg').forEach(prepareSvg);
    }

    updateViewport();
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && window.parent !== window) {
        window.parent.postMessage({ type: 'lesson-viewer-escape' }, '*');
      }
    });
    window.addEventListener('resize', updateViewport);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updateViewport);
    new ResizeObserver(updateViewport).observe(document.documentElement);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === 'attributes') prepareSvg(record.target);
        else record.addedNodes.forEach(prepareMedia);
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height'] });
    prepareMedia(document.documentElement);
  })();
`;

export const SANDBOX_SVG_LABEL_SCRIPT = `
  (function () {
    var originals = new WeakMap();
    var observed = new WeakSet();
    var queued = false;
    var mutationObserver;
    var resizeObserver = new ResizeObserver(schedule);
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        try { document.querySelectorAll('#root svg').forEach(layout); }
        finally { mutationObserver.takeRecords(); }
      });
    }
    function effectivelyHidden(element, svg) {
      for (var node = element; node && node !== svg.parentElement; node = node.parentElement) {
        var style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return true;
      }
      return false;
    }
    function intersects(a, b, gap) {
      if (!(a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top)) return false;
      if (!b.points) return true;
      var margin = gap + b.pad;
      if (b.points.some(function (point) {
        return point.x > a.left - margin && point.x < a.right + margin && point.y > a.top - margin && point.y < a.bottom + margin;
      })) return true;
      // No outline point near the rect: it overlaps only if it sits wholly inside a filled marker shape.
      var center = { x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2 };
      return !!b.fills && (!b.clip || inside(center, b.clip)) && b.fills.some(function (polygon) { return inside(center, polygon); });
    }
    function inside(point, polygon) {
      var hit = false;
      for (var index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        var a = polygon[index], b = polygon[previous];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    }
    function unpainted(child, marker) {
      for (var node = child; node && node !== marker; node = node.parentElement) {
        var style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return true;
      }
      var paint = getComputedStyle(child);
      return (paint.fill === 'none' || Number(paint.fillOpacity) === 0) && (paint.stroke === 'none' || Number(paint.strokeOpacity) === 0 || parseFloat(paint.strokeWidth) === 0);
    }
    function outline(shape, step) {
      var length = shape.getTotalLength();
      if (!Number.isFinite(length)) return null;
      var points = [];
      var count = Math.min(400, Math.max(1, Math.ceil(length / step)));
      for (var index = 0; index <= count; index++) points.push(shape.getPointAtLength(length * index / count));
      return points;
    }
    function markerFootprint(svg, edge, side, value, length, matrix) {
      var match = /url\\(\\s*["']?#([^"')\\s]+)["']?\\s*\\)/.exec(value);
      var marker = match && svg.ownerDocument.getElementById(match[1]);
      if (!marker || marker.tagName.toLowerCase() !== 'marker') return null;
      var width = marker.markerWidth.baseVal.value;
      var height = marker.markerHeight.baseVal.value;
      if (!(width > 0 && height > 0)) return [];
      var sx = 1, sy = 1, tx = 0, ty = 0;
      var box = marker.viewBox.baseVal;
      if (marker.hasAttribute('viewBox') && box && box.width > 0 && box.height > 0) {
        var ratio = marker.preserveAspectRatio.baseVal;
        sx = width / box.width;
        sy = height / box.height;
        if (ratio.align !== 1) {
          sx = sy = ratio.meetOrSlice === 2 ? Math.max(sx, sy) : Math.min(sx, sy);
          tx = (width - box.width * sx) * ([0, 0, 0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1][ratio.align] || 0);
          ty = (height - box.height * sy) * ([0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1][ratio.align] || 0);
        }
        tx -= box.x * sx;
        ty -= box.y * sy;
      }
      var scale = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : parseFloat(getComputedStyle(edge).strokeWidth);
      if (!Number.isFinite(scale) || scale < 0) return null;
      var screenScale = Math.hypot(matrix.a, matrix.b);
      var clipped = getComputedStyle(marker).overflow !== 'visible';
      // Sample painted marker geometry in viewport units; unsupported content falls back to the clipped viewport.
      var step = Math.max(0.01, 1 / Math.max(0.0001, Math.min(sx, sy) * scale * screenScale));
      var local = [];
      var fills = [];
      var stroke = 0;
      var known = Array.from(marker.children).every(function (child) {
        var tag = child.tagName.toLowerCase();
        if (tag === 'title' || tag === 'desc') return true;
        if (unpainted(child, marker)) return true;
        if (typeof child.getTotalLength !== 'function' || child.hasAttribute('transform')) return false;
        var points = outline(child, step);
        if (!points) return false;
        var childStyle = getComputedStyle(child);
        if (childStyle.stroke !== 'none') stroke = Math.max(stroke, parseFloat(childStyle.strokeWidth) || 0);
        var mapped = points.map(function (point) { return { x: point.x * sx + tx, y: point.y * sy + ty }; });
        Array.prototype.push.apply(local, mapped);
        if (childStyle.fill !== 'none' && Number(childStyle.fillOpacity) !== 0) fills.push(mapped);
        return true;
      });
      if (!known || !local.length) {
        if (!clipped) return null;
        local = [];
        fills = [[{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]];
        var edges = [[0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0]];
        edges.forEach(function (line) {
          var count = Math.max(1, Math.ceil(Math.hypot(line[2] - line[0], line[3] - line[1]) * scale * screenScale));
          for (var index = 0; index <= count; index++) local.push({ x: line[0] + (line[2] - line[0]) * index / count, y: line[1] + (line[3] - line[1]) * index / count });
        });
        stroke = 0;
      }
      if (clipped) {
        var inset = stroke * Math.max(sx, sy) / 2;
        local = local.filter(function (point) { return point.x >= -inset && point.x <= width + inset && point.y >= -inset && point.y <= height + inset; });
      }
      var refX = marker.refX.baseVal.value * sx + tx;
      var refY = marker.refY.baseVal.value * sy + ty;
      var at = side === 'start' ? 0 : length;
      var anchor = edge.getPointAtLength(at);
      var orient = (marker.getAttribute('orient') || '0').trim();
      var angle;
      if (orient === 'auto' || orient === 'auto-start-reverse') {
        var before = edge.getPointAtLength(Math.max(0, at - 0.01));
        var after = edge.getPointAtLength(Math.min(length, at + 0.01));
        angle = Math.atan2(after.y - before.y, after.x - before.x);
        if (orient === 'auto-start-reverse' && side === 'start') angle += Math.PI;
      } else {
        var degrees = /^(-?[\\d.]+(?:e-?\\d+)?)(deg|rad|grad|turn)?$/i.exec(orient);
        if (!degrees) return null;
        var unit = (degrees[2] || 'deg').toLowerCase();
        angle = Number(degrees[1]) * (unit === 'rad' ? 1 : unit === 'grad' ? Math.PI / 200 : unit === 'turn' ? 2 * Math.PI : Math.PI / 180);
      }
      var cos = Math.cos(angle), sin = Math.sin(angle);
      var tip = anchor.matrixTransform(matrix);
      function project(point) {
        var dx = (point.x - refX) * scale, dy = (point.y - refY) * scale;
        var mapped = svg.createSVGPoint();
        mapped.x = anchor.x + dx * cos - dy * sin;
        mapped.y = anchor.y + dx * sin + dy * cos;
        return mapped.matrixTransform(matrix);
      }
      var points = local.map(project);
      points.push(tip);
      var screenFills = fills.map(function (polygon) { return polygon.map(project); });
      var clip = clipped ? [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }].map(project) : null;
      var xs = points.map(function (point) { return point.x; });
      var ys = points.map(function (point) { return point.y; });
      var pad = stroke * Math.max(sx, sy) * scale * screenScale / 2;
      return [{ left: Math.min.apply(null, xs) - pad, right: Math.max.apply(null, xs) + pad, top: Math.min.apply(null, ys) - pad, bottom: Math.max.apply(null, ys) + pad, x: tip.x, y: tip.y, points: points, pad: pad, fills: screenFills, clip: clip }];
    }
    // Raw SVG charts often have arrowheaded axes and no accessible name. Their numeric tick labels sit on one
    // shared row or column; numbered flowchart steps usually do not, and a diagram's own name wins outright.
    function looksLikeChart(svg, labels) {
      if (/\\b(?:flow\\s*chart|flowchart|concept\\s+map|mind\\s+map|diagram|cycle|process|steps?|sequence|timeline|food\\s+(?:web|chain)|graph\\s+of\\s+nodes|knowledge\\s+graph)\\b/i.test(svg.getAttribute('aria-label') || '')) return false;
      var ticks = labels.filter(function (label) { return /^[-+\\u2212]?[$\\u00a3\\u20ac]?\\d[\\d,.]*\\s*(?:%|[a-z\\u00b0\\u00b5]{0,3})$/i.test((label.textContent || '').trim()); }).map(function (label) {
        return { x: label.x.baseVal.length ? label.x.baseVal.getItem(0).value : 0, y: label.y.baseVal.length ? label.y.baseVal.getItem(0).value : 0 };
      });
      if (ticks.length < 3) return false;
      function aligned(axis) {
        var groups = {};
        ticks.forEach(function (tick) { var key = Math.round(tick[axis]); groups[key] = (groups[key] || 0) + 1; });
        return Object.keys(groups).some(function (key) {
          var count = 0;
          for (var offset = -1; offset <= 1; offset++) count += groups[Number(key) + offset] || 0;
          return count >= 3;
        });
      }
      return aligned('x') || aligned('y');
    }
    function markedEdgeTips(svg) {
      var tips = [];
      var marked = false;
      var supported = true;
      svg.querySelectorAll('line, path, polyline').forEach(function (edge) {
        if (edge.closest('defs, marker')) return;
        try {
          var style = getComputedStyle(edge);
          var sides = ['start', 'end'].filter(function (side) {
            var marker = style.getPropertyValue('marker-' + side) || edge.getAttribute('marker-' + side);
            return marker && marker.trim().toLowerCase() !== 'none';
          });
          if (!sides.length) return;
          marked = true;
          if (effectivelyHidden(edge, svg)) return;
          var matrix = edge.getScreenCTM();
          var length = edge.getTotalLength();
          if (!matrix || !Number.isFinite(length)) return;
          sides.forEach(function (side) {
            var footprint = markerFootprint(svg, edge, side, style.getPropertyValue('marker-' + side) || edge.getAttribute('marker-' + side), length, matrix);
            if (footprint === null) { supported = false; return; }
            footprint.forEach(function (box) {
              if ([box.left, box.right, box.top, box.bottom].every(Number.isFinite)) tips.push(box);
            });
          });
        } catch (_) { supported = false; }
      });
      return supported && marked ? tips : null;
    }
    function restore(label) {
      var original = originals.get(label);
      if (!original) {
        original = { transform: label.getAttribute('transform'), font: label.style.fontSize };
        originals.set(label, original);
      } else {
        if (label.getAttribute('transform') !== original.appliedTransform) original.transform = label.getAttribute('transform');
        if (label.style.fontSize !== original.appliedFont) original.font = label.style.fontSize;
      }
      if (original.transform === null) label.removeAttribute('transform');
      else label.setAttribute('transform', original.transform);
      label.style.fontSize = original.font;
      return original;
    }
    function layout(svg) {
      var labels = Array.from(svg.querySelectorAll('text'));
      labels.forEach(function (label) { if (originals.has(label)) restore(label); });
      function remember() {
        labels.forEach(function (label) {
          var original = originals.get(label);
          if (original) { original.appliedTransform = label.getAttribute('transform'); original.appliedFont = label.style.fontSize; }
        });
      }
      var matrix = svg.getScreenCTM();
      if (!svg.hasAttribute('viewBox') || svg.closest('.recharts-wrapper, .leaflet-container') || /\\b(?:(?:bar|line|pie|area|scatter|bubble|donut|doughnut|radar)\\s+(?:chart|graph|plot)|(?:geographic|geographical|world|country|street|political|topographic)\\s+map|data\\s+(?:chart|plot)|histogram|scatterplot|choropleth)\\b/i.test(svg.getAttribute('aria-label') || '') || svg.querySelector('svg, textPath, animate, animateTransform') || !matrix || matrix.a <= 0 || matrix.d <= 0 || Math.abs(matrix.a - matrix.d) > 0.0001 || Math.abs(matrix.b) > 0.0001 || Math.abs(matrix.c) > 0.0001 || labels.length > 24 || looksLikeChart(svg, labels)) { remember(); return; }
      var tips = markedEdgeTips(svg);
      if (!tips) { remember(); return; }
      if (!observed.has(svg)) { observed.add(svg); resizeObserver.observe(svg); }
      var bounds = svg.getBoundingClientRect();
      var nodes = Array.from(svg.querySelectorAll('circle, ellipse, rect, polygon')).filter(function (shape) {
        return !shape.closest('defs, marker, clipPath, mask, pattern, symbol') && !effectivelyHidden(shape, svg);
      }).map(function (shape) { return shape.getBoundingClientRect(); }).filter(function (rect) { return rect.width > 0 || rect.height > 0; });
      var visible = [];
      var eligible = new WeakSet();
      var baseline = new WeakMap();
      labels.forEach(function (label) {
        var original = originals.has(label) ? originals.get(label) : restore(label);
        var parent = label;
        var hidden = false;
        var transformed = !!original.transform || label.hasAttribute('rotate') || !!label.querySelector('tspan');
        while (parent && parent !== svg) {
          var style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) hidden = true;
          if (style.transform !== 'none' || parent.hasAttribute('transform')) transformed = true;
          parent = parent.parentElement;
        }
        var rect = label.getBoundingClientRect();
        if (!hidden && rect.width > 0 && rect.height > 0) {
          visible.push(label);
          baseline.set(label, rect);
          if (!transformed) eligible.add(label);
        }
      });
      function reset(label) {
        var original = originals.get(label);
        if (original.transform === null) label.removeAttribute('transform');
        else label.setAttribute('transform', original.transform);
        label.style.fontSize = original.font;
      }
      function clipped(rect) {
        return rect.left < bounds.left - 0.5 || rect.top < bounds.top - 0.5 || rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5;
      }
      function findPlacement(rect, obstacles) {
        if (rect.width > bounds.width - 8 || rect.height > bounds.height - 8) return null;
        var left = Math.max(bounds.left + 4, Math.min(rect.left, bounds.right - rect.width - 4));
        var top = Math.max(bounds.top + 4, Math.min(rect.top, bounds.bottom - rect.height - 4));
        var candidates = [{ left: left, top: top }];
        obstacles.forEach(function (other) {
          var aligned = Math.max(bounds.left + 4, Math.min(other.right - rect.width, bounds.right - rect.width - 4));
          candidates.push({ left: other.right + 3, top: top }, { left: other.left - rect.width - 3, top: top },
            { left: left, top: other.bottom + 3 }, { left: left, top: other.top - rect.height - 3 },
            { left: aligned, top: other.bottom + 3 }, { left: aligned, top: other.top - rect.height - 3 });
        });
        for (var dy = -48; dy <= 48; dy += 2) {
          for (var dx = -48; dx <= 48; dx += 2) candidates.push({ left: rect.left + dx, top: rect.top + dy });
        }
        var best = null;
        candidates.forEach(function (candidate) {
          candidate.right = candidate.left + rect.width;
          candidate.bottom = candidate.top + rect.height;
          candidate.distance = Math.hypot(candidate.left - rect.left, candidate.top - rect.top);
          if (candidate.distance > 48 || (best && candidate.distance >= best.distance) || candidate.left < bounds.left + 4 || candidate.top < bounds.top + 4 || candidate.right > bounds.right - 4 || candidate.bottom > bounds.bottom - 4 || obstacles.some(function (other) { return intersects(candidate, other, 3); })) return;
          best = candidate;
        });
        return best;
      }
      // Greedy placement depends on order, so labels that could not be placed get the first pick on a retry.
      function attempt(order) {
        visible.forEach(function (label) { if (eligible.has(label)) reset(label); });
        var placed = new Map();
        var failed = [];
        var movement = 0;
        var shortfall = 0;
        visible.forEach(function (label) { if (!eligible.has(label)) placed.set(label, baseline.get(label)); });
        order.forEach(function (label) {
          if (!eligible.has(label)) return;
          var original = originals.get(label);
          var rendered = parseFloat(getComputedStyle(label).fontSize) * matrix.a;
          var obstacles = Array.from(placed.values());
          var authored = baseline.get(label);
          nodes.forEach(function (node) { if (!intersects(authored, node, 0)) obstacles.push(node); });
          tips.forEach(function (tip) {
            if (!(tip.x > authored.left && tip.x < authored.right && tip.y > authored.top && tip.y < authored.bottom)) obstacles.push(tip);
          });
          // Try 14px first, then step down toward the authored size when a crowded diagram has no room.
          var sizes = [null];
          if (rendered < 14) {
            sizes = [];
            for (var target = 14; target > rendered + 0.01; target--) sizes.push(target);
          }
          var best, rect, achieved = rendered;
          for (var step = 0; step < sizes.length && !best; step++) {
            if (sizes[step] !== null) label.style.fontSize = (sizes[step] / matrix.a) + 'px';
            rect = label.getBoundingClientRect();
            best = findPlacement(rect, obstacles);
            if (best) achieved = sizes[step] === null ? rendered : sizes[step];
          }
          if (!best) {
            label.style.fontSize = original.font;
            shortfall += Math.max(0, 14 - rendered);
            failed.push(label);
          } else {
            if (achieved < 14) { shortfall += 14 - achieved; failed.push(label); }
            if (best.distance > 0.01) {
              label.setAttribute('transform', 'translate(' + ((best.left - rect.left) / matrix.a) + ' ' + ((best.top - rect.top) / matrix.d) + ')');
              movement += best.distance;
            }
          }
          placed.set(label, label.getBoundingClientRect());
        });
        var invalid = visible.some(function (label, index) {
          var rect = placed.get(label);
          if (clipped(rect) && !clipped(baseline.get(label))) return true;
          return visible.slice(0, index).some(function (other) {
            return intersects(rect, placed.get(other), -0.5) && !intersects(baseline.get(label), baseline.get(other), -0.5);
          });
        });
        return {
          order: order, failed: failed, shortfall: shortfall, movement: movement, invalid: invalid,
          state: visible.map(function (label) { return { transform: label.getAttribute('transform'), font: label.style.fontSize }; }),
        };
      }
      function better(a, b) {
        if (a.invalid !== b.invalid) return !a.invalid;
        if (Math.abs(a.shortfall - b.shortfall) > 0.01) return a.shortfall < b.shortfall;
        return a.movement < b.movement - 0.01;
      }
      var chosen = attempt(visible);
      var result = chosen;
      for (var retry = 0; retry < 4 && result.failed.length; retry++) {
        var first = result.failed;
        result = attempt(first.concat(result.order.filter(function (label) { return first.indexOf(label) < 0; })));
        if (better(result, chosen)) chosen = result;
      }
      visible.forEach(function (label, index) {
        if (chosen.invalid) { reset(label); return; }
        var state = chosen.state[index];
        if (state.transform === null) label.removeAttribute('transform');
        else label.setAttribute('transform', state.transform);
        label.style.fontSize = state.font;
      });
      remember();
    }
    window.addEventListener('lesson-viewport-change', schedule);
    window.addEventListener('resize', schedule);
    mutationObserver = new MutationObserver(function (records) {
      if (records.some(function (record) {
        var target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target && target.closest('svg')) return true;
        if (record.type === 'attributes' && (record.attributeName === 'class' || record.attributeName === 'style') && target && target.querySelector('svg')) return true;
        return Array.from(record.addedNodes).some(function (node) { return node.nodeType === 1 && (node.tagName.toLowerCase() === 'svg' || node.querySelector('svg')); });
      })) schedule();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['x', 'y', 'dx', 'dy', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'rotate', 'font-size', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'aria-label', 'transform', 'class', 'style', 'marker-start', 'marker-mid', 'marker-end', 'opacity', 'visibility', 'display', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient', 'overflow', 'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity'] });
    schedule();
  })();
`;
