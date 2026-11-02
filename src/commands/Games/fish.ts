import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { FISH_SILVER_PER_CM } from '../../lib/economy/prices.js'
import { addSilver } from '../../lib/functions/economy.js'
import { checkCooldown, refundCooldownUse } from '../../lib/functions/cooldown.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

interface Rarity {
    key: string
    minCm: number
    maxCm: number
    color: number
    emoji: string
    weight: number
}

const RARITIES: Rarity[] = [
    { key: 'common', minCm: 0, maxCm: 24, color: 0x95a5a6, emoji: '🐟', weight: 50 },
    { key: 'uncommon', minCm: 25, maxCm: 49, color: 0x2ecc71, emoji: '🐠', weight: 25 },
    { key: 'rare', minCm: 50, maxCm: 74, color: 0x3498db, emoji: '🐡', weight: 15 },
    { key: 'epic', minCm: 75, maxCm: 99, color: 0x9b59b6, emoji: '🐙', weight: 7 },
    { key: 'legendary', minCm: 100, maxCm: 199, color: 0xf1c40f, emoji: '🦑', weight: 2 },
    { key: 'mythic', minCm: 200, maxCm: 500, color: 0xe74c3c, emoji: '🐳', weight: 1 },
]

function rollRarity(): Rarity {
    const total = RARITIES.reduce((s, r) => s + r.weight, 0)
    let roll = Math.random() * total
    for (const r of RARITIES) {
        if (roll < r.weight) return r
        roll -= r.weight
    }
    return RARITIES[0]
}

@ApplyOptions<Command.Options>({
    name: 'fish',
    description: 'Catch fish and sell them for silver (once per hour)',
    runIn: 'GUILD_ANY',
})
export class FishCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('fish').setDescription('Catch fish and sell them for silver'))
    }

    public override async messageRun(message: Message) {
        await message.reply(await this.fish(message, message.guild!.id, message.author))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(await this.fish(interaction, interaction.guild!.id, interaction.user))
    }

    private async fish(ctx: Message | ChatInputCommandInteraction, guildId: string, user: User) {
        const cd = await checkCooldown(guildId, user.id, 'fish_catch', 1)
        if (!cd.allowed) {
            const minutesLeft = Math.ceil((new Date().setMinutes(0, 0, 0) + 3600_000 - Date.now()) / 60000)
            return v2(await resolveKey(ctx, 'games:fish.cooldown', { minutes: minutesLeft }), { color: 0xe74c3c })
        }

        const count = Math.floor(Math.random() * 6)
        if (count === 0) {
            return v2(
                [
                    await resolveKey(ctx, 'games:fish.tripTitle', { user: user.username }),
                    await resolveKey(ctx, 'games:fish.nothing'),
                ],
                { color: 0x34495e, thumbnail: user.displayAvatarURL() }
            )
        }

        const caught = Array.from({ length: count }, () => {
            const rarity = rollRarity()
            const length = parseFloat((Math.random() * (rarity.maxCm - rarity.minCm) + rarity.minCm).toFixed(1))
            return { rarity, length, price: Math.max(1, Math.round(length * FISH_SILVER_PER_CM)) }
        })

        const total = caught.reduce((s, f) => s + f.price, 0)
        // The hourly attempt was already consumed above. If the payout write dies
        // the user would be locked out for the hour with nothing to show for it,
        // so hand the attempt back before the error propagates.
        let newBalance: number
        try {
            newBalance = await addSilver(guildId, user.id, total)
        } catch (error) {
            await refundCooldownUse(guildId, user.id, 'fish_catch', cd.windowStart).catch(() => false)
            throw error
        }
        const rarest = caught.reduce((a, b) => (b.rarity.weight < a.rarity.weight ? b : a))
        const lines = await Promise.all(
            caught.map(async (f) =>
                resolveKey(ctx, 'games:fish.caughtLine', {
                    emoji: f.rarity.emoji,
                    rarity: await resolveKey(ctx, `games:fish.rarities.${f.rarity.key}`),
                    length: f.length,
                    price: f.price,
                })
            )
        )

        return v2(
            [
                await resolveKey(ctx, 'games:fish.tripTitle', { user: user.username }),
                await resolveKey(ctx, 'games:fish.caughtTitle', { count }),
                `${lines.join('\n')}\n\n${await resolveKey(ctx, 'games:fish.total', { total, balance: newBalance })}`,
            ],
            { color: rarest.rarity.color, thumbnail: user.displayAvatarURL() }
        )
    }
}
