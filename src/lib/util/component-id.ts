import type {
    ButtonInteraction,
    AnySelectMenuInteraction,
    MessageComponentInteraction,
} from 'discord.js'

/**
 * Structured customId codec for persistent component interactions.
 *
 * Format: `cmd:owner:action:arg`
 *   - cmd    — command/family key the InteractionHandler matches on (e.g. "tycoon")
 *   - owner  — the user id allowed to use this component (for two-party commands
 *              like trade/marry this is the id of whoever must click, e.g. the target)
 *   - action — which button/action within the command (e.g. "buy_speed", "page")
 *   - arg    — optional payload (index, tier, or a session key). Must not contain ':'
 *
 * guildId and messageId are intentionally NOT encoded — they are read from the
 * interaction itself, which keeps ids well under Discord's 100-char limit.
 */
export interface ComponentId {
    cmd: string
    owner: string
    action: string
    arg?: string
}

const SEP = ':'

export function encodeId({ cmd, owner, action, arg = '' }: ComponentId): string {
    const id = [cmd, owner, action, arg].join(SEP)
    if (id.length > 100) throw new Error(`customId too long (${id.length}): ${id}`)
    return id
}

export function decodeId(customId: string): ComponentId | null {
    const parts = customId.split(SEP)
    if (parts.length < 3) return null
    const [cmd, owner, action, ...rest] = parts
    return { cmd, owner, action, arg: rest.join(SEP) || undefined }
}

/**
 * Used inside an InteractionHandler's `parse`: returns the decoded id if the
 * customId belongs to `cmd`, else null (so the handler skips it).
 */
export function matchId(
    interaction: MessageComponentInteraction,
    cmd: string
): ComponentId | null {
    const decoded = decodeId(interaction.customId)
    if (!decoded || decoded.cmd !== cmd) return null
    return decoded
}

/** True when this interaction's clicker is the component owner. */
export function isOwner(
    interaction: ButtonInteraction | AnySelectMenuInteraction,
    id: ComponentId
): boolean {
    return interaction.user.id === id.owner
}
