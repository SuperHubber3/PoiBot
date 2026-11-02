import { container } from '@sapphire/framework'
import type { SendableChannels } from 'discord.js'

/**
 * Channel that receives economy audit lines (currently only the steal wipe).
 *
 * Set STEAL_LOG_CHANNEL_ID to opt in. Missing or empty configuration disables
 * forwarding; no server receives audit messages by default.
 */
const AUDIT_CHANNEL_ID = process.env.STEAL_LOG_CHANNEL_ID

/**
 * Fire-and-forget audit line. Never throws: the bot may not share a guild with
 * the audit channel, and a failed log must not roll back the action it records.
 */
export async function auditLog(text: string) {
    if (!AUDIT_CHANNEL_ID) return
    try {
        const channel = await container.client.channels.fetch(AUDIT_CHANNEL_ID)
        if (channel?.isTextBased()) await (channel as SendableChannels).send(text)
    } catch {
        container.logger.debug(`[audit] could not reach channel ${AUDIT_CHANNEL_ID}`)
    }
}
