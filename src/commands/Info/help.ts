import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ApplicationIntegrationType, ChatInputCommandInteraction, Message } from 'discord.js'
import { CATEGORY_SETTINGS, categoryEmoji } from '../../lib/util/categories.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere, userAppCommandNames } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'help',
    description: 'Lists all available commands by category',
})
export class HelpCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder).setName('help').setDescription('Lists all available commands by category')
        )
    }

    /**
     * Was this invocation authorised by the *server's* install?
     *
     * If so the bot is a member here and everything is available. If it was only
     * authorised by the user's own install — a DM, or a server PoiBot isn't in —
     * then only the user-app commands can actually run, and listing the rest just
     * hands people commands that will fail.
     */
    private guildAuthorised(ctx: Message | ChatInputCommandInteraction): boolean {
        if (ctx instanceof Message) return ctx.inGuild()
        const owners = ctx.authorizingIntegrationOwners as Record<string, string> | undefined
        return owners?.[ApplicationIntegrationType.GuildInstall] !== undefined
    }

    private async buildPayload(ctx: Message | ChatInputCommandInteraction) {
        const commands = this.container.stores.get('commands')
        const title = await resolveKey(ctx, 'misc:helpTitle')
        const noDescription = await resolveKey(ctx, 'misc:helpNoDescription')

        const full = this.guildAuthorised(ctx)
        const usable = full ? null : userAppCommandNames()

        // Group commands by their category (the parent folder name).
        const byCategory = new Map<string, string[]>()
        for (const command of commands.values()) {
            if (usable && !usable.has(command.name)) continue
            const category = command.category ?? 'Other'
            const list = byCategory.get(category) ?? []
            list.push(`\`${command.name}\`: ${command.description || noDescription}`)
            byCategory.set(category, list)
        }

        // Order known categories first (matching the old category settings), then any extras.
        const orderedNames = [
            ...CATEGORY_SETTINGS.map((c) => c.name).filter((n) => byCategory.has(n)),
            ...[...byCategory.keys()].filter((n) => !CATEGORY_SETTINGS.some((c) => c.name === n)),
        ]

        const blocks = [`## ${title}`]
        if (!full) blocks.push(await resolveKey(ctx, 'misc:helpUserAppOnly'))
        for (const name of orderedNames) {
            const emoji = categoryEmoji(name)
            blocks.push(`**${`${emoji} ${name}`.trim()}**\n${byCategory.get(name)!.join('\n')}`)
        }
        return v2(blocks, { separator: true })
    }

    public override async messageRun(message: Message) {
        return message.reply({ ...(await this.buildPayload(message)), allowedMentions: { parse: [] } })
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        return interaction.reply({ ...(await this.buildPayload(interaction)), allowedMentions: { parse: [] } })
    }
}
