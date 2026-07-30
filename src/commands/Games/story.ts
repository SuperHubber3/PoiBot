import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    User,
} from 'discord.js'
import storyRunSchema from '../../lib/models/story-run-schema.js'
import { generateStory, StoryData } from '../../lib/services/story.service.js'
import { getGuildLanguage } from '../../lib/functions/guild-language.js'
import { sessions } from '../../lib/util/session-store.js'
import { encodeId } from '../../lib/util/component-id.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const STORY_CMD = 'story'

/** Session payload stored per story message (in-memory, 15min default TTL). */
export interface StorySession {
    routes: StoryData['routes']
    intro: string
}

@ApplyOptions<Command.Options>({
    name: 'story',
    description: 'Play a short AI-generated story for XP and silver (once a day)',
    runIn: 'GUILD_ANY',
    cooldownDelay: 2000,
})
export class StoryCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('story').setDescription('Play a short AI-generated story'))
    }

    public override async messageRun(message: Message) {
        await this.start(message, message.author)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        await this.start(interaction, interaction.user)
    }

    private async start(ctx: Message | ChatInputCommandInteraction, user: User) {
        const guildId = ctx.guild!.id

        // Reserve today's attempt before generating or publishing a panel. The
        // unique guild/user index turns concurrent first-use upserts into one
        // winner and a duplicate-key loser.
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        let reserved = null
        try {
            reserved = await storyRunSchema.findOneAndUpdate(
                {
                    guildId,
                    userId: user.id,
                    $or: [
                        { lastCompleted: { $lt: today } },
                        { lastCompleted: { $exists: false } },
                        { lastCompleted: null },
                    ],
                },
                {
                    $setOnInsert: { guildId, userId: user.id },
                    $set: { lastCompleted: now },
                },
                { upsert: true, new: true }
            )
        } catch (error: any) {
            if (error?.code !== 11000) throw error
        }
        if (!reserved) {
            const text = await resolveKey(ctx, 'games:story.onCooldown')
            return void (ctx instanceof Message ? ctx.reply(v2(text)) : ctx.editReply(v2(text)))
        }

        try {
            const language = await getGuildLanguage(guildId)
            const story = await generateStory(language)

            const rows = this.buildRows(user.id, story)
            const title = await resolveKey(ctx, 'games:story.aiTitle')
            const container = v2Container([`## ${title}`, story.intro], { rows })
            const payload = v2Payload(container)

            const msg =
                ctx instanceof Message ? await ctx.reply(payload) : ((await ctx.editReply(payload)) as Message)

            // Store the generated routes so the button handler can resolve the pick.
            // Persisted: a lost session would burn the player's attempt for the day.
            await sessions.create<StorySession>(
                msg.id,
                { routes: story.routes, intro: story.intro },
                { persist: true }
            )
        } catch (error) {
            // Only release the reservation made by this invocation. If a newer
            // reservation somehow replaced it, its timestamp must remain intact.
            await storyRunSchema.updateOne(
                { guildId, userId: user.id, lastCompleted: now },
                { $unset: { lastCompleted: '' } }
            ).catch(() => {})
            throw error
        }
    }

    private buildRows(owner: string, story: StoryData): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
        const buttons = story.routes.map((route, i) =>
            new ButtonBuilder()
                .setCustomId(encodeId({ cmd: STORY_CMD, owner, action: 'pick', arg: String(i) }))
                .setLabel(route.label.slice(0, 80))
                .setStyle(ButtonStyle.Primary)
        )
        return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)]
    }
}
