import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import profile from '../src/lib/models/profile-schema.js'
import waifus from '../src/lib/models/waifu-schema.js'
import marriage from '../src/lib/models/marriage-schema.js'
import sessionModel from '../src/lib/models/session-schema.js'
import { delMarry, getWishes, getXP } from '../src/lib/functions/economy.js'
import { getWaifus, resolveWaifuPrices, type OwnedWaifu } from '../src/lib/functions/waifu.js'
import { Client, Message } from 'discord.js'
import { container } from '@sapphire/framework'
import { InternationalizationHandler } from '@sapphire/plugin-i18next'
import { buyVip, buyWish } from '../src/commands/Economy/shop.js'
import { VIP_COST, WISH_COST } from '../src/lib/economy/prices.js'
import points from '../src/lib/models/points-schema.js'
import { renderTycoon } from '../src/lib/games/tycoon-ui.js'
import { settleBlackjack } from '../src/commands/Games/blackjack.js'
import { sessions } from '../src/lib/util/session-store.js'
import cooldown from '../src/lib/models/cooldown-schema.js'
import { checkCooldown, refundCooldownUse } from '../src/lib/functions/cooldown.js'
import { TradeHandler } from '../src/interaction-handlers/trade.js'
import { WaifuCommand } from '../src/commands/Waifu/waifu.js'
import { FailedAnimeIdsService } from '../src/lib/services/failed-anime-ids.service.js'

let database: MongoMemoryServer
before(async () => {
    container.i18n = new InternationalizationHandler({ defaultLanguageDirectory: new URL('../languages', import.meta.url).pathname, fetchLanguage: () => 'en-US' })
    await container.i18n.init()
    database = await MongoMemoryServer.create()
    await mongoose.connect(database.getUri())
    await Promise.all([profile.init(), waifus.init(), sessionModel.init(), marriage.init(), cooldown.init()])
})

test('a refund for a previous hour never removes a use from the current hour', async () => {
    const spent = await checkCooldown('refund-window', 'user', 'fish_catch', 2)
    assert.equal(spent.allowed, true)
    const previousHour = new Date(spent.windowStart.getTime() - 3600_000)
    assert.equal(await refundCooldownUse('refund-window', 'user', 'fish_catch', previousHour), false)
    assert.equal((await cooldown.findOne({ guildId: 'refund-window' })).count, 1)
    assert.equal(await refundCooldownUse('refund-window', 'user', 'fish_catch', spent.windowStart), true)
    assert.equal((await cooldown.findOne({ guildId: 'refund-window' })).count, 0)
    await cooldown.updateOne({ guildId: 'refund-window' }, { $set: { lastReset: new Date(spent.windowStart.getTime() + 1000), count: 1 } })
    assert.equal(await refundCooldownUse('refund-window', 'user', 'fish_catch', spent.windowStart), true)
})

test('stale trade picker clicks cannot edit an offer or overwrite an in-flight choice', async () => {
    const offer = { initiatorId: 'initiator', partnerId: 'partner', stage: 'offer' }
    await sessions.create('trade-stale', offer, { persist: true })
    const edits: unknown[] = []
    const interaction: any = {
        user: { id: 'initiator' }, guild: { id: 'trade' }, message: { id: 'trade-stale' },
        deferUpdate: async () => {}, editReply: async (payload: unknown) => edits.push(payload),
        update: async (payload: unknown) => edits.push(payload),
    }
    await TradeHandler.prototype.run.call({}, interaction, { cmd: 'trade', owner: 'initiator', action: 'page', arg: '0' })
    assert.equal(edits.length, 0)
    assert.equal((await sessions.get<any>('trade-stale')).stage, 'offer')
    await sessions.patch('trade-stale', { stage: 'mine', busy: true })
    await TradeHandler.prototype.run.call({}, interaction, { cmd: 'trade', owner: 'initiator', action: 'pick' })
    assert.equal(edits.length, 0)
    assert.equal((await sessions.get<any>('trade-stale')).busy, true)
})

test('a waifu batch refunds earlier undelivered pulls when a later roll fails', async (t) => {
    const previous = process.env.MAL_CLIENT_ID
    process.env.MAL_CLIENT_ID = 'test'
    t.after(() => { if (previous === undefined) delete process.env.MAL_CLIENT_ID; else process.env.MAL_CLIENT_ID = previous })
    let rolls = 0
    const failedIds = FailedAnimeIdsService.getInstance()
    t.mock.method(failedIds, 'initialize', async () => { if (++rolls === 2) throw new Error('Roll failed') })
    t.mock.method(failedIds, 'isFailedId', () => false)
    t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url.includes('/characters?')
        ? { data: [{ node: { id: 123, first_name: 'Test', main_picture: { medium: 'https://example.com/image.png' } } }] }
        : { mean: 8, title: 'Test anime' }))
    const ctx: any = { guild: { id: 'batch-refund' } }
    await assert.rejects((WaifuCommand.prototype as any).pull.call({ container }, ctx, 'user', 2), /Roll failed/)
    assert.equal(rolls, 2)
    assert.equal((await cooldown.findOne({ guildId: 'batch-refund', userId: 'user', command: 'waifu_pulls' })).count, 0)
    t.mock.method(failedIds, 'initialize', async () => {})
    const deliveryContext: any = {
        guild: { id: 'delivery-refund' },
        editReply: async () => { throw new Error('Discord delivery failed') },
    }
    await assert.rejects((WaifuCommand.prototype as any).pull.call({ container }, deliveryContext, 'user', 1), /Discord delivery failed/)
    assert.equal((await cooldown.findOne({ guildId: 'delivery-refund', userId: 'user', command: 'waifu_pulls' })).count, 0)
})
after(async () => { await mongoose.disconnect(); await database?.stop() })

test('concurrent balance reads do not create conflicting new profiles', async () => {
    const values = await Promise.all(Array.from({ length: 20 }, () => getWishes('guild', 'new-user')))
    assert(values.every((value) => value === 0))
    await Promise.all(Array.from({ length: 20 }, () => getXP('guild', 'new-user')))
    assert.equal(await profile.countDocuments({ guildId: 'guild', userId: 'new-user' }), 0)
})

test('legacy price backfill preserves a sale and claim racing its database write', async (t) => {
    const legacy: OwnedWaifu = { uid: 'legacy', id: 1, name: 'Old', img: null, animeId: 0, animeName: 'Old anime', claimedAt: 1, price: 0 }
    const newCard: OwnedWaifu = { ...legacy, uid: 'new', id: 2, price: 25 }
    await waifus.create({ guildId: 'guild', userId: 'collector', waifus: [legacy] })
    const find = waifus.findOne.bind(waifus)
    const update = waifus.updateOne.bind(waifus)
    let raced = false
    const concurrentSaleAndClaim = async () => {
        if (raced) return
        raced = true
        await update({ guildId: 'guild', userId: 'collector' }, { $pull: { waifus: { uid: 'legacy' } } })
        await update({ guildId: 'guild', userId: 'collector' }, { $push: { waifus: newCard } })
    }
    // Interleave real MongoDB writes at either the old read/save boundary or
    // the corrected field-update boundary.
    t.mock.method(waifus, 'findOne', async (filter: object) => {
        const stale = await find(filter)
        await concurrentSaleAndClaim()
        return stale
    })
    t.mock.method(waifus, 'updateOne', async (filter: object, change: object, options: object) => {
        await concurrentSaleAndClaim()
        return update(filter, change, options)
    })
    await resolveWaifuPrices('guild', 'collector', [legacy])
    assert.equal(raced, true)
    const stored = await find({ guildId: 'guild', userId: 'collector' })
    assert.deepEqual(stored.waifus.map((card: OwnedWaifu) => card.uid), ['new'])
    assert.equal(stored.waifus[0].price, 25)
})

test('legacy cards with an absent price get a field-only backfill', async () => {
    await waifus.create({ guildId: 'guild', userId: 'legacy-reader', waifus: [{ uid: 'legacy', id: 1, animeId: 0, claimedAt: 1 }] })
    await getWaifus('guild', 'legacy-reader')
    const stored = await waifus.findOne({ guildId: 'guild', userId: 'legacy-reader' })
    assert.equal(stored.waifus[0].price, 10)
})

test('only one caller can consume a persistent session', async () => {
    await sessions.create('single-use', { value: 1 }, { persist: true })
    const results = await Promise.all(Array.from({ length: 20 }, () => sessions.take('single-use')))
    assert.equal(results.filter(Boolean).length, 1)
})


test('concurrent shop purchases charge and grant atomically', async () => {
    const client = new Client({ intents: [] })
    const ctx = new Message(client, { id: '123456789012345678', channel_id: '123456789012345679', content: '' })
    await profile.create({ guildId: 'shop', userId: 'wish-buyer', silver: WISH_COST * 3 })
    await Promise.all(Array.from({ length: 10 }, () => buyWish(ctx, 'shop', 'wish-buyer', 1)))
    const buyer = await profile.findOne({ guildId: 'shop', userId: 'wish-buyer' })
    assert.equal(buyer.silver, 0)
    assert.equal(buyer.wishes, 3)
    await profile.create({ guildId: 'shop', userId: 'vip-buyer', silver: VIP_COST * 10 })
    await Promise.all(Array.from({ length: 10 }, () => buyVip(ctx, 'shop', 'vip-buyer')))
    const vipBuyer = await profile.findOne({ guildId: 'shop', userId: 'vip-buyer' })
    assert.equal(vipBuyer.silver, VIP_COST * 9)
    assert.equal(vipBuyer.vip, true)
    await client.destroy()
})

test('an expired read cannot delete a session renewed before cleanup', async (t) => {
    await sessionModel.create({ key: 'renewed', data: { version: 1 }, expiresAt: new Date(Date.now() - 1000) })
    const find = sessionModel.findOne.bind(sessionModel)
    t.mock.method(sessionModel, 'findOne', async (filter: object) => {
        const stale = await find(filter)
        await sessionModel.updateOne({ key: 'renewed' }, { $set: { data: { version: 2 }, expiresAt: new Date(Date.now() + 60_000) } })
        return stale
    })
    assert.equal(await sessions.get('renewed'), null)
    const renewed = await find({ key: 'renewed' })
    assert.equal(renewed.data.version, 2)
})


test('a delayed divorce cannot delete a new marriage or unrelated legacy partner', async () => {
    await marriage.create({ guildId: 'marriage', users: ['Alice', 'Charlie'] })
    await profile.create({ guildId: 'marriage', userId: 'Bob', marry: 'Dan' })
    await delMarry('marriage', 'Alice', 'Bob')
    assert(await marriage.exists({ guildId: 'marriage', users: 'Alice' }))
    assert.equal((await profile.findOne({ guildId: 'marriage', userId: 'Bob' })).marry, 'Dan')
    await delMarry('marriage', 'Alice', 'Charlie')
    assert.equal(await marriage.countDocuments({ guildId: 'marriage' }), 0)
})

test('dealer natural beats a three-card 21, while two naturals push', async (t) => {
    const client = new Client({ intents: [] })
    t.after(() => client.destroy())
    const ctx = new Message(client, { id: '123456789012345678', channel_id: '123456789012345679', content: '' })
    const cards = (...ranks: string[]) => ranks.map((rank) => ({ rank, suit: '♠' }))
    await profile.create({ guildId: 'blackjack', userId: 'player', silver: 0 })
    await settleBlackjack(ctx, 'blackjack', 'player', 'player', {
        player: cards('7', '7', '7'), dealer: cards('A', 'K'), bet: 100,
    })
    assert.equal((await profile.findOne({ guildId: 'blackjack', userId: 'player' })).silver, 0)
    await settleBlackjack(ctx, 'blackjack', 'player', 'player', {
        player: cards('A', 'Q'), dealer: cards('A', 'K'), bet: 100,
    })
    assert.equal((await profile.findOne({ guildId: 'blackjack', userId: 'player' })).silver, 100)
})

test('legacy tycoon repair preserves an upgrade bought after its initial read', async (t) => {
    const client = new Client({ intents: [] })
    t.after(() => client.destroy())
    const ctx = new Message(client, { id: '123456789012345678', channel_id: '123456789012345679', content: '' })
    await points.create({ guildId: 'tycoon-race', userId: 'player', upgrades: { speed: 0, multiply: 0 } })
    const find = points.findOneAndUpdate.bind(points)
    let raced = false
    t.mock.method(points, 'findOneAndUpdate', async (filter: object, update: object, options: object) => {
        const result = await find(filter, update, options)
        if (!raced) {
            raced = true
            await points.updateOne(filter, { $set: { 'upgrades.speed': 5 } })
        }
        return result
    })
    await renderTycoon(ctx, 'tycoon-race', 'player', 'player', 'home')
    const stored = await points.findOne({ guildId: 'tycoon-race', userId: 'player' })
    assert.equal(stored.upgrades.speed, 5)
    assert.equal(stored.upgrades.multiply, 1)
})
