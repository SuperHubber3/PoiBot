import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatSettingsStore, DEFAULT_CHAT_SETTINGS, parseChatSettings } from '../src/lib/chat/settings.js'
import { ChatService } from '../src/lib/chat/chat.js'
import { MemoryStore } from '../src/lib/chat/memory.js'

test('chat defaults, channel isolation, persistence, concurrent selectors, and next-request settings', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-settings-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const settings = new ChatSettingsStore(directory)
    assert.deepEqual(await settings.read('1-2'), { model: 'gemini-3.8-flash', reasoning: 'low', tier: 'normal' })
    await settings.update('1-2', { model: 'gpt-6.1-sol' })
    await Promise.all([settings.update('1-2', { reasoning: 'high' }), settings.update('1-2', { tier: 'fast' })])
    const restarted = new ChatSettingsStore(directory)
    assert.deepEqual(await restarted.read('1-2'), { model: 'gpt-6.1-sol', reasoning: 'high', tier: 'fast' })
    assert.deepEqual(await restarted.read('1-3'), DEFAULT_CHAT_SETTINGS)
    assert.deepEqual(await restarted.read('2-2'), DEFAULT_CHAT_SETTINGS)
    const seen: unknown[] = []
    const chat = new ChatService(new MemoryStore(directory), async (_prompt, selected) => {
        seen.push(selected)
        return { reply: 'OK', remember: [] }
    }, restarted)
    const say = () => chat.run('1-2', { kind: 'say', text: 'hello', speaker: { id: '1', name: 'Tester' } })
    await say()
    await restarted.update('1-2', { reasoning: 'low', tier: 'normal' })
    await say()
    assert.deepEqual(seen, [
        { model: 'gpt-6.1-sol', reasoning: 'high', tier: 'fast' },
        { model: 'gpt-6.1-sol', reasoning: 'low', tier: 'normal' },
    ])
})

test('unsupported combinations and invalid storage fail without replacing settings', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-settings-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const settings = new ChatSettingsStore(directory)
    await assert.rejects(settings.update('1-2', { tier: 'fast' }), /Gemini/)
    await assert.rejects(settings.update('1-2', { reasoning: 'xhigh' }), /Gemini/)
    await assert.rejects(settings.update('1-2', { model: '../unsafe' }), /Invalid chat settings/)
    await assert.rejects(settings.read('../escape'), /Invalid chat scope/)
    assert.throws(() => parseChatSettings({ ...DEFAULT_CHAT_SETTINGS, reasoning: 'anything' }))
    assert.throws(() => parseChatSettings({ ...DEFAULT_CHAT_SETTINGS, tier: 'anything' }))
    await settings.update('1-2', { reasoning: 'medium' })
    await writeFile(join(directory, 'settings-1-2.json'), '{broken')
    await assert.rejects(settings.update('1-2', { reasoning: 'high' }), SyntaxError)
    assert.equal(await readFile(join(directory, 'settings-1-2.json'), 'utf8'), '{broken')
})

test('one command can switch provider, reasoning, and speed atomically', async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-settings-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const settings = new ChatSettingsStore(directory)
    assert.deepEqual(await settings.update('1-2', { model: 'gpt-6.1-sol', reasoning: 'xhigh', tier: 'fast' }), {
        model: 'gpt-6.1-sol', reasoning: 'xhigh', tier: 'fast',
    })
    await assert.rejects(settings.update('1-2', { model: 'gemini-3.8-flash', reasoning: 'low', tier: 'fast' }), /Gemini/)
    assert.deepEqual(await settings.read('1-2'), { model: 'gpt-6.1-sol', reasoning: 'xhigh', tier: 'fast' })
    assert.deepEqual(await settings.update('1-2', { model: 'gemini-3.8-flash', reasoning: 'low', tier: 'normal' }), {
        model: 'gemini-3.8-flash', reasoning: 'low', tier: 'normal',
    })
    assert.deepEqual(await settings.update('1-2', { reasoning: 'medium' }), {
        model: 'gemini-3.8-flash', reasoning: 'medium', tier: 'normal',
    })
})
