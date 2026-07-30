import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags } from 'discord.js'
import { DAILY_REWARD } from '../../lib/economy/prices.js'
import { addSilver } from '../../lib/functions/economy.js'
import dailyRewardsSchema from '../../lib/models/daily-rewards-schema.js'
import { guildOnly } from '../../lib/util/install-context.js'

// In-memory guard cleared every 10 minutes to avoid hammering mongo.
let claimedCache: string[] = []
const clearCache = () => {
    claimedCache = []
    setTimeout(clearCache, 1000 * 60 * 10)
}
clearCache()

@ApplyOptions<Command.Options>({
    name: 'daily',
    description: 'Claim your daily silver!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class DailyCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('daily').setDescription('Claim your daily silver!')
        )
    }

    public override async messageRun(message: Message) {
        await message.reply(await this.claim(message, message.guild!.id, message.author.id))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply({
            content: await this.claim(interaction, interaction.guild!.id, interaction.user.id),
            flags: MessageFlags.Ephemeral,
        })
    }

    private async claim(ctx: Message | ChatInputCommandInteraction, guildId: string, userId: string) {
        const cacheKey = `${guildId}-${userId}`
        if (claimedCache.includes(cacheKey)) return resolveKey(ctx, 'common:dailyAlready')

        const obj = { guildId, userId }
        const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24)
        try {
            const claimed = await dailyRewardsSchema.findOneAndUpdate(
                {
                    ...obj,
                    $or: [{ updatedAt: { $lte: cutoff } }, { updatedAt: { $exists: false } }],
                },
                {
                    $setOnInsert: obj,
                    $set: { updatedAt: new Date() },
                },
                { upsert: true, new: true }
            )
            if (!claimed) return resolveKey(ctx, 'common:dailyAlready')
        } catch (error: any) {
            // A concurrent first claim can win the unique (guild,user) upsert.
            if (error?.code === 11000) {
                claimedCache.push(cacheKey)
                return resolveKey(ctx, 'common:dailyAlready')
            }
            throw error
        }
        claimedCache.push(cacheKey)

        const total = await addSilver(guildId, userId, DAILY_REWARD)
        return resolveKey(ctx, 'common:dailyClaimed', { amount: DAILY_REWARD, total })
    }
}
