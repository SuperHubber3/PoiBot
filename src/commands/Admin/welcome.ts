import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChannelType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js'
import guildSettingsSchema from '../../lib/models/guild-settings-schema.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'welcome',
    description: 'Configure the welcome message',
    runIn: 'GUILD_ANY',
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
})
export class WelcomeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('welcome')
                .setDescription('Configure the welcome message')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addChannelOption((opt) =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to send welcomes in')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt.setName('message').setDescription('Message ({user} = new member)').setRequired(true)
                )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const channel = interaction.options.getChannel('channel', true)
        const message = interaction.options.getString('message', true)
        await guildSettingsSchema.findOneAndUpdate(
            { guildId: interaction.guild!.id },
            { guildId: interaction.guild!.id, welcomeChannelId: channel.id, welcomeMessage: message },
            { upsert: true }
        )
        await interaction.reply({ content: await resolveKey(interaction, 'misc:welcomeSuccess', { channel: channel.id }), flags: MessageFlags.Ephemeral })
    }
}
