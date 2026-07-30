import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, GuildMember, Message } from 'discord.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'mug',
    description: 'Try to mug someone',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class MugCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('mug')
                .setDescription('Try to mug someone')
                .addUserOption((opt) => opt.setName('person').setDescription('Who to mug').setRequired(true))
        )
    }

    public override async messageRun(message: Message) {
        const target = message.mentions.members?.first()
        if (!target) return
        await message.reply(await this.build(message, message.member as GuildMember, target))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const target = (await interaction.guild!.members.fetch(interaction.options.getUser('person', true).id)) as GuildMember
        await interaction.reply(await this.build(interaction, interaction.member as GuildMember, target))
    }

    private async build(ctx: Message | ChatInputCommandInteraction, member: GuildMember, target: GuildMember) {
        const chance = Math.floor(Math.random() * 100)
        const tier = chance <= 33 ? 'bad' : chance <= 66 ? 'neutral' : 'good'
        const color = tier === 'bad' ? 0xff7f7f : tier === 'neutral' ? 0x808080 : 0x90ee90
        const count = Number(await resolveKey(ctx, `games:mug.${tier}.count`))
        const result = (await resolveKey(ctx, `games:mug.${tier}.${Math.floor(Math.random() * count)}`, {
            user: target.displayName,
        })) as string
        return v2(
            [await resolveKey(ctx, 'games:mug.title', { member: member.displayName, target: target.displayName }), result],
            { color, thumbnail: member.user.displayAvatarURL() }
        )
    }
}
