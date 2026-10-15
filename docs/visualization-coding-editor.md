# Coding workspace in a visualization

Ordinary visualizations do not mount or initialize Monaco. A programming activity can offer a button that explicitly requests a coding workspace:

```js
function App() {
  return React.createElement(Button, {
    onClick: () => openCodeEditor({code: 'print("Hello")', language: 'python'})
  }, 'Open coding editor');
}
```

The same capability is available as `window.openCodeEditor` in p5.js and Three.js visualizations. Supported languages are javascript, typescript, python, html, css, json, java, c, cpp, csharp, sql and plaintext. Code is text with a 50,000-character limit. No URLs, editor options or execution commands are accepted.

The helper and parent require transient user activation, such as clicking the activity's button. A top-level render call cannot automatically open the workspace. The parent accepts requests only from the current opaque iframe with the current render's random token and an exact bounded schema. Browsers without the user-activation API leave the workspace closed. Navigation rotates the token, removes the listener and closes the workspace. The iframe keeps `sandbox="allow-scripts"`; opening or closing the workspace does not recreate the preview or change the voice session.

Monaco loads only for an open coding workspace or an explicitly authored `codeEditor` activity. Loading failure leaves editable plain text. Existing debug source views remain plain code viewers. The editor does not evaluate learner code in the parent; the legacy validation/submit contract remains separate from sandbox execution.

The workspace, including its plain-text fallback, is excluded from the tutor's existing visualization screenshots. Opening focuses its Close control; closing restores focus to the retained preview. If Monaco becomes ready while the learner is typing in the fallback, focus follows their text into the editor.

## Offline browser verification

`node scripts/verify-coding-editor.cjs` is a session-environment verifier. It requires the existing sibling `synthetic-only-harness-diagnostics-2026-10-15/service-worker-runtime.cjs`, its verified private Playwright package, installed project dependencies including Monaco 0.55.1, and this workstation's cached Chromium. `CHROMIUM_EXECUTABLE_PATH` can override the browser path. These private prerequisites are outside the repository; the script is not standalone from a fresh checkout.

The verifier bundles actual tutor, renderer, workspace, editor and PCM queue code. It substitutes the voice/provider boundary, data APIs, screenshot output and Next dynamic adapter. Browser requests are fulfilled from memory or installed assets, or blocked; native capture is denied, fake devices are enforced, and the Chromium sandbox stays enabled. Reports disclose controlled AMD versus installed Monaco cases. This checks UI and resource ownership, not live CDN availability, provider semantics, perceived audio continuity or Next chunk transport.
