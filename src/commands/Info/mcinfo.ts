import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { fetchMinecraftStatus } from '../../lib/services/minecraft-status.service.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere } from '../../lib/util/install-context.js'

const DEFAULT_HOST = '193.223.107.102'
const DEFAULT_PORT = 25925
const allowedTargets = new Set(
    [`${DEFAULT_HOST}:${DEFAULT_PORT}`, ...(process.env.MCINFO_ALLOWED_TARGETS ?? '').split(',')]
        .map((target) => target.trim().toLowerCase())
        .filter(Boolean)
)

const permittedTarget = (host: string, port: number) =>
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65_535 &&
    allowedTargets.has(`${host.trim().replace(/\.$/, '').toLowerCase()}:${port}`)

@ApplyOptions<Command.Options>({
    name: 'mcinfo',
    description: 'Displays the status of a Minecraft Java server',
    cooldownDelay: 10000,
})
export class McInfoCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('mcinfo')
                .setDescription('Displays the status of a Minecraft Java server')
                .addStringOption((opt) => opt.setName('ip').setDescription('Server IP').setRequired(false))
                .addIntegerOption((opt) => opt.setName('port').setDescription('Server port').setRequired(false))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const host = (await args.pick('string').catch(() => DEFAULT_HOST)) || DEFAULT_HOST
        const port = (await args.pick('integer').catch(() => DEFAULT_PORT)) || DEFAULT_PORT
        await message.reply({ ...(await this.build(message, host, port)), allowedMentions: { parse: [] } })
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const host = interaction.options.getString('ip') || DEFAULT_HOST
        const port = interaction.options.getInteger('port') || DEFAULT_PORT
        await interaction.reply({
            ...v2(await resolveKey(interaction, 'misc:mcinfoLoading', { host, port })),
            allowedMentions: { parse: [] },
        })
        const payload = await this.build(interaction, host, port)
        await interaction.editReply({ components: payload.components, allowedMentions: { parse: [] } })
    }

    private async build(ctx: Message | ChatInputCommandInteraction, host: string, port: number) {
        if (!permittedTarget(host, port)) {
            return v2(await resolveKey(ctx, 'misc:mcinfoUnreachable', { host, port }), { color: 0xff0000 })
        }
        try {
            const result = await fetchMinecraftStatus(host, port)
            const players = result.names || await resolveKey(ctx, 'misc:mcinfoEmpty')
            const [title, statusLabel, online, offline, motdLabel, unknown, playersList, playersOnline] = await Promise.all([
                resolveKey(ctx, 'misc:mcinfoTitle', { host, port }),
                resolveKey(ctx, 'misc:mcinfoStatus'),
                resolveKey(ctx, 'misc:mcinfoOnline'),
                resolveKey(ctx, 'misc:mcinfoOffline'),
                resolveKey(ctx, 'misc:mcinfoMotd'),
                resolveKey(ctx, 'misc:mcinfoUnknown'),
                resolveKey(ctx, 'misc:mcinfoPlayersList'),
                resolveKey(ctx, 'misc:mcinfoPlayersOnline'),
            ])
            return v2([
                `## ${title}`,
                `**${statusLabel}:** ${result.online ? online : offline}\n` +
                    `**${motdLabel}:** ${result.motd || unknown}\n` +
                    `**${playersList}:** ${players}\n` +
                    `**${playersOnline}:** ${result.onlinePlayers}/${result.maxPlayers}`,
            ])
        } catch {
            return v2(await resolveKey(ctx, 'misc:mcinfoUnreachable', { host, port }), { color: 0xff0000 })
        }
    }
}
