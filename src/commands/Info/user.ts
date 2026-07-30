import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Guild, GuildMember, Message, User } from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'user',
    description: 'Displays information of a users account',
    runIn: 'GUILD_ANY',
})
export class UserCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('user')
                .setDescription('Displays information of a users account')
                .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(false))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const arg = await args.pick('string').catch(() => undefined)
        const query = arg || message.author.username
        const payload = await this.buildPayload(message, message.guild, query)
        await sendable(message).send({ ...payload, allowedMentions: { parse: [] } })
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const chosen: User = interaction.options.getUser('user') ?? interaction.user
        const payload = await this.buildPayload(interaction, interaction.guild, chosen.id)
        await interaction.reply({ ...payload, allowedMentions: { parse: [] } })
    }

    private async buildPayload(ctx: Message | ChatInputCommandInteraction, guild: Guild | null, query: string) {
        if (query.length < 2) {
            return v2(await resolveKey(ctx, 'misc:userArgTooShort'))
        }
        const numeric = /^\d+$/.test(query)
        const member = numeric
            ? await guild?.members.fetch(query).catch(() => undefined)
            : (await guild?.members.search({ query }))?.first() as GuildMember | undefined
        if (!member) {
            return v2(await resolveKey(ctx, 'misc:userNotFound', { query }))
        }

        const roleMentions = member.roles.cache
            .filter((role) => role.id !== guild?.id)
            .map((role) => role.toString())
        const counter = roleMentions.length
        const rolesText = roleMentions.join(', ')

        const [title, tag, nickname, none, joinedDiscord, joinedServer, isBot, roles] = await Promise.all([
            resolveKey(ctx, 'misc:userInfoTitle', { user: member.user.username }),
            resolveKey(ctx, 'misc:userTag'),
            resolveKey(ctx, 'misc:userNickname'),
            resolveKey(ctx, 'misc:userNone'),
            resolveKey(ctx, 'misc:userJoinedDiscord'),
            resolveKey(ctx, 'misc:userJoinedServer'),
            resolveKey(ctx, 'misc:userIsBot'),
            resolveKey(ctx, 'misc:userRoles', { count: counter }),
        ])

        return v2(
            [
                `## ${title}`,
                `**${tag}:** ${member.user.tag}\n` +
                    `**${nickname}:** ${member.nickname || none}\n` +
                    `**${joinedDiscord}:** ${new Date(member.user.createdTimestamp).toLocaleDateString()}\n` +
                    `**${joinedServer}:** ${new Date(member.joinedTimestamp!).toLocaleDateString()}\n` +
                    `**${isBot}:** ${member.user.bot}\n` +
                    `**${roles}** ${rolesText || none}`,
            ],
            { thumbnail: member.user.displayAvatarURL() }
        )
    }
}
