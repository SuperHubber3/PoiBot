import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchMinecraftStatus, parseMinecraftStatus } from '../src/lib/services/minecraft-status.service.js'

test('Minecraft status keeps the existing endpoint and query behavior and formats online/offline data', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
        online: true, motd: { clean: 'Welcome' }, players: { online: 1, max: 20, list: [{ name_raw: 'Alex' }] },
    }))
    assert.deepEqual(await fetchMinecraftStatus('example.com', 25565), {
        online: true, motd: 'Welcome', names: 'Alex', onlinePlayers: 1, maxPlayers: 20,
    })
    assert.equal(fetch.mock.calls[0].arguments[0], 'https://api.mcstatus.io/v2/status/java/example.com%3A25565?query=true')
    assert.deepEqual(parseMinecraftStatus({ online: false }), {
        online: false, motd: '', names: '', onlinePlayers: 0, maxPlayers: 0,
    })
})

test('Minecraft status rejects malformed, oversized, failed, and disconnected responses', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ online: 'true' }))
    await assert.rejects(fetchMinecraftStatus('example.com', 25565), /Invalid Minecraft status/)
    fetch.mock.mockImplementation(async () => new Response('unavailable', { status: 503 }))
    await assert.rejects(fetchMinecraftStatus('example.com', 25565), /request failed/)
    fetch.mock.mockImplementation(async () => new Response('x'.repeat(256 * 1024 + 1)))
    await assert.rejects(fetchMinecraftStatus('example.com', 25565), /too large/)
    fetch.mock.mockImplementation(async () => { throw new Error('network failure') })
    await assert.rejects(fetchMinecraftStatus('example.com', 25565), /network failure/)
    const bounded = parseMinecraftStatus({ online: true, motd: { clean: 'x'.repeat(5000) }, players: {
        online: Infinity, max: -1, list: Array.from({ length: 1000 }, () => ({ name_raw: 'x'.repeat(1000) })),
    } })
    assert.equal(bounded.motd.length, 1000)
    assert.equal(bounded.names.length, 1000)
    assert.equal(bounded.onlinePlayers, 0)
    assert.equal(bounded.maxPlayers, 0)
})
