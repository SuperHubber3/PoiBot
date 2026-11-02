import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ChatSettings } from '../src/lib/chat/settings.js'
import { askCodex } from '../src/lib/chat/codex.js'

test('CLI uses the selected model, reasoning and fast tier, ephemeral mode, stdin, and a restricted environment', async (t) => {
    const settings: ChatSettings = { model: 'gpt-6.1-sol', reasoning: 'low', tier: 'fast' }
    const directory = await mkdtemp(join(tmpdir(), 'poibot-codex-test-'))
    const executable = join(directory, 'codex-stub')
    const previous = process.env.CODEX_BIN
    const previousToken = process.env.DISCORD_TOKEN
    t.after(async () => {
        if (previous === undefined) delete process.env.CODEX_BIN
        else process.env.CODEX_BIN = previous
        if (previousToken === undefined) delete process.env.DISCORD_TOKEN
        else process.env.DISCORD_TOKEN = previousToken
        await rm(directory, { recursive: true, force: true })
    })
    await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
assert.equal(args[args.indexOf('--model') + 1], 'gpt-6.1-sol');
assert(args.includes('model_reasoning_effort="low"'));
assert(args.includes('service_tier="fast"'));
assert(args.includes('--ephemeral'));
assert(args.includes('--ignore-user-config'));
assert(args.includes('features.shell_tool=false'));
assert.equal(process.env.DISCORD_TOKEN, undefined);
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  assert.equal(input, 'hello with shell characters $(echo nope)');
  fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({reply: process.cwd(), remember: []}));
});
`, { mode: 0o700 })
    process.env.CODEX_BIN = executable
    process.env.DISCORD_TOKEN = 'test-token-must-not-be-passed'
    const result = await askCodex('hello with shell characters $(echo nope)', settings)
    assert.deepEqual(result.remember, [])
    await assert.rejects(access(result.reply), { code: 'ENOENT' })
    await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify({reply:'ok',remember:[{key:'bad',fact:''}]}));
`, { mode: 0o700 })
    await assert.rejects(askCodex('hello', settings), /Invalid memory/)
})
