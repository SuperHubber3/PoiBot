import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { AnySelectMenuInteraction, ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Container, v2Update } from '../lib/util/v2.js'
import { addSilver } from '../lib/functions/economy.js'
import { getWaifus, removeWaifusByUid, restoreWaifus } from '../lib/functions/waifu.js'
import { jumpModal, pageCount } from '../lib/waifu/picker.js'
import { renderSellPage, WAIFU_SELL_CMD } from '../commands/Waifu/sell.js'

type SellInteraction = AnySelectMenuInteraction | ButtonInteraction

/**
 * Handles the sell menu and its pager. The jump modal is submitted to
 * `waifu-jump`, which is a separate handler because modal submissions are a
 * different interaction type.
 */
export class WaifuSellHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.MessageComponent })
    }

    public override parse(interaction: SellInteraction) {
        const id = matchId(interaction, WAIFU_SELL_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: SellInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const guildId = interaction.guild!.id
        // arg carries the current page; sell attaches no extra tag.
        const page = Number(id.arg?.split('.')[0] ?? 0)

        if (id.action === 'page' && interaction.isButton()) {
            await interaction.update(v2Update(await renderSellPage(interaction, id.owner, page)))
            return
        }

        if (id.action === 'jump' && interaction.isButton()) {
            const pages = pageCount((await getWaifus(guildId, id.owner)).length)
            await interaction.showModal(
                await jumpModal(interaction, WAIFU_SELL_CMD, id.owner, String(page), pages, 'page')
            )
            return
        }

        if (id.action !== 'pick' || !interaction.isStringSelectMenu()) {
            await interaction.deferUpdate().catch(() => {})
            return
        }

        const current = await getWaifus(guildId, id.owner)
        const selected = new Set(interaction.values)
        const uids = current.filter((waifu) => selected.has(waifu.uid)).map((waifu) => waifu.uid)
        if (uids.length !== selected.size) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'waifu:listEmpty'))))
            return
        }

        const removed = await removeWaifusByUid(guildId, id.owner, uids)
        if (removed.length !== uids.length) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'waifu:listEmpty'))))
            return
        }
        const total = removed.reduce((s, w) => s + w.price, 0)
        let bal: number
        try {
            bal = await addSilver(guildId, id.owner, total)
        } catch (error) {
            await restoreWaifus(guildId, id.owner, removed)
            throw error
        }
        const text = await resolveKey(interaction, 'waifu:soldWithBalance', {
            count: removed.length,
            names: removed.map((w) => w.name).join(', '),
            total,
            balance: bal,
        })
        await interaction.update(v2Update(v2Container(text)))
    }
}
