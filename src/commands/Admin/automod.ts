import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
} from 'discord.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'automod',
    description: 'Create a Discord AutoMod rule',
    runIn: 'GUILD_ANY',
    requiredUserPermissions: [PermissionFlagsBits.ManageGuild],
})
export class AutomodCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('automod')
                .setDescription('Create a Discord AutoMod rule')
                .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
                .addStringOption((opt) =>
                    opt
                        .setName('rule')
                        .setDescription('Which rule to create')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Block invite links', value: 'anti-invite' },
                            { name: 'Block spam', value: 'anti-spam' },
                            { name: 'Block mention spam', value: 'anti-mention' },
                            { name: 'Block custom keywords', value: 'keyword' }
                        )
                )
                .addStringOption((opt) =>
                    opt.setName('keywords').setDescription('Comma-separated words (for the keyword rule)').setRequired(false)
                )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const rule = interaction.options.getString('rule', true)
        const keywords = interaction.options.getString('keywords') ?? ''
        const guild = interaction.guild!

        const block = [{ type: AutoModerationActionType.BlockMessage }]

        try {
            let name = ''
            switch (rule) {
                case 'anti-invite':
                    name = 'PoiBot • Anti-Invite'
                    await guild.autoModerationRules.create({
                        name,
                        eventType: AutoModerationRuleEventType.MessageSend,
                        triggerType: AutoModerationRuleTriggerType.Keyword,
                        triggerMetadata: { regexPatterns: ['(discord\\.gg|discord(app)?\\.com/invite)/\\S+'] },
                        actions: block,
                        enabled: true,
                    })
                    break
                case 'anti-spam':
                    name = 'PoiBot • Anti-Spam'
                    await guild.autoModerationRules.create({
                        name,
                        eventType: AutoModerationRuleEventType.MessageSend,
                        triggerType: AutoModerationRuleTriggerType.Spam,
                        actions: block,
                        enabled: true,
                    })
                    break
                case 'anti-mention':
                    name = 'PoiBot • Anti-Mention-Spam'
                    await guild.autoModerationRules.create({
                        name,
                        eventType: AutoModerationRuleEventType.MessageSend,
                        triggerType: AutoModerationRuleTriggerType.MentionSpam,
                        triggerMetadata: { mentionTotalLimit: 8 },
                        actions: block,
                        enabled: true,
                    })
                    break
                case 'keyword': {
                    const words = keywords.split(',').map((w) => w.trim()).filter(Boolean)
                    if (!words.length) {
                        await interaction.reply(v2(await resolveKey(interaction, 'misc:automodKeywordRequired'), { ephemeral: true }))
                        return
                    }
                    name = 'PoiBot • Keyword Filter'
                    await guild.autoModerationRules.create({
                        name,
                        eventType: AutoModerationRuleEventType.MessageSend,
                        triggerType: AutoModerationRuleTriggerType.Keyword,
                        triggerMetadata: { keywordFilter: words },
                        actions: block,
                        enabled: true,
                    })
                    break
                }
            }
            await interaction.reply(await resolveKey(interaction, 'common:automodCreated', { name }))
        } catch (error) {
            this.container.logger.error('[automod] failed to create rule', error)
            await interaction.reply({ content: await resolveKey(interaction, 'common:automodFailed'), flags: MessageFlags.Ephemeral })
        }
    }
}
