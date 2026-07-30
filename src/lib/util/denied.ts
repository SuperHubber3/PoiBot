import { Identifiers, UserError } from '@sapphire/framework'

/**
 * Turns a precondition failure into something worth reading. Shared by the two
 * denied listeners, which live in separate files because Sapphire keys pieces by
 * filename and evicts every class in a file but the last one it loads.
 */
export function deniedText(error: UserError): string {
    if (error.identifier === Identifiers.PreconditionCooldown) {
        const remaining = (error.context as { remaining?: number })?.remaining ?? 0
        const seconds = Math.ceil(remaining / 1000)
        return `⏳ You're on cooldown! Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
    }
    return error.message
}
