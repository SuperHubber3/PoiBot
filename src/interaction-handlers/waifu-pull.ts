import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, Message, MessageFlags } from 'discord.js'
import { ComponentId, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { v2Container, v2Update } from '../lib/util/v2.js'
import { checkCooldown, refundCooldownUse } from '../lib/functions/cooldown.js'
import { addSilver, getSilver, spendSilver } from '../lib/functions/economy.js'
import { addWaifu, blacklistWaifu, getSeenCharacterIds } from '../lib/functions/waifu.js'
import { rollCharacter, rollCharacterFromAnime } from '../lib/services/mal.service.js'
import {
    CLAIM_KEY,
    DEFAULT_CLAIM_LIMIT,
    initiatorProtected,
    renderWaifuPull,
    SKIP_COST,
    waifuPullActionRow,
    WAIFU_PULL_CMD,
    WaifuPullSession,
} from '../lib/waifu/pull.js'
import { renderWaifuSummary, WaifuSummarySession } from '../commands/Waifu/waifu.js'

export class WaifuPullHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, WAIFU_PULL_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        const session = await sessions.get<WaifuPullSession>(interaction.message.id)
        if (!session) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }
        // `resolved` closes the card; `busy` covers the window while a slow action
        // (skip re-rolls against the MAL API and can take seconds) is still running.
        // Without this, hammering Skip charged the fee once per click.
        if (session.resolved || session.busy) {
            await interaction.reply({
                content: await resolveKey(interaction, session.busy ? 'waifu:pullBusy' : 'waifu:alreadyResolved'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        const guildId = interaction.guild!.id
        const clicker = interaction.user.id
        const initiator = session.initiatorId
        const isInitiator = clicker === initiator

        // Skip and quick-sell are the initiator's alone — the original never let a
        // bystander spend someone else's silver or throw their pull away.
        if ((id.action === 'skip' || id.action === 'sell') && !isInitiator) {
            await interaction.reply({
                content: await resolveKey(interaction, 'waifu:initiatorOnly'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        if (id.action === 'claim') return this.claim(interaction, session, isInitiator)
        if (id.action === 'sell') return this.sell(interaction, session)
        return this.skip(interaction, session)
    }

    /**
     * Claiming: the clicker needs a claim of their own, and while the initiator
     * still has claims left the card is reserved for them. Once the initiator runs
     * out, anyone else holding a claim may take it.
     */
    private async claim(interaction: ButtonInteraction, session: WaifuPullSession, isInitiator: boolean) {
        const guildId = interaction.guild!.id
        const clicker = interaction.user.id

        // A forced card is a gift from the bot owner: it costs no claim and has no
        // protection window, but only its recipient may take it.
        if (session.force) {
            if (!isInitiator) {
                await interaction.reply({
                    content: await resolveKey(interaction, 'waifu:forceNotYours'),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }
        } else {
            const own = await checkCooldown(guildId, clicker, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, false)
            if (!own.allowed) {
                await interaction.reply({
                    content: await resolveKey(interaction, 'waifu:noClaims', {
                        used: own.currentCount,
                        limit: own.limit,
                    }),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }

            if (!isInitiator && (await initiatorProtected(guildId, session.initiatorId))) {
                await interaction.reply({
                    content: await resolveKey(interaction, 'waifu:pullIsProtected'),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }

        }
        const locked = await sessions.acquire<WaifuPullSession>(interaction.message.id)
        if (!locked) return this.busy(interaction)
        let consumedClaim = false
        try {
            if (!session.force) {
                const consumed = await checkCooldown(guildId, clicker, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, true)
                if (!consumed.allowed) {
                    await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
                    await interaction.reply({
                        content: await resolveKey(interaction, 'waifu:noClaims', {
                            used: consumed.currentCount,
                            limit: consumed.limit,
                        }),
                        flags: MessageFlags.Ephemeral,
                    })
                    return
                }
                consumedClaim = true
            }
            await addWaifu(
                guildId,
                clicker,
                locked.character,
                `waifu-claim:${interaction.message.id}:${clicker}`
            )
        } catch (error) {
            if (consumedClaim) {
                await refundCooldownUse(guildId, clicker, CLAIM_KEY).catch(() => false)
            }
            await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
            throw error
        }

        const note = await resolveKey(interaction, 'waifu:claimedBy', {
            name: locked.character.name,
            user: `<@${clicker}>`,
        })
        await this.finish(interaction, locked, note, 'claimed')
    }

    /** Quick-sell costs one of the initiator's hourly claims, as it always did. */
    private async sell(interaction: ButtonInteraction, session: WaifuPullSession) {
        const guildId = interaction.guild!.id
        const userId = interaction.user.id

        // Forced cards cost no claim to sell either — see claim() above.
        if (!session.force) {
            const status = await checkCooldown(guildId, userId, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, false)
            if (!status.allowed) {
                await interaction.reply({
                    content: await resolveKey(interaction, 'waifu:noClaimsToSell'),
                    flags: MessageFlags.Ephemeral,
                })
                return
            }
        }
        const locked = await sessions.acquire<WaifuPullSession>(interaction.message.id)
        if (!locked) return this.busy(interaction)
        let consumedClaim = false
        let balance: number
        try {
            if (!session.force) {
                const consumed = await checkCooldown(guildId, userId, CLAIM_KEY, DEFAULT_CLAIM_LIMIT, true)
                if (!consumed.allowed) {
                    await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
                    await interaction.reply({
                        content: await resolveKey(interaction, 'waifu:noClaimsToSell'),
                        flags: MessageFlags.Ephemeral,
                    })
                    return
                }
                consumedClaim = true
            }
            balance = await addSilver(guildId, userId, locked.character.price)
        } catch (error) {
            // Quick-sell costs a claim just like keeping the card does, so a failed
            // payout has to hand it back — otherwise a DB blip burns one of the
            // hourly claims for nothing. Same compensation claim() already does.
            if (consumedClaim) {
                await refundCooldownUse(guildId, userId, CLAIM_KEY).catch(() => false)
            }
            await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
            throw error
        }
        const note = await resolveKey(interaction, 'waifu:soldWithBalance', {
            count: 1,
            names: locked.character.name,
            total: locked.character.price,
            balance,
        })
        await this.finish(interaction, locked, note, 'sold')
    }

    /**
     * Skip: pay the fee, blacklist the character so it never comes up again, and
     * roll a replacement — preferring the same anime, as the original did. The
     * card stays live with the new character rather than the pull just ending.
     */
    private async skip(interaction: ButtonInteraction, session: WaifuPullSession) {
        const guildId = interaction.guild!.id
        const userId = interaction.user.id

        const locked = await sessions.acquire<WaifuPullSession>(interaction.message.id)
        if (!locked) return this.busy(interaction)

        if ((await spendSilver(guildId, userId, SKIP_COST)) === null) {
            await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
            await interaction.reply({
                content: await resolveKey(interaction, 'waifu:skipNotEnough', {
                    cost: SKIP_COST,
                    balance: await getSilver(guildId, userId),
                }),
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        await interaction.deferUpdate()
        let replacement
        try {
            const seen = await getSeenCharacterIds(guildId, userId)
            seen.add(locked.character.id)
            const sameAnime = await rollCharacterFromAnime(
                locked.animeId ?? locked.character.animeId,
                seen
            )
            replacement = sameAnime ?? (locked.force ? null : await rollCharacter(seen))
            if (!replacement) throw new Error('No replacement waifu was available')
            await blacklistWaifu(
                guildId,
                userId,
                locked.character,
                `waifu-skip:${interaction.message.id}:${userId}:${locked.character.id}`
            )
        } catch (error) {
            await addSilver(guildId, userId, SKIP_COST).catch(() => 0)
            await sessions.patch<WaifuPullSession>(interaction.message.id, { busy: false })
            await interaction.followUp({
                content: await resolveKey(interaction, 'waifu:skipFailed'),
                flags: MessageFlags.Ephemeral,
            })
            this.container.logger.warn('[waifu] skip failed', error)
            return
        }

        const next: WaifuPullSession = { ...locked, character: replacement, busy: false }
        await sessions.create<WaifuPullSession>(interaction.message.id, next, { persist: true })

        const protectedPull = locked.force ? undefined : await initiatorProtected(guildId, locked.initiatorId)
        const row = await waifuPullActionRow(interaction, locked.initiatorId, replacement)
        const note = await resolveKey(interaction, 'waifu:skippedFor', {
            old: locked.character.name,
            cost: SKIP_COST,
        })
        await interaction.message.edit(
            v2Update(await renderWaifuPull(interaction, replacement, row, note, protectedPull))
        )
    }

    /** Closes a card out and refreshes its multi-roll summary, if any. */
    private async finish(
        interaction: ButtonInteraction,
        session: WaifuPullSession,
        note: string,
        state: 'claimed' | 'sold'
    ) {
        await sessions.patch<WaifuPullSession>(
            interaction.message.id,
            { resolved: true, busy: false }
        )
        await interaction.update(v2Update(await renderWaifuPull(interaction, session.character, undefined, note)))
        await this.updateSummary(interaction, session, state)
    }

    private async updateSummary(
        interaction: ButtonInteraction,
        session: WaifuPullSession,
        state: 'claimed' | 'sold' | 'skipped'
    ) {
        if (!session.summaryId) return
        const summary = await sessions.patchSummaryEntry<WaifuSummarySession>(
            session.summaryId,
            interaction.message.id,
            state
        )
        if (!summary) return

        try {
            const msg = (await interaction.channel?.messages.fetch(session.summaryId)) as Message | undefined
            if (msg) await msg.edit(v2Update(await renderWaifuSummary(interaction, summary)))
        } catch {
            /* summary deleted — the cards still work on their own */
        }
    }

    private async busy(interaction: ButtonInteraction) {
        await interaction.reply({
            content: await resolveKey(interaction, 'waifu:pullBusy'),
            flags: MessageFlags.Ephemeral,
        })
    }
}
