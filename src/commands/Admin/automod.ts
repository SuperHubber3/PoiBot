import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    AutoModerationActionType,
    AutoModerationRuleEventType,
    AutoModerationRuleTriggerType,
    ChatInputCommandInteraction,
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

        let payload: {
            name: string
            eventType: AutoModerationRuleEventType
            triggerType: AutoModerationRuleTriggerType
            triggerMetadata?: Record<string, unknown>
            actions: typeof block
            enabled: boolean
        } | null = null

        switch (rule) {
            case 'anti-invite':
                payload = {
                    name: 'PoiBot • Anti-Invite',
                    eventType: AutoModerationRuleEventType.MessageSend,
                    triggerType: AutoModerationRuleTriggerType.Keyword,
                    triggerMetadata: { regexPatterns: ['(discord\\.gg|discord(app)?\\.com/invite)/\\S+'] },
                    actions: block,
                    enabled: true,
                }
                break
            case 'anti-spam':
                payload = {
                    name: 'PoiBot • Anti-Spam',
                    eventType: AutoModerationRuleEventType.MessageSend,
                    triggerType: AutoModerationRuleTriggerType.Spam,
                    actions: block,
                    enabled: true,
                }
                break
            case 'anti-mention':
                payload = {
                    name: 'PoiBot • Anti-Mention-Spam',
                    eventType: AutoModerationRuleEventType.MessageSend,
                    triggerType: AutoModerationRuleTriggerType.MentionSpam,
                    triggerMetadata: { mentionTotalLimit: 8 },
                    actions: block,
                    enabled: true,
                }
                break
            case 'keyword': {
                const words = keywords.split(',').map((w) => w.trim()).filter(Boolean)
                if (!words.length) {
                    await interaction.reply(v2(await resolveKey(interaction, 'misc:automodKeywordRequired'), { ephemeral: true }))
                    return
                }
                payload = {
                    name: 'PoiBot • Keyword Filter',
                    eventType: AutoModerationRuleEventType.MessageSend,
                    triggerType: AutoModerationRuleTriggerType.Keyword,
                    triggerMetadata: { keywordFilter: words },
                    actions: block,
                    enabled: true,
                }
                break
            }
        }
        if (!payload) return
        await interaction.deferReply()

        try {
            // Re-running /automod for a rule that already exists used to either
            // stack a duplicate (keyword) or hit Discord's one-per-trigger-type
            // cap and fail (spam, mention, invite). Update ours in place instead.
            const existing = (await guild.autoModerationRules.fetch()).find(
                (candidate) => candidate.name === payload!.name
            )
            if (existing) {
                await existing.edit(payload as any)
            } else {
                await guild.autoModerationRules.create(payload as any)
            }
            await interaction.editReply(await resolveKey(interaction, 'common:automodCreated', { name: payload.name }))
        } catch (error) {
            this.container.logger.error('[automod] failed to create rule', error)
            await interaction.editReply({ content: await resolveKey(interaction, 'common:automodFailed') })
        }
    }
}
