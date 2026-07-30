import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { AnySelectMenuInteraction, MessageFlags } from 'discord.js'
import { BIRTHDAY_CMD, formatBirthday, renderBirthday } from '../commands/Profiles/set-birthday.js'
import { setBd } from '../lib/functions/counters.js'
import { getGuildLanguage } from '../lib/functions/guild-language.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Update } from '../lib/util/v2.js'

/**
 * Month, then day.
 *
 * This replaced a message collector that asked people to type `DD/MM` into chat,
 * deleted their message, and gave them 45 seconds and two attempts before giving
 * up. Two menus can't be mistyped, can't time out, and survive a restart.
 */
export class BirthdayHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.SelectMenu })
    }

    public override parse(interaction: AnySelectMenuInteraction) {
        const id = matchId(interaction, BIRTHDAY_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: AnySelectMenuInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({
                content: await resolveKey(interaction, 'common:notYourMenu'),
                flags: MessageFlags.Ephemeral,
            })
            return
        }
        if (!interaction.isStringSelectMenu()) return

        const guildId = interaction.guild!.id
        const picked = Number(interaction.values[0])
        if (!Number.isInteger(picked)) return

        if (id.action === 'month') {
            await interaction.update(
                v2Update(await renderBirthday(interaction, guildId, interaction.user, picked))
            )
            return
        }

        if (id.action !== 'day') return

        // arg is `month.chunk`; the chunk index exists only to keep the two day
        // menus' customIds distinct.
        const month = Number(id.arg?.split('.')[0])
        if (!Number.isInteger(month)) return

        const date = new Date(2000, month, picked)
        await setBd(guildId, id.owner, date)

        const locale = await getGuildLanguage(guildId)
        const note = await resolveKey(interaction, 'counter:birthdaySet', {
            date: formatBirthday(locale, date),
        })
        await interaction.update(
            v2Update(await renderBirthday(interaction, guildId, interaction.user, month, note))
        )
    }
}
