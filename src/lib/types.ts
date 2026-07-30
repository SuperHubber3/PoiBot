import type { ChatInputCommandInteraction, Message, MessageComponentInteraction } from 'discord.js'

/**
 * Counter/XP increments can be triggered from a prefix message, a slash
 * interaction, or a component interaction (button/select handler). Whichever it
 * is gets forwarded to the award system so it can reply in-context when a
 * milestone is unlocked.
 */
export type AwardReplyTarget = Message | ChatInputCommandInteraction | MessageComponentInteraction
