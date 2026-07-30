import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { delMarry, getMarry } from '../../lib/functions/economy.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'divorce',
    description: 'Divorce your partner',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class DivorceCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) => guildOnly(builder).setName('divorce').setDescription('Divorce your partner'))
    }

    public override async messageRun(message: Message) {
        await message.reply(await this.divorce(message, message.guild!.id, message.author.id))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(await this.divorce(interaction, interaction.guild!.id, interaction.user.id))
    }

    private async divorce(ctx: Message | ChatInputCommandInteraction, guildId: string, userId: string) {
        const partner = await getMarry(guildId, userId)
        if (!partner) return resolveKey(ctx, 'fun:divorceNotMarried')

        await delMarry(guildId, userId)
        await delMarry(guildId, partner)
        return resolveKey(ctx, 'fun:divorceSuccess')
    }
}
