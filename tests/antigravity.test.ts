import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askAntigravity } from '../src/lib/chat/antigravity.js'
import { DEFAULT_CHAT_SETTINGS } from '../src/lib/chat/settings.js'

test('Antigravity uses an isolated T3 OAuth copy, selects model/reasoning, and denies tool requests', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-acp-test-'))
    const keys = ['ANTIGRAVITY_BIN', 'CHAT_ANTIGRAVITY_PROFILE', 'DISCORD_TOKEN']
    const previous = keys.map((key) => process.env[key])
    t.after(async () => {
        keys.forEach((key, index) => {
            const value = previous[index]
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        })
        await rm(directory, { recursive: true, force: true })
    })
    await mkdir(join(directory, 'antigravity-acp'))
    const token = join(directory, 'antigravity-acp', 'acp_token.json')
    await writeFile(token, 'dummy-test-credential')
    const executable = join(directory, 'fake-acp')
    process.env.ANTIGRAVITY_BIN = executable
    process.env.CHAT_ANTIGRAVITY_PROFILE = directory
    process.env.DISCORD_TOKEN = 'must-not-leak'
    const source = `#!/usr/bin/env node
const fs = require('node:fs');
const assert = require('node:assert/strict');
const readline = require('node:readline');
assert.equal(process.env.DISCORD_TOKEN, undefined);
assert.notEqual(process.env.GEMINI_HOME, ${JSON.stringify(directory)});
assert.equal(fs.readFileSync(process.env.GEMINI_HOME + '/antigravity-acp/acp_token.json', 'utf8'), 'dummy-test-credential');
fs.writeFileSync(process.env.GEMINI_HOME + '/antigravity-acp/acp_token.json', 'refreshed-test-token');
let selected = false;
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
readline.createInterface({input: process.stdin}).on('line', line => {
 const message = JSON.parse(line);
 if (!message.method) return;
 let result = {};
 if (message.method === 'initialize') assert.equal(message.params.clientCapabilities.terminal, false);
 if (message.method === 'authenticate') assert.equal(message.params.methodId, 'oauth-personal');
 if (message.method === 'session/new') {
   assert.deepEqual(message.params.mcpServers, []);
   result = {sessionId: 'test-session'};
 }
 if (message.method === 'session/set_mode') assert.equal(message.params.modeId, 'default');
 if (message.method === 'session/set_config_option') {
   assert.equal(message.params.configId, 'model');
   assert.equal(message.params.value, 'gemini-3.8-flash-low');
   selected = true;
 }
 if (message.method === 'session/prompt') {
   assert(selected);
   if (message.params.prompt[0].text.endsWith('tool-test')) {
     send({jsonrpc:'2.0',id:999,method:'session/request_permission',params:{}});
     return;
   }
   send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'test-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:JSON.stringify({reply:process.env.GEMINI_HOME,remember:[]})}}}});
   result = {stopReason:'end_turn'};
 }
 send({jsonrpc:'2.0',id:message.id,result});
});
`
    await writeFile(executable, source, { mode: 0o700 })
    const result = await askAntigravity('hello', DEFAULT_CHAT_SETTINGS)
    assert.deepEqual(result.remember, [])
    await assert.rejects(access(result.reply), { code: 'ENOENT' })
    assert.equal(await readFile(token, 'utf8'), 'dummy-test-credential')
    await assert.rejects(askAntigravity('tool-test', DEFAULT_CHAT_SETTINGS), /Antigravity request failed/)
})
