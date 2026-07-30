import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, MessageFlags } from 'discord.js'
import { DAILY_REWARD } from '../../lib/economy/prices.js'
import { addSilverOnce, getSilver } from '../../lib/functions/economy.js'
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
        let claimed: any
        try {
            claimed = await dailyRewardsSchema.findOneAndUpdate(
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
        } catch (error: any) {
            // A concurrent first claim can win the unique (guild,user) upsert.
            if (error?.code !== 11000) throw error
            claimed = null
        }

        // The reservation above already moved `updatedAt`, so the next 24 hours are
        // spoken for whether or not the payout lands. Keying the credit on that
        // exact reservation timestamp means a retry after a failed payout can still
        // complete it, while a second claim inside the window finds the key already
        // applied and gets nothing.
        const reservedAt = claimed?.updatedAt ?? (await dailyRewardsSchema.findOne(obj))?.updatedAt
        if (!reservedAt) return resolveKey(ctx, 'common:dailyAlready')

        const paid = await addSilverOnce(
            guildId,
            userId,
            DAILY_REWARD,
            `daily:${guildId}:${userId}:${new Date(reservedAt).getTime()}`
        )
        if (!paid) {
            claimedCache.push(cacheKey)
            return resolveKey(ctx, 'common:dailyAlready')
        }
        claimedCache.push(cacheKey)

        const total = await getSilver(guildId, userId)
        return resolveKey(ctx, 'common:dailyClaimed', { amount: DAILY_REWARD, total })
    }
}
