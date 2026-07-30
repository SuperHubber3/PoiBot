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

    private runMigration() {
        new AwardSystemService(CommandType.Hug).createSchemaIfDoesntExists()
    }

    public override messageRun(message: Message) {
        if (!message.guildId || !TEST_GUILDS.includes(message.guildId)) {
            return message.reply('Migration is not available in this server.')
        }
        this.runMigration()
        return message.reply('Migration executed!')
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        this.runMigration()
        return interaction.reply('Migration executed!')
    }
}
