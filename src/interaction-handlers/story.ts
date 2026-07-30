import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ButtonInteraction, MessageFlags } from 'discord.js'
import { ComponentId, isOwner, matchId } from '../lib/util/component-id.js'
import { sessions } from '../lib/util/session-store.js'
import { STORY_CMD, StorySession } from '../commands/Games/story.js'
import { STORY_SILVER_MAX, STORY_SILVER_MIN, STORY_XP_MAX, STORY_XP_MIN } from '../lib/economy/prices.js'
import { addSilver, addXP } from '../lib/functions/economy.js'
import { v2Container, v2Update } from '../lib/util/v2.js'

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

export class StoryHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button })
    }

    public override parse(interaction: ButtonInteraction) {
        const id = matchId(interaction, STORY_CMD)
        if (!id) return this.none()
        return this.some(id)
    }

    public override async run(interaction: ButtonInteraction, id: ComponentId) {
        if (!isOwner(interaction, id)) {
            await interaction.reply({ content: await resolveKey(interaction, 'common:notYourMenu'), flags: MessageFlags.Ephemeral })
            return
        }

        const session = await sessions.get<StorySession>(interaction.message.id)
        if (!session) {
            const expired = await resolveKey(interaction, 'common:menuExpired')
            await interaction.update(v2Update(v2Container(expired)))
            return
        }

        const routeIndex = Number(id.arg)
        const route = session.routes[routeIndex]
        if (!route) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        const guildId = interaction.guild!.id
        const userId = interaction.user.id
        const consumed = await sessions.take<StorySession>(interaction.message.id)
        if (!consumed) {
            await interaction.deferUpdate().catch(() => {})
            return
        }
        const consumedRoute = consumed.routes[routeIndex]
        if (!consumedRoute) {
            await interaction.update(v2Update(v2Container(await resolveKey(interaction, 'common:menuExpired'))))
            return
        }

        let rewardLine: string
        if (consumedRoute.win) {
            const xp = rand(STORY_XP_MIN, STORY_XP_MAX)
            const silver = rand(STORY_SILVER_MIN, STORY_SILVER_MAX)
            await addXP(guildId, userId, xp, interaction)
            await addSilver(guildId, userId, silver)
            rewardLine = await resolveKey(interaction, 'games:story.rewardLine', { xp, silver })
        } else {
            rewardLine = await resolveKey(interaction, 'games:story.noReward')
        }

        const title = await resolveKey(interaction, 'games:story.aiTitle')
        const container = v2Container([
            `## ${title}`,
            consumed.intro,
            `**➜ ${consumedRoute.label}**\n${consumedRoute.ending}`,
            rewardLine,
        ])
        await interaction.update(v2Update(container))
    }
}
