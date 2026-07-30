import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'avatar',
    aliases: ['av'],
    description: "Display a user's avatar",
})
export class AvatarCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('avatar')
                .setDescription("Display a user's avatar")
                .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(false))
        )
    }

    public override async messageRun(message: Message) {
        await message.reply(await this.build(message, message.mentions.users.first() ?? message.author))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(await this.build(interaction, interaction.options.getUser('user') ?? interaction.user))
    }

    private async build(ctx: Message | ChatInputCommandInteraction, user: User) {
        const title = await resolveKey(ctx, 'common:avatarTitle', { user: user.username })
        return v2(`## ${title}`, { image: user.displayAvatarURL({ size: 1024 }) })
    }
}
