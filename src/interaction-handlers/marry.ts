import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { MARRY_CMD } from '../commands/Fun/marry.js'
import { marryUsers } from '../lib/functions/economy.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { v2Container, v2Update } from '../lib/util/v2.js'

export class MarryHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, MARRY_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const authorId = id.arg
        if (!authorId || !interaction.guild) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        if (id.action === 'yes') {
            const married = await marryUsers(interaction.guild.id, authorId, id.owner)
            if (!married) {
                await interaction.update(
                    v2Update(v2Container(await resolveKey(interaction, 'fun:marryChanged')))
                )
                return
            }
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'fun:marryAccepted', {
                author: `<@${authorId}>`,
                target: `<@${id.owner}>`,
            }))))
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    content: await resolveKey(interaction, 'fun:marryParty'),
                    allowedMentions: { parse: [] },
                })
            }
            return
        }

        if (id.action === 'no') {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'fun:marryRejected'))))
            if (interaction.channel?.isSendable()) {
                await interaction.channel.send({
                    content: await resolveKey(interaction, 'fun:marrySad'),
                    allowedMentions: { parse: [] },
                })
            }
        }
    }
}
