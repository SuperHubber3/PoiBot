import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { readFileSync } from 'node:fs'
import { GACHA_CONSTELLATION_MAX_REWARD } from '../economy/prices.js'
import { addSilver, addWishes, getWishes, spendWishes } from '../functions/economy.js'
import gachaSchema from '../models/gacha-schema.js'
import { isVip } from '../functions/economy.js'
import { v2 } from '../util/v2.js'
import { guildOnly } from '../util/install-context.js'

export type GachaBanner = 'standart' | 'premium' | 'limited'
export type GachaGame = 'genshin' | 'bluearchive'

export interface GachaCharacter {
    name: string
    star: number
    status: GachaBanner
}

export interface GachaCommandConfig {
    name: string
    aliases: string[]
    description: string
    game: GachaGame
    titleKey: string
    characters: readonly GachaCharacter[]
    boosted?: Partial<Record<GachaBanner, readonly GachaCharacter[]>>
}

interface PullResult extends GachaCharacter {
    constellation: number
    maxPayout: boolean
}

const BANNERS: GachaBanner[] = ['standart', 'premium', 'limited']

/**
 * What the banner picker shows. The stored values keep the original bot's
 * spelling because the roster files are keyed by it, but "standart" has no
 * business appearing in a dropdown.
 */
const BANNER_LABELS: Record<GachaBanner, string> = {
    standart: 'Standard',
    premium: 'Premium',
    limited: 'Limited',
}
const MAX_BATCH = 8
const MAX_CONSTELLATION = 6

/** Loads and validates a bundled character pool once, at module initialisation. */
export function loadGachaCharacters(fileName: string): GachaCharacter[] {
    const url = new URL(`../../../data/${fileName}`, import.meta.url)
    const parsed = JSON.parse(readFileSync(url, 'utf8')) as Record<string, Record<string, unknown>>
    return Object.entries(parsed).map(([entryKey, entry]) => {
        const star = Number(entry.star)
        const status = String(entry.status) as GachaBanner
        if (!entry.name || !Number.isFinite(star) || !BANNERS.includes(status)) {
            throw new Error(`Invalid gacha character "${String(entry.name ?? entryKey)}" (${entryKey}) in ${fileName}`)
        }
        return { name: String(entry.name), star, status }
    })
}

function randomFrom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)]
}

function rollCharacter(config: GachaCommandConfig, banner: GachaBanner): GachaCharacter | null {
    const pool = config.characters.filter((character) => character.status === banner)
    if (!pool.length) return null

    let character = randomFrom(pool)
    const boosted = config.boosted?.[banner]
    // The original used ceil(random * 2) === 1: an even 50% replacement.
    if (boosted?.length && Math.ceil(Math.random() * 2) === 1) character = randomFrom(boosted)
    return character
}

async function updateConstellation(
    guildId: string,
    userId: string,
    game: GachaGame,
    character: GachaCharacter
): Promise<PullResult> {
    await gachaSchema.updateOne(
        { guildId, userId, game },
        { $setOnInsert: { guildId, userId, game, characters: [] } },
        { upsert: true }
    )

    // Retry only handles two simultaneous first copies of the same character:
    // one inserts constellation 0, the other loops and increments it to 1.
    for (let attempt = 0; attempt < 5; attempt++) {
        const incremented = await gachaSchema.findOneAndUpdate(
            {
                guildId,
                userId,
                game,
                characters: { $elemMatch: { name: character.name, constellation: { $lt: MAX_CONSTELLATION } } },
            },
            { $inc: { 'characters.$[owned].constellation': 1 } },
            {
                new: true,
                arrayFilters: [{ 'owned.name': character.name, 'owned.constellation': { $lt: MAX_CONSTELLATION } }],
            }
        )
        if (incremented) {
            const owned = incremented.characters.find((entry: any) => entry.name === character.name)
            return { ...character, constellation: owned.constellation, maxPayout: false }
        }

        const existing = await gachaSchema.findOne(
            {
                guildId,
                userId,
                game,
                characters: { $elemMatch: { name: character.name, constellation: { $gte: MAX_CONSTELLATION } } },
            },
            { characters: { $elemMatch: { name: character.name, constellation: { $gte: MAX_CONSTELLATION } } } }
        )
        if (existing?.characters?.length) {
            await addSilver(guildId, userId, GACHA_CONSTELLATION_MAX_REWARD)
            return { ...character, constellation: MAX_CONSTELLATION, maxPayout: true }
        }

        const inserted = await gachaSchema.updateOne(
            { guildId, userId, game, characters: { $not: { $elemMatch: { name: character.name } } } },
            { $push: { characters: { ...character, constellation: 0 } } }
        )
        if ((inserted.modifiedCount ?? (inserted as any).nModified ?? 0) > 0) {
            return { ...character, constellation: 0, maxPayout: false }
        }
    }
    throw new Error(`Could not update constellation for ${character.name} after 5 attempts`)
}

async function executeGacha(
    ctx: Message | ChatInputCommandInteraction,
    user: User,
    config: GachaCommandConfig,
    rawBanner: string,
    count: number
) {
    const banner = BANNERS.includes(rawBanner as GachaBanner) ? (rawBanner as GachaBanner) : null
    if (!banner || !Number.isInteger(count) || count < 1 || count > MAX_BATCH) {
        return v2(await resolveKey(ctx, 'games:gacha.usage', { command: config.name }), { color: 0xe74c3c })
    }

    const guildId = ctx.guild!.id
    if (banner === 'premium' && !(await isVip(guildId, user.id))) {
        return v2(await resolveKey(ctx, 'games:gacha.vipOnly'), { color: 0xe74c3c })
    }

    const wishes = await getWishes(guildId, user.id)
    if (wishes < count) {
        return v2(await resolveKey(ctx, 'games:gacha.notEnoughWishes', { needed: count, wishes }), {
            color: 0xe74c3c,
        })
    }

    const rolled = Array.from({ length: count }, () => rollCharacter(config, banner))
    if (rolled.some((character) => character === null)) {
        return v2(await resolveKey(ctx, 'games:gacha.emptyBanner'), { color: 0xe74c3c })
    }

    // Reserve the whole validated batch atomically. If another command spent the
    // balance after our read, fail before granting any characters.
    const remaining = await spendWishes(guildId, user.id, count)
    if (remaining === null) {
        return v2(await resolveKey(ctx, 'games:gacha.notEnoughWishes', {
            needed: count,
            wishes: await getWishes(guildId, user.id),
        }), { color: 0xe74c3c })
    }

    const results: PullResult[] = []
    try {
        for (const character of rolled as GachaCharacter[]) {
            results.push(await updateConstellation(guildId, user.id, config.game, character))
        }
    } catch (error) {
        const unfulfilled = count - results.length
        if (unfulfilled > 0) await addWishes(guildId, user.id, unfulfilled)
        throw error
    }

    const payoutText = await resolveKey(ctx, 'games:gacha.maxPayout', {
        reward: GACHA_CONSTELLATION_MAX_REWARD,
    })
    const lines = await Promise.all(
        results.map((result, index) =>
            resolveKey(ctx, 'games:gacha.resultLine', {
                index: index + 1,
                name: result.name,
                stars: '⭐'.repeat(result.star),
                constellation: result.constellation,
                payout: result.maxPayout ? payoutText : '',
            })
        )
    )
    const allMaxed = results.every((result) => result.maxPayout)

    return v2(
        [
            `## ${await resolveKey(ctx, config.titleKey)}`,
            await resolveKey(ctx, 'games:gacha.summary', {
                banner: await resolveKey(ctx, `games:gacha.banners.${banner}`),
                count,
                wishes: remaining,
            }),
            lines.join('\n'),
            allMaxed ? await resolveKey(ctx, 'games:gacha.allMaxed') : '',
        ].filter(Boolean),
        { color: allMaxed ? 0xf1c40f : undefined }
    )
}

/** Creates both prefix and slash forms from one small game-specific config. */
export function createGachaCommand(config: GachaCommandConfig) {
    @ApplyOptions<Command.Options>({
        name: config.name,
        aliases: config.aliases,
        description: config.description,
        runIn: 'GUILD_ANY',
        cooldownDelay: 30_000,
    })
    class GachaCommand extends Command {
        public override registerApplicationCommands(registry: Command.Registry) {
            registry.registerChatInputCommand((builder) =>
                guildOnly(builder)
                    .setName(config.name)
                    .setDescription(config.description)
                    .addStringOption((option) =>
                        option
                            .setName('banner')
                            .setDescription('Banner to pull from')
                            .setRequired(true)
                            .addChoices(...BANNERS.map((banner) => ({ name: BANNER_LABELS[banner], value: banner })))
                    )
                    .addIntegerOption((option) =>
                        option
                            .setName('count')
                            .setDescription('Number of wishes')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(MAX_BATCH)
                    )
            )
        }

        public override async messageRun(message: Message, args: Args) {
            const banner = await args.pick('string').catch(() => '')
            const count = await args.pick('integer').catch(() => Number.NaN)
            await message.reply(await executeGacha(message, message.author, config, banner, count))
        }

        public override async chatInputRun(interaction: ChatInputCommandInteraction) {
            await interaction.reply(
                await executeGacha(
                    interaction,
                    interaction.user,
                    config,
                    interaction.options.getString('banner', true),
                    interaction.options.getInteger('count', true)
                )
            )
        }
    }

    return GachaCommand
}
