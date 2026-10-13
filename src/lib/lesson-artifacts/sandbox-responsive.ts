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
    var resizeObserver = new ResizeObserver(schedule);
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        document.querySelectorAll('#root svg').forEach(layout);
      });
    }
    function intersects(a, b, gap) {
      return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
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
      if (!svg.hasAttribute('viewBox') || !svg.querySelector('[marker-end], [marker-start]') || svg.closest('.recharts-wrapper, .leaflet-container') || /chart|graph|plot|map/i.test(svg.getAttribute('aria-label') || '') || svg.querySelector('svg, textPath, animate, animateTransform') || !matrix || matrix.a <= 0 || matrix.d <= 0 || Math.abs(matrix.a - matrix.d) > 0.0001 || Math.abs(matrix.b) > 0.0001 || Math.abs(matrix.c) > 0.0001 || labels.length > 24) { remember(); return; }
      if (!observed.has(svg)) { observed.add(svg); resizeObserver.observe(svg); }
      var bounds = svg.getBoundingClientRect();
      var circles = Array.from(svg.querySelectorAll('circle')).map(function (circle) { return circle.getBoundingClientRect(); });
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
      var placed = [];
      visible.forEach(function (label) {
        var original = originals.get(label);
        if (eligible.has(label)) {
          var size = parseFloat(getComputedStyle(label).fontSize);
          if (size * matrix.a < 14) label.style.fontSize = (14 / matrix.a) + 'px';
          var rect = label.getBoundingClientRect();
          var best;
          var distance = Infinity;
          var obstacles = placed.slice();
          circles.forEach(function (circle) { if (!intersects(baseline.get(label), circle, 0)) obstacles.push(circle); });
          var line = label.previousElementSibling;
          if (line && line.tagName.toLowerCase() === 'line' && line.getAttribute('marker-end')) {
            var point = svg.createSVGPoint();
            point.x = line.x2.baseVal.value;
            point.y = line.y2.baseVal.value;
            var tip = point.matrixTransform(line.getScreenCTM());
            var tipRect = { left: tip.x, right: tip.x, top: tip.y, bottom: tip.y };
            if (!intersects(baseline.get(label), tipRect, -0.5)) obstacles.push(tipRect);
          }
          if (rect.width <= bounds.width - 8 && rect.height <= bounds.height - 8) {
            var left = Math.max(bounds.left + 4, Math.min(rect.left, bounds.right - rect.width - 4));
            var top = Math.max(bounds.top + 4, Math.min(rect.top, bounds.bottom - rect.height - 4));
            var candidates = [{ left: left, top: top }];
            obstacles.forEach(function (other) {
              var aligned = Math.max(bounds.left + 4, Math.min(other.right - rect.width, bounds.right - rect.width - 4));
              candidates.push({ left: other.right + 3, top: top }, { left: other.left - rect.width - 3, top: top },
                { left: left, top: other.bottom + 3 }, { left: left, top: other.top - rect.height - 3 },
                { left: aligned, top: other.bottom + 3 }, { left: aligned, top: other.top - rect.height - 3 });
            });
            candidates.forEach(function (candidate) {
              candidate.right = candidate.left + rect.width;
              candidate.bottom = candidate.top + rect.height;
              var shift = Math.hypot(candidate.left - rect.left, candidate.top - rect.top);
              if (shift > 48 || shift >= distance || candidate.left < bounds.left + 4 || candidate.top < bounds.top + 4 || candidate.right > bounds.right - 4 || candidate.bottom > bounds.bottom - 4 || obstacles.some(function (other) { return intersects(candidate, other, 3); })) return;
              best = candidate;
              distance = shift;
            });
          }
          if (!best) label.style.fontSize = original.font;
          else if (distance > 0.01) label.setAttribute('transform', 'translate(' + ((best.left - rect.left) / matrix.a) + ' ' + ((best.top - rect.top) / matrix.d) + ')');
        }
        placed.push(label.getBoundingClientRect());
      });
      function clipped(rect) {
        return rect.left < bounds.left - 0.5 || rect.top < bounds.top - 0.5 || rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5;
      }
      var invalid = visible.some(function (label, index) {
        if (clipped(placed[index]) && !clipped(baseline.get(label))) return true;
        return visible.slice(0, index).some(function (other, previous) {
          return intersects(placed[index], placed[previous], -0.5) && !intersects(baseline.get(label), baseline.get(other), -0.5);
        });
      });
      labels.forEach(function (label) {
        var original = originals.get(label);
        if (invalid) {
          if (original.transform === null) label.removeAttribute('transform');
          else label.setAttribute('transform', original.transform);
          label.style.fontSize = original.font;
        }
      });
      remember();
    }
    window.addEventListener('lesson-viewport-change', schedule);
    window.addEventListener('resize', schedule);
    new MutationObserver(function (records) {
      if (records.some(function (record) {
        var target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target && target.closest('svg')) return true;
        return Array.from(record.addedNodes).some(function (node) { return node.nodeType === 1 && (node.tagName.toLowerCase() === 'svg' || node.querySelector('svg')); });
      })) schedule();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['x', 'y', 'dx', 'dy', 'rotate', 'font-size', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'aria-label'] });
    schedule();
  })();
`;
