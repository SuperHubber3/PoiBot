import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { TEST_GUILDS } from '../../lib/constants.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

// Placeholder command (was test-only in the old bot). Registered only in test guilds.
@ApplyOptions<Command.Options>({
    name: 'profile',
    description: 'Coming soon!',
    runIn: 'GUILD_ANY',
})
export class ProfileCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            (builder) => builder.setName('profile').setDescription('Coming soon!'),
            { guildIds: TEST_GUILDS }
        )
    }

    public override async messageRun(message: Message) {
        return message.reply(await this.build(message))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        return interaction.reply(await this.build(interaction))
    }

    private async build(ctx: Message | ChatInputCommandInteraction) {
        return v2(await resolveKey(ctx, 'counter:profileComingSoon'))
    }
}
