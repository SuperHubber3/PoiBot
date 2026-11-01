const MAX_RESPONSE_BYTES = 256 * 1024

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Only retain fields displayed by /mcinfo. The API also returns an icon and other metadata. */
export function parseMinecraftStatus(value: unknown) {
    if (!record(value) || typeof value.online !== 'boolean') throw new Error('Invalid Minecraft status')
    if (!value.online) return { online: false, motd: '', names: '', onlinePlayers: 0, maxPlayers: 0 }
    const motd = record(value.motd) && typeof value.motd.clean === 'string' ? value.motd.clean.slice(0, 1000) : ''
    const players = record(value.players) ? value.players : {}
    const names = Array.isArray(players.list) ? players.list.slice(0, 50).map((player: unknown) => {
        if (!record(player) || typeof player.name_raw !== 'string') throw new Error('Invalid Minecraft player')
        return player.name_raw.slice(0, 128)
    }).join(', ').slice(0, 1000) : ''
    const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
    return { online: true, motd, names, onlinePlayers: count(players.online), maxPlayers: count(players.max) }
}

export async function fetchMinecraftStatus(host: string, port: number) {
    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(`${host}:${port}`)}?query=true`, {
        signal: AbortSignal.timeout(8000), redirect: 'error',
    })
    if (!response.ok || !response.body) {
        await response.body?.cancel()
        throw new Error('Minecraft status request failed')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_RESPONSE_BYTES) throw new Error('Minecraft status response too large')
            chunks.push(value)
        }
    } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
    }
    return parseMinecraftStatus(JSON.parse(Buffer.concat(chunks).toString('utf8')))
}
