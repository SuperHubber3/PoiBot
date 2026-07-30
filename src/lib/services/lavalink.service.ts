import { container } from '@sapphire/framework'
import { connect as netConnect } from 'node:net'
import { Connectors, Shoukaku } from 'shoukaku'
import type { NodeOption } from 'shoukaku'

/**
 * Lavalink connection (the same stack FlaviBot uses: Lavalink node + Shoukaku).
 *
 * All audio decoding/encoding happens in the Lavalink JVM and is sent straight to
 * Discord — the bot only sends control messages. That is why this sounds cleaner
 * and more consistent than in-process ffmpeg + opus.
 *
 * The node is started separately: `./lavalink/start.sh`
 */

let shoukaku: Shoukaku | null = null

function nodeOption(): NodeOption {
    const auth = process.env.LAVALINK_PASSWORD
    if (!auth) throw new Error('LAVALINK_PASSWORD is required')
    return {
        name: process.env.LAVALINK_NAME ?? 'main',
        url: process.env.LAVALINK_URL ?? 'localhost:2333',
        auth,
        secure: (process.env.LAVALINK_SECURE ?? 'false') === 'true',
    }
}

/** Creates the Shoukaku instance and wires logging. Call once, at startup. */
export function initLavalink(): Shoukaku {
    if (shoukaku) return shoukaku

    // Deliberately constructed with NO nodes — see superviseNode() below, which
    // registers the node itself once Lavalink is actually listening.
    shoukaku = new Shoukaku(new Connectors.DiscordJS(container.client as any), [], {
        // Resume a session after a bot restart so playback isn't dropped.
        resume: true,
        resumeTimeout: 30,
        resumeByLibrary: true,
        /**
         * One attempt per connect() call — NOT a retry budget.
         *
         * shoukaku 4.3.0's internal retry loop never clears `connectError` when a
         * later attempt succeeds:
         *
         *     for (...) { try { ws = await createConnection(); break }
         *                 catch (e) { connectError = e; await wait(...) } }
         *     if (connectError) { state = DISCONNECTED; cleanupWebsocket(); emit('disconnect') }
         *
         * So "fail once, then succeed" tears down the *working* socket and parks the
         * node — and because Shoukaku binds `node.once('disconnect', () => nodes.delete(name))`,
         * the node is dropped from the map entirely and can never come back on its
         * own. That is exactly what happens when the bot wins the startup race
         * against the JVM. Retrying is our job instead; see superviseNode().
         */
        reconnectTries: 1,
        reconnectInterval: 5,
        restTimeout: 60,
        // Keep playing if the node briefly drops instead of killing the queue.
        moveOnDisconnect: false,
        userAgent: 'PoiBot/2.0',
    })

    // Shoukaku throws on an unhandled 'error' listener, so always bind it.
    shoukaku.on('error', (name, error) => container.logger.error(`[Lavalink:${name}]`, error))
    shoukaku.on('ready', (name, reconnected) =>
        container.logger.info(`[Lavalink:${name}] ready${reconnected ? ' (reconnected)' : ''}`)
    )
    shoukaku.on('close', (name, code, reason) =>
        container.logger.warn(`[Lavalink:${name}] closed ${code} ${reason || ''}`)
    )
    shoukaku.on('disconnect', (name, count) =>
        container.logger.warn(`[Lavalink:${name}] disconnected (${count} players moved/destroyed)`)
    )

    void superviseNode().catch((error) =>
        container.logger.warn('[Lavalink] supervisor stopped; music is disabled', error)
    )
    return shoukaku
}

/** Is something listening on the node's host:port yet? */
function portOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = netConnect({ host, port })
        const done = (ok: boolean) => {
            socket.destroy()
            resolve(ok)
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false))
        socket.once('error', () => done(false))
    })
}

/**
 * Owns the node's whole lifecycle: waits for the client to log in, waits for
 * Lavalink to actually accept TCP connections, then registers the node — and
 * re-registers it if it ever drops out of the map.
 *
 * Probing the port first is what removes the ECONNREFUSED spam when the bot and
 * the JVM start together: we simply don't try until there is something to talk to.
 */
async function superviseNode() {
    const option = nodeOption()
    const [host, rawPort] = option.url.replace(/^wss?:\/\//, '').split(':')
    const port = Number(rawPort) || (option.secure ? 443 : 80)

    // Shoukaku needs the bot's user id, which only exists once the client is ready.
    if (!container.client.isReady()) {
        await new Promise<void>((resolve) => container.client.once('clientReady', () => resolve()))
    }

    let announcedWait = false
    for (;;) {
        const registered = shoukaku?.nodes.get(option.name)
        // States: CONNECTING=0, CONNECTED=1, DISCONNECTING=2, DISCONNECTED=3.
        if (!registered || registered.state === 3) {
            if (await portOpen(host, port)) {
                if (registered) shoukaku!.removeNode(option.name, 'restarting node')
                container.logger.info(`[Lavalink:${option.name}] node reachable, connecting`)
                shoukaku!.addNode(option)
                announcedWait = false
            } else if (!announcedWait) {
                container.logger.info(`[Lavalink:${option.name}] waiting for ${host}:${port} to come up...`)
                announcedWait = true
            }
        }
        await new Promise((r) => setTimeout(r, 5000))
    }
}

/** The Shoukaku instance, or null if initLavalink() hasn't run yet. */
export function getShoukaku(): Shoukaku | null {
    return shoukaku
}

// Shoukaku node states: CONNECTING=0, CONNECTED=1, DISCONNECTING=2, DISCONNECTED=3.
const CONNECTED = 1
const CONNECTING = 0

/** True when at least one Lavalink node is connected and usable. */
export function hasNode(): boolean {
    if (!shoukaku) return false
    for (const node of shoukaku.nodes.values()) {
        if (node.state === CONNECTED) return true
    }
    return false
}

/** An arbitrary connected node (used for track resolution). */
export function idealNode() {
    if (!shoukaku) return undefined
    return [...shoukaku.nodes.values()].find((n) => n.state === CONNECTED)
}

/** Human-readable node states, for diagnosing "node offline" reports. */
export function describeNodes(): string {
    if (!shoukaku) return 'shoukaku not initialised'
    const names = ['CONNECTING', 'CONNECTED', 'DISCONNECTING', 'DISCONNECTED']
    const nodes = [...shoukaku.nodes.values()]
    if (!nodes.length) return 'no nodes registered'
    return nodes.map((n) => `${n.name}=${names[n.state] ?? n.state}`).join(', ')
}

/**
 * Resolves once a node is connected, or false after `timeoutMs`.
 *
 * Commands use this instead of a bare hasNode() check so invoking music right
 * after a (re)start — while the node is still handshaking — waits a moment
 * rather than falsely reporting the node as offline.
 */
export async function awaitNode(timeoutMs = 8000): Promise<boolean> {
    if (hasNode()) return true
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250))
        if (hasNode()) return true
    }
    container.logger.warn(`[Lavalink] command reported node offline. States: ${describeNodes()}`)
    return false
}
