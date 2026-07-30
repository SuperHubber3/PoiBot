import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonBuilder, ButtonInteraction, ButtonStyle, MessageFlags } from 'discord.js'
import { ComponentId, encodeId, isOwner, matchId } from '../lib/util/component-id.js'
import { addSilver, consumeInsurance, getSilver, spendSilver, wipeSilver } from '../lib/functions/economy.js'
import { buttonRow, v2Container, v2Update } from '../lib/util/v2.js'
import { auditLog } from '../lib/util/audit.js'
import { STEAL_CMD } from '../commands/Games/steal.js'
import {
    STEAL_BIG_WIN,
    STEAL_COST,
    STEAL_SMALL_WIN,
    STEAL_SUCC_RATE,
    STEAL_SUCC_RATE_2,
    STEAL_WIPE_ROLL,
} from '../lib/economy/prices.js'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Prompts currently being resolved, keyed by message id.
 *
 * The confirm button stays live until `interaction.update()` replaces the
 * message, so two clicks landing inside that window each charged the fee and
 * each rolled the dice — including the 1% wipe. One heist per prompt.
 */
const inFlight = new Set<string>()

export class StealHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, STEAL_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        if (id.action === 'no') {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'games:steal.cancelled'), { color: 0x95a5a6 })))
            return
        }

        // The captcha at the end of the failed-heist sequence. There is no right
        // answer — the attempt is already lost either way.
        if (id.action === 'human') {
            const key = id.arg === 'yes' ? 'games:steal.humanClaimed' : 'games:steal.humanDenied'
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, key), { color: 0xe74c3c })))
            return
        }

        // Claim the prompt before charging anything. The buttons stay clickable
        // until update() lands, so without this a fast double click paid twice
        // and rolled twice.
        const promptId = interaction.message.id
        if (inFlight.has(promptId)) {
            await interaction.deferUpdate().catch(() => {})
            return
        }
        inFlight.add(promptId)
        try {
            await this.heist(interaction, id)
        } finally {
            inFlight.delete(promptId)
        }
    }

    private async heist(interaction: ButtonInteraction, id: ComponentId) {
        const guildId = interaction.guild!.id
        // The fee was checked when the prompt was posted, which can be minutes
        // before the click — re-charge conditionally so a spent balance can't be
        // pushed negative by confirming a stale prompt.
        if ((await spendSilver(guildId, id.owner, STEAL_COST)) === null) {
            await interaction.reply({
                content: await resolveKey(interaction, 'games:steal.needSilver', { cost: STEAL_COST }),
                flags: MessageFlags.Ephemeral,
            })
            return
        }
        const answer = Math.ceil(Math.random() * 100)

        if (answer === STEAL_WIPE_ROLL) {
            // The 1% wipe. Insurance is a one-shot shield: consuming it is
            // conditional on it still being active, so it can only save once.
            const covered = await consumeInsurance(guildId, id.owner)
            const all = covered
                ? await getSilver(guildId, id.owner)
                : await wipeSilver(guildId, id.owner)

            // Audit line, carried over from the original bot.
            await auditLog(
                covered
                    ? `Sigortalı: <@!${id.owner}> Sunucu: ${guildId} Korunan: ${all}`
                    : `Batan: <@!${id.owner}> Sunucu: ${guildId} Miktar: ${all}`
            )

            const key = covered ? 'games:steal.caughtInsured' : 'games:steal.caught'
            await interaction.update(
                v2Update(v2Container(await resolveKey(interaction, key, { amount: all }), { color: covered ? 0xf1c40f : 0xe74c3c }))
            )
        } else if (answer > STEAL_SUCC_RATE_2) {
            // The fee is already charged, so the staged flavour text must not be
            // able to abort the sequence: if the prompt gets deleted mid-heist the
            // edits fail, and an unhandled throw here would leave the user paying
            // for an outcome they never see.
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'games:steal.stageTrying'), { color: 0x5865f2 })))
            await wait(2500)
            await interaction.message
                .edit(v2Update(v2Container(await resolveKey(interaction, 'games:steal.stagePackets'), { color: 0x5865f2 })))
                .catch(() => null)
            await wait(2500)
            await interaction.message
                .edit(v2Update(v2Container(await resolveKey(interaction, 'games:steal.stageTraffic'), { color: 0xf1c40f })))
                .catch(() => null)
            await wait(3000)
            // The original reacted 👍/👎 here and collected nothing — the "captcha"
            // is a troll, and the heist has already failed. Real buttons now, so the
            // click resolves instead of dying as "interaction failed".
            const humanRow = buttonRow(
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd: STEAL_CMD, owner: id.owner, action: 'human', arg: 'yes' }))
                    .setEmoji('👍')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd: STEAL_CMD, owner: id.owner, action: 'human', arg: 'no' }))
                    .setEmoji('👎')
                    .setStyle(ButtonStyle.Danger)
            )
            await interaction.message
                .edit(
                    v2Update(
                        v2Container(await resolveKey(interaction, 'games:steal.stageHuman'), { rows: [humanRow], color: 0xf1c40f })
                    )
                )
                .catch(() => null)
        } else if (answer > STEAL_SUCC_RATE) {
            const balance = await addSilver(guildId, id.owner, STEAL_SMALL_WIN)
            await interaction.update(
                v2Update(v2Container(await resolveKey(interaction, 'games:steal.smallWin', { balance }), { color: 0x2ecc71 }))
            )
        } else {
            const balance = await addSilver(guildId, id.owner, STEAL_BIG_WIN)
            await interaction.update(
                v2Update(v2Container(await resolveKey(interaction, 'games:steal.bigWin', { amount: STEAL_BIG_WIN, balance }), { color: 0x2ecc71 }))
            )
        }
    }
}
