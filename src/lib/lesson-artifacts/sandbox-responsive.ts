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
