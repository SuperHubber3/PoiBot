import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, Message, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { v2Update } from '../lib/util/v2.js'
import { checkCooldown, refundCooldownUse } from '../lib/functions/cooldown.js'
import { addWaifu } from '../lib/functions/waifu.js'
import { CLAIM_KEY, DEFAULT_CLAIM_LIMIT, renderWaifuPull, WaifuPullSession } from '../lib/waifu/pull.js'
import { renderWaifuSummary, WAIFU_SUMMARY_CMD, WaifuSummarySession } from '../commands/Waifu/waifu.js'

/**
 * "Claim All" on a multi-roll summary.
 *
 * Claims as many still-open cards as the initiator has hourly claims left for,
 * in roll order, then closes each claimed card and refreshes the tally. Running
 * out of claims part-way is normal, not an error — you keep what you got.
 */
export class WaifuSummaryHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, WAIFU_SUMMARY_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:notYourMenu'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        const summary = await sessions.acquire<WaifuSummarySession>(interaction.message.id)
        if (!summary) {
            await interaction.reply({
                content: await resolveKey(interaction, 'waifu:pullBusy'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        // The lease is already held. A rejected ack would otherwise skip the
        // `busy: false` cleanup below and wedge every later Claim All click on
        // the "already working" response.
        try {
            await interaction.deferUpdate()
        } catch (error) {
            await sessions.patch<WaifuSummarySession>(interaction.message.id, { busy: false })
            throw error
        }
        const guildId = interaction.guild!.id
        const userId = summary.initiatorId
        let claimed = 0

        try {
            for (const entry of summary.entries) {
                if (entry.state !== 'open') continue

                const status = await checkCooldown(guildId, userId, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, false)
                if (!status.allowed) break

                const card = await sessions.get<WaifuPullSession>(entry.messageId)
                if (!card || card.resolved) {
                    entry.state = 'unavailable'
                    await sessions.patchSummaryEntry<WaifuSummarySession>(
                        interaction.message.id,
                        entry.messageId,
                        'unavailable'
                    )
                    continue
                }

                const lockedCard = await sessions.acquire<WaifuPullSession>(entry.messageId)
                if (!lockedCard) continue
                const consumed = await checkCooldown(guildId, userId, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, true)
                if (!consumed.allowed) {
                    await sessions.patch<WaifuPullSession>(entry.messageId, { busy: false })
                    break
                }
                try {
                    await addWaifu(
                        guildId,
                        userId,
                        lockedCard.character,
                        `waifu-claim:${entry.messageId}:${userId}`
                    )
                } catch (error) {
                    await refundCooldownUse(guildId, userId, CLAIM_KEY, consumed.windowStart).catch(() => false)
                    await sessions.patch<WaifuPullSession>(entry.messageId, { busy: false })
                    throw error
                }
                await sessions.patch<WaifuPullSession>(
                    entry.messageId,
                    { resolved: true, busy: false }
                )
                entry.state = 'claimed'
                await sessions.patchSummaryEntry<WaifuSummarySession>(
                    interaction.message.id,
                    entry.messageId,
                    'claimed'
                )
                claimed++

                // Close the card itself so its buttons can't be used afterwards.
                try {
                    const msg = (await interaction.channel?.messages.fetch(entry.messageId)) as Message | undefined
                    if (msg) {
                        const note = await resolveKey(interaction, 'waifu:claimedBy', {
                            name: lockedCard.character.name,
                            user: `<@${userId}>`,
                        })
                        await msg.edit(v2Update(await renderWaifuPull(interaction, lockedCard.character, undefined, note)))
                    }
                } catch {
                    /* card message gone; the claim still stands */
                }
            }
        } catch (error) {
            await sessions.patch<WaifuSummarySession>(interaction.message.id, { busy: false })
            throw error
        }

        const latest = await sessions.patch<WaifuSummarySession>(
            interaction.message.id,
            { busy: false }
        )
        if (latest) {
            await interaction.message.edit(v2Update(await renderWaifuSummary(interaction, latest)))
        }

        if (claimed === 0) {
            await interaction.followUp({
                content: await resolveKey(interaction, 'waifu:noClaimsLeft'),
                flags: MessageFlags.Ephemeral,
            })
        }
    }
}
