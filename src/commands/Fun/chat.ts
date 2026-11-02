import { ApplyOptions } from '@sapphire/decorators'
import { BucketScope, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js'
import { chatSettings, REASONING_LEVELS, SERVICE_TIERS } from '../../lib/chat/settings.js'
import { BOT_OWNERS } from '../../lib/constants.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'chat', description: 'Configure this channel’s chatbot model, reasoning, and speed',
    runIn: 'GUILD_ANY', cooldownDelay: 5000, cooldownScope: BucketScope.User,
})
export class ChatCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) => guildOnly(builder)
            .setName('chat').setDescription('Configure this channel’s chatbot model, reasoning, and speed')
            .addStringOption((option) => option.setName('model')
                .setDescription('Model ID, e.g. gemini-3.8-flash or gpt-6.1-sol').setMinLength(1).setMaxLength(96))
            .addStringOption((option) => option.setName('reasoning').setDescription('Reasoning effort')
                .addChoices(...REASONING_LEVELS.map((value) => ({ name: value, value }))))
            .addStringOption((option) => option.setName('speed').setDescription('Fast requires a supported Codex model and account')
                .addChoices(...SERVICE_TIERS.map((value) => ({ name: value, value })))))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return
        await interaction.deferReply()
        const scope = `${interaction.guildId}-${interaction.channelId}`
        const model = interaction.options.getString('model')?.trim()
        const reasoning = interaction.options.getString('reasoning')
        const tier = interaction.options.getString('speed')
        const changing = model !== undefined || reasoning !== null || tier !== null
        if (changing && !BOT_OWNERS.includes(interaction.user.id)
            && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.editReply(await resolveKey(interaction, 'chat:settingsDenied'))
        }
        try {
            const settings = changing ? await chatSettings.update(scope, {
                ...(model !== undefined ? { model } : {}),
                ...(reasoning !== null ? { reasoning } : {}),
                ...(tier !== null ? { tier } : {}),
            }) : await chatSettings.read(scope)
            return interaction.editReply({ content: await resolveKey(interaction, 'chat:settings', {
                ...settings, provider: settings.model.startsWith('gemini-') ? 'Antigravity' : 'Codex',
            }), allowedMentions: { parse: [] } })
        } catch {
            return interaction.editReply(await resolveKey(interaction, 'chat:settingsFailed'))
        }
    }
}
