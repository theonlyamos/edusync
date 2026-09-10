const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Run: node --test scripts/test-visualize-provider.cjs
const source = fs.readFileSync(path.join(__dirname, '../src/lib/visualize-ai-task.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText

for (const [provider, model] of [['CEREBRAS', 'qwen-3.8-27b'], ['CEREBRAS', 'gpt-oss-120b'], ['GEMINI', 'test-model'], ['GROQ', 'test-model'], ['OPENAI', 'test-model']]) {
  test(`${provider}/${model}: provider settings and usable visualization`, async () => {
    let request
    const result = { explanation: 'Explore', code: 'function App() { return null; }', library: 'react' }
    class FakeOpenAI {
      chat = { completions: { create: async (input) => {
        request = input
        return { choices: [{ message: { tool_calls: [{
          type: 'function', function: { name: 'display_visual_aid', arguments: JSON.stringify(result) },
        }] } }] }
      } } }
    }
    const context = {
      exports: {}, console,
      process: { env: { AI_PROVIDER: provider, [`${provider}_MODEL`]: model } },
      require: (name) => {
        if (name === 'openai') return FakeOpenAI
        if (name === '@/lib/imageUtils.server') return { convertImageUrlsToBase64: async (code) => code }
        throw new Error(`Unexpected import: ${name}`)
      },
    }
    vm.runInNewContext(js, context)
    const actual = await context.exports.runVisualizeGeneration({ task_description: 'Show a slider' })
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), result)
    const fn = request.tools[0].function
    if (provider === 'CEREBRAS' && model === 'qwen-3.8-27b') {
      assert.equal(request.reasoning_effort, 'low')
    } else {
      assert.equal('reasoning_effort' in request, false)
    }
    if (provider === 'CEREBRAS') {
      assert.equal(request.tool_choice.type, 'function')
      assert.equal(request.tool_choice.function.name, 'display_visual_aid')
      assert.equal(request.parallel_tool_calls, false)
      assert.equal(fn.strict, true)
      assert.equal(fn.parameters.additionalProperties, false)
    } else {
      assert.equal('tool_choice' in request, false)
      assert.equal('parallel_tool_calls' in request, false)
      assert.equal('strict' in fn, false)
      assert.equal('additionalProperties' in fn.parameters, false)
    }
    assert.equal('response_format' in request, false)
  })
}
