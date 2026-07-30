import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageFlags,
    SendableChannels,
    User,
} from 'discord.js'
import { getMarry } from '../../lib/functions/economy.js'
import { buttonRow, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'

import { OWO_BOT_ID } from '../../lib/constants.js'

export const MARRY_CMD = 'marry'

@ApplyOptions<Command.Options>({
    name: 'marry',
    description: 'Time to get married ;)',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class MarryCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('marry')
                .setDescription('Time to get married ;)')
                .addUserOption((opt) => opt.setName('user').setDescription('Who to marry').setRequired(true))
        )
    }

    public override async messageRun(message: Message) {
        await this.marry(message, message.author, message.mentions.users.first(), message.channel as SendableChannels)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('user')
        await interaction.reply({ content: await resolveKey(interaction, 'fun:marrySlashAck'), flags: MessageFlags.Ephemeral })
        await this.marry(interaction, interaction.user, target, interaction.channel as SendableChannels)
    }

    private async marry(
        ctx: Message | ChatInputCommandInteraction,
        author: User,
        target: User | null | undefined,
        channel: SendableChannels
    ) {
        const guildId = ctx.guild!.id
        const say = (content: string) => channel.send({ content, allowedMentions: { parse: [] } })

        if (!target) return void say(await resolveKey(ctx, 'fun:marryNoTarget'))
        if (target.id === OWO_BOT_ID) return void say(await resolveKey(ctx, 'fun:marryOwoBot'))
        if (target.bot) return void say(await resolveKey(ctx, 'fun:marryBot'))
        if (target.id === author.id) return void say(await resolveKey(ctx, 'fun:marrySelf'))

        const authorMarriedTo = await getMarry(guildId, author.id)
        const targetMarriedTo = await getMarry(guildId, target.id)

        if (authorMarriedTo === target.id)
            return void say(await resolveKey(ctx, 'fun:marryAlreadyWithTarget', { target: `<@${target.id}>` }))
        if (authorMarriedTo) return void say(await resolveKey(ctx, 'fun:marryYouAreMarried'))
        if (targetMarriedTo)
            return void say(await resolveKey(ctx, 'fun:marryTargetMarried', { partner: `<@${targetMarriedTo}>` }))

        const row = buttonRow(
            new ButtonBuilder()
                .setCustomId(encodeId({ cmd: MARRY_CMD, owner: target.id, action: 'yes', arg: author.id }))
                .setEmoji('👍')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(encodeId({ cmd: MARRY_CMD, owner: target.id, action: 'no', arg: author.id }))
                .setEmoji('👎')
                .setStyle(ButtonStyle.Danger)
        )

        await say(await resolveKey(ctx, 'fun:marryRing'))
        const promptContainer = v2Container(await resolveKey(ctx, 'fun:marryProposal', {
            target: `<@${target.id}>`,
            author: `<@${author.id}>`,
        }), { rows: [row] })
        await channel.send({
            ...v2Payload(promptContainer),
            allowedMentions: { users: [target.id] },
        })
    }
}
