import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, version as djsVersion } from 'discord.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere } from '../../lib/util/install-context.js'

function humanize(seconds: number): string {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

/**
 * Bot stats, uptime and latency in one place — this used to be three commands
 * (`/botinfo`, `/uptime`, `/ping`) showing four numbers between them. Both old
 * names are kept as prefix aliases.
 *
 * Round-trip latency is measured after the initial reply is acknowledged, then
 * the response is edited through the interaction token.
 */
@ApplyOptions<Command.Options>({
    name: 'botinfo',
    aliases: ['bi', 'ping', 'uptime'],
    description: 'Shows bot statistics, uptime and latency',
})
export class BotInfoCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            anywhere(b).setName('botinfo').setDescription('Shows bot statistics, uptime and latency')
        )
    }

    public override async messageRun(message: Message) {
        const sent = await message.reply(await this.build(message, null))
        await sent.edit(await this.build(message, sent.createdTimestamp - message.createdTimestamp))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(await this.build(interaction, null))
        await interaction.editReply(await this.build(interaction, Date.now() - interaction.createdTimestamp))
    }

    /** `rtt` is null on the first pass, before a reply timestamp exists. */
    private async build(ctx: Message | ChatInputCommandInteraction, rtt: number | null) {
        const { client } = this.container
        const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)
        const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
        const [servers, usersLabel, memoryLabel, ping, latency, uptime] = await Promise.all([
            resolveKey(ctx, 'misc:botInfoServers'),
            resolveKey(ctx, 'misc:botInfoUsers'),
            resolveKey(ctx, 'misc:botInfoMemory'),
            resolveKey(ctx, 'misc:botInfoPing'),
            resolveKey(ctx, 'misc:botInfoLatency'),
            resolveKey(ctx, 'misc:botInfoUptime'),
        ])

        return v2([
            '## PoiBot',
            `**${servers}:** ${client.guilds.cache.size}\n` +
                `**${usersLabel}:** ${users}\n` +
                `**${uptime}:** ${humanize(process.uptime())}\n` +
                `**${memoryLabel}:** ${memory} MB\n` +
                `**discord.js:** v${djsVersion}\n` +
                `**${ping}:** ${Math.round(client.ws.ping)}ms\n` +
                `**${latency}:** ${rtt === null ? '…' : `${rtt}ms`}`,
        ])
    }
}
