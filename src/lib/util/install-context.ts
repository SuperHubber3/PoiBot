import { ApplicationIntegrationType, InteractionContextType } from 'discord.js'
import type { SlashCommandOptionsOnlyBuilder, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js'

/**
 * User-installable ("user app") support.
 *
 * A command marked with `anywhere()` is registered for BOTH installation types, so
 * it works in servers that added the bot *and* for anyone who added the app to
 * their own account — in DMs, group DMs, and servers the bot isn't even in.
 *
 * Only commands that need no guild state qualify. Anything reading or writing
 * per-guild data (silver, waifus, counters, levels, AutoMod) must stay
 * guild-only, because outside a guild there is no `guild.id` to key it by, and
 * anything touching voice obviously needs a real server too.
 *
 * NOTE: this only declares intent. The application ALSO has to have User Install
 * enabled in the Discord Developer Portal (Application → Installation →
 * Installation Contexts → tick "User Install"), otherwise Discord rejects the
 * registration. See the README.
 */

/** Guild channels, the bot's own DMs, and group DMs / other users' DMs. */
export const ANY_CONTEXT = [
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
] as const

export const BOTH_INSTALLS = [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
] as const

type AnyBuilder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder

/**
 * Builders passed through `anywhere()`.
 *
 * The name isn't known when `anywhere(b)` runs — callers chain `.setName()` after
 * it — so the builder itself is kept and read later, once registration has
 * finished. That keeps the list honest: it can't drift from the actual calls the
 * way a hand-maintained array of names would.
 */
const userAppBuilders: AnyBuilder[] = []

/** Names of every command usable outside a server. Safe to call after startup. */
export function userAppCommandNames(): Set<string> {
    return new Set(userAppBuilders.map((b) => b.name).filter(Boolean))
}

/** Marks a slash command as usable anywhere, under either installation type. */
export function anywhere<T extends AnyBuilder>(builder: T): T {
    builder.setContexts(...ANY_CONTEXT).setIntegrationTypes(...BOTH_INSTALLS)
    userAppBuilders.push(builder)
    return builder
}

/**
 * Pins a command to servers the bot is actually in.
 *
 * This is NOT the default and must be stated explicitly. A command that declares
 * no `integration_types` inherits the *application's*, and since this app has
 * User Install enabled that silently means "both" — so `/trade`, `/shop` and every
 * other guild-keyed command would be installable to a user account and would then
 * throw on `interaction.guild!.id` the first time someone ran it in a DM.
 */
export function guildOnly<T extends AnyBuilder>(builder: T): T {
    builder
        .setContexts(InteractionContextType.Guild)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    return builder
}
