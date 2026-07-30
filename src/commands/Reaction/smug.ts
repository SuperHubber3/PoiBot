import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { MediaService } from '../../lib/services/media.service.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'smug',
    description: 'Sends a smug reaction',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class SmugCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('smug').setDescription('Sends a smug reaction')
        )
    }

    private async buildPayload() {
        const media = await new MediaService(CommandType.Smug).getReactionMedia()
        return v2('', { image: media })
    }

    public override async messageRun(message: Message) {
        return message.reply({ ...await this.buildPayload(), allowedMentions: { parse: [] } })
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        return interaction.editReply(await this.buildPayload())
    }
}
