import type { Guild } from 'discord.js'

export interface ResolvedTarget {
    /** The mention-stripped raw input (an id or a search query). */
    raw: string
    /** Resolved user id, present only on success. */
    targetId?: string
    /** Username, present when the target was found via a name search. */
    targetName?: string
    /** Input was shorter than 2 characters. */
    tooShort?: boolean
    /** A name search returned no members. */
    notFound?: boolean
    /** After resolution the value still isn't a numeric id (silent bail in the old code). */
    invalid?: boolean
}

/**
 * Resolves a command's `<user>` argument to a user id, reproducing the logic that
 * was copy-pasted across boop/hug/user/kill/rate/etc:
 *   - strips a leading mention (`<@id>` / `<@!id>`)
 *   - if the remainder isn't numeric, searches guild members by name
 *   - flags too-short / not-found / non-numeric cases for the caller to handle
 *
 * @param rawInput  usually `interaction.options.getUser('user')?.toString() || args[0]`
 */
export async function resolveTarget(guild: Guild | null | undefined, rawInput: string | undefined): Promise<ResolvedTarget> {
    let interactionUser = rawInput ?? ''
    // Matches <@id> and the legacy nickname form <@!id>. The old slice-based strip
    // left the "!" in place, so <@!id> fell through to a (failing) name search.
    const mention = /^<@!?(\d+)>$/.exec(interactionUser)
    if (mention) {
        interactionUser = mention[1]
    } else if (interactionUser.startsWith('<')) {
        interactionUser = interactionUser.substring(2).slice(0, -1)
    }

    let target = interactionUser
    let targetName: string | undefined

    if (interactionUser.length >= 2) {
        if (!/^\d+$/.test(interactionUser)) {
            const result = await guild?.members.search({ query: interactionUser })
            const firstResult = result?.first()
            if (firstResult) {
                target = firstResult.user.id
                targetName = firstResult.user.username
            } else {
                return { raw: interactionUser, notFound: true }
            }
        }
    } else {
        return { raw: interactionUser, tooShort: true }
    }

    if (!/^\d+$/.test(target)) return { raw: interactionUser, invalid: true }

    return { raw: interactionUser, targetId: target, targetName }
}

export const TOO_SHORT_MESSAGE = 'Argument <user> should be at least 2 characters long!'
