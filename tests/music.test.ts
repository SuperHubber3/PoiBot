import assert from 'node:assert/strict'
import { test } from 'node:test'
import { container, Logger, LogLevel } from '@sapphire/framework'
import { Client } from 'discord.js'
import { Connectors, Node, Player, Shoukaku, type Track } from 'shoukaku'
import { MusicQueue } from '../src/lib/music/queue.js'

const track = (identifier: string): Track => ({
    encoded: identifier,
    info: { identifier, isSeekable: true, author: 'Artist', length: 1000, isStream: false,
        position: 0, title: identifier, uri: null, artworkUrl: null, isrc: null, sourceName: 'youtube' },
    pluginInfo: {},
})
function player() {
    const client = new Client({ intents: [] })
    const manager = new Shoukaku(new Connectors.DiscordJS(client), [])
    const node = new Node(manager, { name: 'test', url: 'localhost:2333', auth: 'test' })
    return { client, player: new Player('guild', node) }
}

test('stopping during an autoplay lookup never restarts playback', async (t) => {
    const fixture = player()
    t.after(() => fixture.client.destroy())
    let finish: (value: Track | null) => void = () => {}
    const related = new Promise<Track | null>((resolve) => { finish = resolve })
    const queue = new MusicQueue('guild', 'voice', fixture.player, () => related)
    queue.current = { track: track('old'), requesterId: 'user' }
    queue.autoplay = true
    const play = t.mock.method(fixture.player, 'playTrack', async () => {})
    const advance = queue.advance()
    await queue.destroy()
    finish(track('related'))
    await advance
    assert.equal(queue.current, null)
    assert.equal(play.mock.callCount(), 0)
})

test('a load failure drops the failed song even when queue repeat is enabled', async (t) => {
    const fixture = player()
    t.after(() => fixture.client.destroy())
    const queue = new MusicQueue('failure-guild', 'voice', fixture.player)
    queue.repeat = 'queue'
    queue.current = { track: track('failed'), requesterId: 'user' }
    queue.add(track('next'), 'user')
    t.mock.method(fixture.player, 'playTrack', async () => {})
    t.mock.method(fixture.player, 'setFilters', async () => {})
    fixture.player.emit('end', { reason: 'loadFailed' })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(queue.current?.track.encoded, 'next')
    assert.equal(queue.tracks.length, 0)
    await queue.destroy()
})

test('skipping an idle queue does not block the next active skip', async (t) => {
    const fixture = player()
    t.after(() => fixture.client.destroy())
    const queue = new MusicQueue('idle-guild', 'voice', fixture.player)
    const stop = t.mock.method(fixture.player, 'stopTrack', async () => {})
    await queue.skip()
    assert.equal(stop.mock.callCount(), 0)
    queue.current = { track: track('next'), requesterId: 'user' }
    await queue.skip()
    assert.equal(stop.mock.callCount(), 1)
    await queue.destroy()
})

test('a late playback failure cannot clear a newer track or consume its successor', async (t) => {
    const fixture = player()
    t.after(() => fixture.client.destroy())
    const previousLogger = container.logger
    container.logger = new Logger(LogLevel.None)
    t.after(() => { container.logger = previousLogger })
    const queue = new MusicQueue('late-failure-guild', 'voice', fixture.player)
    let rejectFirst: (error: Error) => void = () => {}
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    let calls = 0
    t.mock.method(fixture.player, 'playTrack', () => ++calls === 1 ? first : Promise.resolve())
    t.mock.method(fixture.player, 'setFilters', async () => {})
    queue.add(track('old'), 'user')
    queue.add(track('new'), 'user')
    queue.add(track('later'), 'user')
    const starting = queue.start()
    await queue.advance()
    rejectFirst(new Error('Late response from old play request'))
    await starting
    assert.equal(queue.current?.track.encoded, 'new')
    assert.deepEqual(queue.tracks.map((entry) => entry.track.encoded), ['later'])
    assert.equal(calls, 2)
    await queue.destroy()
})
