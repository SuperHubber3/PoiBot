import type { Message, SendableChannels } from 'discord.js'

/**
 * Narrows `message.channel` to a sendable channel. In djs v14 the channel union
 * includes `PartialGroupDMChannel` (no `.send`); guild commands never run there,
 * so this cast is safe for our message-command handlers.
 */
export function sendable(message: Message): SendableChannels {
    return message.channel as SendableChannels
}
