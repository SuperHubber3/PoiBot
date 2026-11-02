import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatService } from '../src/lib/chat/chat.js'
import { MemoryStore, parseMemories } from '../src/lib/chat/memory.js'

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
    const directory = await mkdtemp(join(tmpdir(), 'poibot-memory-test-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    return { directory, store: new MemoryStore(directory) }
}

test('facts persist across service restarts and stay isolated by channel and server', async (t) => {
    const { store } = await fixture(t)
    const chat = new ChatService(store, async () => ({ reply: 'Hello', remember: [{ key: 'drink', fact: 'Likes tea' }] }))
    await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'I like tea' })
    const restarted = new ChatService(store)
    assert.match((await restarted.run('1-2', { kind: 'memories' })).text, /Likes tea/)
    assert.equal((await restarted.run('1-3', { kind: 'memories' })).text, '')
    assert.equal((await restarted.run('2-2', { kind: 'memories' })).text, '')
})

test('small talk writes nothing; corrections replace facts; forget removes recent context', async (t) => {
    const { directory, store } = await fixture(t)
    let count = 0
    const prompts: string[] = []
    const chat = new ChatService(store, async (prompt) => {
        prompts.push(prompt)
        count++
        return { reply: 'OK', remember: count === 1 || count === 4 ? [] : [{ key: 'drink', fact: count === 2 ? 'Tea' : 'Coffee' }] }
    })
    await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'hello' })
    await assert.rejects(readFile(join(directory, 'channel-1-2.json')), { code: 'ENOENT' })
    await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'tea' })
    await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'coffee now' })
    assert.deepEqual(await store.read('1-2'), [{ key: 'drink', fact: 'Coffee' }])
    await chat.run('1-2', { kind: 'forget', key: 'drink' })
    await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'hi' })
    assert.deepEqual(JSON.parse(prompts[3] ?? '').recentConversation, [])
    assert.deepEqual(await store.read('1-2'), [])
    await chat.run('1-2', { kind: 'forget', key: 'all' })
    await assert.rejects(readFile(join(directory, 'channel-1-2.json')), { code: 'ENOENT' })
})

test('a pending generation blocks deletion; failure releases the scope without saving', async (t) => {
    const { store } = await fixture(t)
    let fail: (error: Error) => void = () => { throw new Error('Not started') }
    let started: () => void = () => {}
    const ready = new Promise<void>((resolve) => { started = resolve })
    const chat = new ChatService(store, () => new Promise((_resolve, reject) => { fail = reject; started() }))
    const pending = chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'hello' })
    await ready
    await assert.rejects(chat.run('1-2', { kind: 'forget', key: 'all' }), /busy/)
    fail(new Error('offline'))
    await assert.rejects(pending, /offline/)
    assert.equal((await chat.run('1-2', { kind: 'memories' })).text, '')
})

test('corrupt storage is preserved and unsafe paths and malformed facts are rejected', async (t) => {
    const { store, directory } = await fixture(t)
    await writeFile(join(directory, 'channel-1-2.json'), '{broken')
    const chat = new ChatService(store, async () => { throw new Error('Must not reach model') })
    await assert.rejects(chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'hello' }), SyntaxError)
    assert.equal(await readFile(join(directory, 'channel-1-2.json'), 'utf8'), '{broken')
    await assert.rejects(store.read('../escape'), /Invalid chat scope/)
    assert.throws(() => parseMemories([{ key: 'x', fact: '' }]))
    assert.throws(() => parseMemories([{ key: 'x', fact: 'a' }, { key: 'x', fact: 'b' }]))
    await chat.run('1-2', { kind: 'forget', key: 'all' })
    assert.deepEqual(await store.read('1-2'), [])
})

test('memory cap preserves existing facts and still permits corrections', async (t) => {
    const { store } = await fixture(t)
    await store.write('1-2', Array.from({ length: 30 }, (_, index) => ({ key: `fact_${index}`, fact: 'old' })))
    const chat = new ChatService(store, async () => ({ reply: 'OK', remember: [
        { key: 'new', fact: 'extra' }, { key: 'fact_0', fact: 'corrected' },
    ] }))
    const result = await chat.run('1-2', { kind: 'say', speaker: { id: '10', name: 'Alice' }, text: 'correction' })
    assert.equal(result.saved, 1)
    const memories = await store.read('1-2')
    assert.equal(memories.length, 30)
    assert.equal(memories[0]?.fact, 'corrected')
})

test('different speakers share channel context and facts without losing attribution', async (t) => {
    const { store } = await fixture(t)
    const prompts: string[] = []
    const chat = new ChatService(store, async (prompt) => {
        prompts.push(prompt)
        return { reply: 'OK', remember: [{ key: 'meeting', fact: 'Channel meeting is Friday' }] }
    })
    await chat.run('1-2', { kind: 'say', text: 'Remember our meeting is Friday', speaker: { id: '10', name: 'Alice' } })
    await chat.run('1-2', { kind: 'say', text: 'When is our meeting?', speaker: { id: '20', name: 'Bob' } })
    const prompt = JSON.parse(prompts[1] ?? '')
    assert.deepEqual(prompt.currentSpeaker, { id: '20', name: 'Bob' })
    assert.deepEqual(prompt.recentConversation[0].speaker, { id: '10', name: 'Alice' })
    assert.equal(prompt.memories[0].fact, 'Channel meeting is Friday')
    await chat.run('1-3', { kind: 'say', text: 'Hi', speaker: { id: '10', name: 'Alice' } })
    const otherChannel = JSON.parse(prompts[2] ?? '')
    assert.deepEqual(otherChannel.memories, [])
    assert.deepEqual(otherChannel.recentConversation, [])
})

test('legacy per-user files are not loaded as shared channel memory', async (t) => {
    const { store, directory } = await fixture(t)
    await writeFile(join(directory, '1-2.json'), JSON.stringify([{ key: 'old', fact: 'Personal fact' }]))
    assert.deepEqual(await store.read('1-2'), [])
    await store.write('1-2', [{ key: 'shared', fact: 'Shared fact' }])
    assert.match(await readFile(join(directory, '1-2.json'), 'utf8'), /Personal fact/)
})
