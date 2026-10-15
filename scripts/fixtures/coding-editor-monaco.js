(function () {
  const stats = window.__monacoProbe;
  const api = { editor: {
    createModel(value, language) {
      stats.modelsCreated++; stats.modelsActive++;
      let disposed = false;
      return {
        language, getValue: () => value, setValue: next => { value = next; },
        dispose() { if (!disposed) { disposed = true; stats.modelsDisposed++; stats.modelsActive--; stats.disposalOrder.push('model'); } },
      };
    },
    create(host, options) {
      stats.editorsCreated++; stats.editorsActive++;
      const input = document.createElement('textarea');
      input.setAttribute('aria-label', 'Controlled Monaco code');
      input.className = 'monaco-editor';
      input.style.cssText = 'width:100%;height:100%;min-height:300px;color:white;background:#171717';
      input.value = options.model.getValue();
      host.append(input);
      const callbacks = new Set();
      const onInput = () => { options.model.setValue(input.value); callbacks.forEach(callback => callback()); };
      input.addEventListener('input', onInput);
      let disposed = false;
      return {
        focus() { input.focus(); },
        onDidChangeModelContent(callback) {
          callbacks.add(callback); stats.subscriptionsCreated++; stats.subscriptionsActive++;
          let removed = false;
          return { dispose() { if (!removed) { removed = true; callbacks.delete(callback); stats.subscriptionsDisposed++; stats.subscriptionsActive--; stats.disposalOrder.push('subscription'); } } };
        },
        dispose() { if (!disposed) { disposed = true; input.removeEventListener('input', onInput); input.remove(); stats.editorsDisposed++; stats.editorsActive--; stats.disposalOrder.push('editor'); } },
      };
    },
  } };
  const amd = (ids, success) => { stats.requireCalls++; window.__resolveControlledMonaco = () => success({ m: api }); if (!window.__deferControlledAmd) setTimeout(window.__resolveControlledMonaco, 150); };
  amd.config = options => { stats.configCalls++; stats.configuredPath = options.paths.vs; };
  window.require = amd;
})();
