import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ContainerBuilder,
    Message,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
} from 'discord.js'
import {
    TYCOON_CONVERSIONS,
    TYCOON_MULTIPLY_COST,
    TYCOON_SPEED_COST,
} from '../economy/prices.js'
import pointsSchema from '../models/points-schema.js'
import { addSilver, getSilver, spendSilver } from '../functions/economy.js'
import { v2Container } from '../util/v2.js'
import { encodeId } from '../util/component-id.js'

export const TYCOON_CMD = 'tycoon'

export const SPEED_MAX = 59
export const MULTIPLY_MAX = 25

/**
 * `points` used to be a view of its own, reachable from a Home button that showed
 * the same numbers Home already displayed. It's gone; the stats block carries the
 * point balance on every screen.
 */
export type TycoonView = 'home' | 'upgrades' | 'speed' | 'multiply' | 'convert'
type I18nCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction

async function getDoc(guildId: string, userId: string) {
    const doc: any = await pointsSchema.findOneAndUpdate(
        { guildId, userId },
        { $setOnInsert: { guildId, userId, points: 0, upgrades: { speed: 0, multiply: 1 } } },
        { upsert: true, new: true }
    )
    if (!doc.upgrades || typeof doc.upgrades.speed !== 'number' ||
        typeof doc.upgrades.multiply !== 'number' || doc.upgrades.multiply < 1) {
        // Evaluate repairs against the stored values so a concurrent purchase is
        // never overwritten with the levels from this earlier read.
        return pointsSchema.findOneAndUpdate({ guildId, userId }, [{
            $set: {
                upgrades: {
                    speed: { $cond: [{ $isNumber: '$upgrades.speed' }, '$upgrades.speed', 0] },
                    multiply: { $cond: [
                        { $and: [{ $isNumber: '$upgrades.multiply' }, { $gte: ['$upgrades.multiply', 1] }] },
                        '$upgrades.multiply', 1,
                    ] },
                },
            },
        }], { new: true })
    }
    return doc
}

function btn(owner: string, action: string, arg?: string) {
    return new ButtonBuilder().setCustomId(encodeId({ cmd: TYCOON_CMD, owner, action, arg }))
}

interface PanelState {
    points: number
    silver: number
    speed: number
    multiply: number
}

async function rows(ctx: I18nCtx, owner: string, view: TycoonView, s: PanelState) {
    const home = btn(owner, 'home').setEmoji('🏠').setLabel(await resolveKey(ctx, 'games:tycoon.buttons.home')).setStyle(ButtonStyle.Secondary)
    const upgrades = btn(owner, 'upgrades').setEmoji('💪').setLabel(await resolveKey(ctx, 'games:tycoon.buttons.upgrades')).setStyle(ButtonStyle.Success)

    if (view === 'upgrades') {
        return [row(home,
            btn(owner, 'speed').setEmoji('💨').setLabel(await resolveKey(ctx, 'games:tycoon.buttons.speed')).setStyle(ButtonStyle.Primary),
            btn(owner, 'multiply').setEmoji('✖').setLabel(await resolveKey(ctx, 'games:tycoon.buttons.multiply')).setStyle(ButtonStyle.Primary))]
    }
    if (view === 'speed' || view === 'multiply') {
        const isSpeed = view === 'speed'
        const level = isSpeed ? s.speed : s.multiply
        const max = isSpeed ? SPEED_MAX : MULTIPLY_MAX
        const cost = isSpeed ? TYCOON_SPEED_COST(level) : TYCOON_MULTIPLY_COST(level)
        // Price on the button, and greyed out when it isn't actually buyable —
        // no more clicking through to find out you can't afford it.
        const buy = btn(owner, isSpeed ? 'buyspeed' : 'buymul')
            .setEmoji('⬆')
            .setLabel(await resolveKey(ctx, 'games:tycoon.buttons.upgradeFor', { cost }))
            .setStyle(ButtonStyle.Success)
            .setDisabled(level >= max || s.silver < cost)
        return [row(home, upgrades, buy)]
    }
    if (view === 'convert') {
        const tiers = TYCOON_CONVERSIONS.map((tier) =>
            btn(owner, 'conv', String(tier.points))
                .setEmoji('💰')
                .setLabel(`${tier.points.toLocaleString('en-US')} → ${tier.silver}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(s.points < tier.points))
        // Home plus the current four tiers is exactly Discord's five-per-row limit,
        // so a fifth tier added in prices.ts would be rejected at runtime, far from
        // the edit that caused it. Chunking makes the tier list free to grow.
        const [first, ...rest] = chunk([home, ...tiers], 5)
        return [row(...first), ...rest.map((group) => row(...group))]
    }
    return [row(
        upgrades,
        btn(owner, 'convert').setEmoji('♻').setLabel(await resolveKey(ctx, 'games:tycoon.buttons.convert')).setStyle(ButtonStyle.Success))]
}

function row(...buttons: ButtonBuilder[]) {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)
}

function chunk<T>(items: T[], size: number): T[][] {
    const groups: T[][] = []
    for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
    return groups.length ? groups : [[]]
}

/**
 * Stats for the current screen only.
 *
 * Every view used to print the same wall of speed *and* multiplier numbers, so
 * opening "Speed" told you nothing new. Each screen now shows the figures it is
 * actually about; the always-relevant balances stay on top.
 */
async function statsFor(ctx: I18nCtx, view: TycoonView, s: PanelState): Promise<string> {
    const rate = s.multiply * (60 / Math.max(1, 60 - s.speed))
    const balances = await resolveKey(ctx, 'games:tycoon.statsBalances', {
        points: s.points,
        silver: s.silver,
        rate: rate.toFixed(2),
    })

    if (view === 'speed') {
        return `${balances}\n${await resolveKey(ctx, 'games:tycoon.statsSpeed', {
            speed: s.speed,
            speedMax: SPEED_MAX,
            speedCost: TYCOON_SPEED_COST(s.speed),
        })}`
    }
    if (view === 'multiply') {
        return `${balances}\n${await resolveKey(ctx, 'games:tycoon.statsMultiply', {
            multiply: s.multiply,
            multiplyMax: MULTIPLY_MAX,
            multiplyCost: TYCOON_MULTIPLY_COST(s.multiply),
        })}`
    }
    if (view === 'upgrades') {
        return `${balances}\n${await resolveKey(ctx, 'games:tycoon.statsUpgrades', {
            speed: s.speed,
            speedMax: SPEED_MAX,
            multiply: s.multiply,
            multiplyMax: MULTIPLY_MAX,
        })}`
    }
    if (view === 'convert') {
        // Tiers are rendered from TYCOON_CONVERSIONS instead of being spelled out
        // in the locale files, which had drifted to values that no longer existed.
        const tiers = TYCOON_CONVERSIONS.map(
            (t) => `• **${t.points.toLocaleString('en-US')}** → **${t.silver}** 🪙`
        ).join('\n')
        return `${balances}\n${tiers}`
    }
    return balances
}

/** Builds the tycoon panel container for a given view. */
export async function renderTycoon(ctx: I18nCtx, guildId: string, userId: string, owner: string, view: TycoonView, note = ''): Promise<ContainerBuilder> {
    const doc: any = await getDoc(guildId, userId)
    const state: PanelState = {
        points: Math.floor(doc.points),
        silver: await getSilver(guildId, userId),
        speed: doc.upgrades.speed,
        multiply: doc.upgrades.multiply,
    }

    const description = await resolveKey(ctx, `games:tycoon.views.${view}`)
    const body = [
        `## ${await resolveKey(ctx, 'games:tycoon.title')}`,
        description,
        await statsFor(ctx, view, state),
        note,
    ].filter(Boolean)
    return v2Container(body, { rows: await rows(ctx, owner, view, state), color: note ? 0x5865f2 : undefined })
}

/** Applies a button action, returns the resulting view + a note string. */
export async function applyTycoonAction(ctx: I18nCtx, guildId: string, userId: string, action: string, arg?: string): Promise<{ view: TycoonView; note: string }> {
    switch (action) {
        case 'upgrades': return { view: 'upgrades', note: '' }
        case 'speed': return { view: 'speed', note: '' }
        case 'multiply': return { view: 'multiply', note: '' }
        case 'convert': return { view: 'convert', note: '' }
        case 'buyspeed': return { view: 'speed', note: await buyUpgrade(ctx, guildId, userId, 'speed') }
        case 'buymul': return { view: 'multiply', note: await buyUpgrade(ctx, guildId, userId, 'multiply') }
        case 'conv': {
            const points = Number(arg)
            return {
                view: 'convert',
                note: Number.isFinite(points)
                    ? await convert(ctx, guildId, userId, points)
                    : await resolveKey(ctx, 'games:tycoon.insufficientPoints'),
            }
        }
        default: return { view: 'home', note: '' }
    }
}

async function buyUpgrade(ctx: I18nCtx, guildId: string, userId: string, type: 'speed' | 'multiply') {
    const doc: any = await getDoc(guildId, userId)
    const level = doc.upgrades[type]
    const max = type === 'speed' ? SPEED_MAX : MULTIPLY_MAX
    const cost = type === 'speed' ? TYCOON_SPEED_COST(level) : TYCOON_MULTIPLY_COST(level)
    if (level >= max) return resolveKey(ctx, 'games:tycoon.maxLevel')
    if ((await spendSilver(guildId, userId, cost)) === null) {
        return resolveKey(ctx, 'games:tycoon.insufficientSilver')
    }
    try {
        const updated = await pointsSchema.findOneAndUpdate(
            { guildId, userId, [`upgrades.${type}`]: level },
            { $inc: { [`upgrades.${type}`]: 1 } },
            { new: true }
        )
        if (!updated) {
            await addSilver(guildId, userId, cost)
            return resolveKey(ctx, 'games:tycoon.retry')
        }
    } catch (error) {
        await addSilver(guildId, userId, cost)
        throw error
    }
    return resolveKey(ctx, type === 'speed' ? 'games:tycoon.speedSuccess' : 'games:tycoon.multiplySuccess', { level: level + 1 })
}

async function convert(ctx: I18nCtx, guildId: string, userId: string, points: number) {
    const tier = TYCOON_CONVERSIONS.find((t) => t.points === points)
    if (!tier) return resolveKey(ctx, 'games:tycoon.insufficientPoints')
    const deducted = await pointsSchema.findOneAndUpdate(
        { guildId, userId, points: { $gte: tier.points } },
        { $inc: { points: -tier.points } },
        { new: true }
    )
    if (!deducted) return resolveKey(ctx, 'games:tycoon.insufficientPoints')
    let silver: number
    try {
        silver = await addSilver(guildId, userId, tier.silver)
    } catch (error) {
        await pointsSchema.updateOne({ guildId, userId }, { $inc: { points: tier.points } })
        throw error
    }
    return resolveKey(ctx, 'games:tycoon.convertSuccess', { silver })
}
