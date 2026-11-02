import { ApplyOptions } from '@sapphire/decorators'
import { BucketScope, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js'
import { type ChatAction } from '../../lib/chat/chat.js'
import { respondToChat } from '../../lib/chat/respond.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'chat-memory', description: 'Manage shared chatbot memory for this channel',
    runIn: 'GUILD_ANY', cooldownDelay: 5000, cooldownScope: BucketScope.User,
})
export class ChatMemoryCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) => guildOnly(builder)
            .setName('chat-memory').setDescription('Manage shared chatbot memory for this channel')
            .addSubcommand((sub) => sub.setName('memories').setDescription('View shared memories for this channel'))
            .addSubcommand((sub) => sub.setName('forget').setDescription('Delete a shared memory or all memories in this channel')
                .addStringOption((option) => option.setName('key').setDescription('A memory key, or all')
                    .setRequired(true).setMaxLength(48)))
            .addSubcommand((sub) => sub.setName('reset').setDescription('Clear recent chat while keeping saved facts')))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return
        await interaction.deferReply()
        const subcommand = interaction.options.getSubcommand()
        const scope = `${interaction.guildId}-${interaction.channelId}`
        let action: ChatAction
        switch (subcommand) {
            case 'memories': action = { kind: 'memories' }; break
            case 'forget': action = { kind: 'forget', key: interaction.options.getString('key', true).trim() }; break
            case 'reset': action = { kind: 'reset' }; break
            default: return
        }
        const text = await respondToChat(interaction, scope, action)
        if (text.length > 2000) {
            return interaction.editReply({
                content: await resolveKey(interaction, 'chat:memoryFile'),
                files: [new AttachmentBuilder(Buffer.from(text), { name: 'memories.txt' })],
                allowedMentions: { parse: [] },
            })
        }
        return interaction.editReply({ content: text, allowedMentions: { parse: [] } })
    }

}
