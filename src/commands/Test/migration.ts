import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { CommandType } from '../../lib/enums/command.enum.js'
import { AwardSystemService } from '../../lib/services/award-system.service.js'
import { TEST_GUILDS } from '../../lib/constants.js'
import { guildOnly } from '../../lib/util/install-context.js'

// Seeds the awards collection. Owner-only, registered only in test guilds.
@ApplyOptions<Command.Options>({
    name: 'migration',
    description: 'test',
    runIn: 'GUILD_ANY',
    preconditions: ['OwnerOnly'],
})
export class MigrationCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) => guildOnly(builder).setName('migration').setDescription('test'), {
            guildIds: TEST_GUILDS,
        })
    }

    private async runMigration(): Promise<boolean> {
        try {
            await new AwardSystemService(CommandType.Hug).createSchemaIfDoesntExists()
            return true
        } catch (error) {
            // Firing this unawaited turned a seed failure into an unhandled
            // rejection and still reported success to whoever ran it.
            this.container.logger.error('[migration] award seeding failed', error)
            return false
        }
    }

    public override async messageRun(message: Message) {
        if (!message.guildId || !TEST_GUILDS.includes(message.guildId)) {
            return message.reply('Migration is not available in this server.')
        }
        const ok = await this.runMigration()
        return message.reply(ok ? 'Migration executed!' : 'Migration failed, check the logs.')
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        const ok = await this.runMigration()
        return interaction.editReply(ok ? 'Migration executed!' : 'Migration failed, check the logs.')
    }
}
