import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags, User } from 'discord.js'
import { getSilver } from '../../lib/functions/economy.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'balance',
    aliases: ['bal', 'money', 'silver'],
    description: 'Displays the silver balance of a user',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class BalanceCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('balance')
                .setDescription('Displays the silver balance of a user')
                .addUserOption((opt) => opt.setName('user').setDescription('User to display').setRequired(false))
        )
    }

    public override async messageRun(message: Message) {
        const target = message.mentions.users.first() ?? message.author
        await message.reply(await this.line(message, message.author, target))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('user') ?? interaction.user
        await interaction.reply({ content: await this.line(interaction, interaction.user, target), flags: MessageFlags.Ephemeral })
    }

    private async line(ctx: Message | ChatInputCommandInteraction, author: User, target: User) {
        const silver = await getSilver(ctx.guild!.id, target.id)
        const key = author.id === target.id ? 'common:balanceSelf' : 'common:balanceOther'
        return resolveKey(ctx, key, { amount: silver })
    }
}
