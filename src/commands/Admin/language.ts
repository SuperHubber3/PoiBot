import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js'
import { setGuildLanguage, SUPPORTED_LANGUAGES } from '../../lib/functions/guild-language.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'language',
    description: 'Set the server language',
    runIn: 'GUILD_ANY',
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
})
export class LanguageCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('language')
                .setDescription('Set the server language')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addStringOption((opt) =>
                    opt
                        .setName('language')
                        .setDescription('Language')
                        .setRequired(true)
                        .addChoices(...SUPPORTED_LANGUAGES.map((value) => ({ name: value === 'en-US' ? 'English' : 'Türkçe', value })))
                )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const selected = interaction.options.getString('language', true)
        const language = SUPPORTED_LANGUAGES.find((value) => value === selected)
        if (!language) throw new Error('Unsupported language')
        await interaction.deferReply()
        await setGuildLanguage(interaction.guild!.id, language)
        await interaction.editReply(await resolveKey(interaction, 'common:languageSet', { language }))
    }
}
