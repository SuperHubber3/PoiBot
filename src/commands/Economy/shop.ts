import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageComponentInteraction,
    ModalSubmitInteraction,
} from 'discord.js'
import { VIP_COST, WISH_COST } from '../../lib/economy/prices.js'
import { addSilver, addWishes, getSilver, getWishes, spendSilver } from '../../lib/functions/economy.js'
import profileSchema from '../../lib/models/profile-schema.js'
import { buttonRow, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const SHOP_CMD = 'shop'

/** Most wish tokens buyable in one go — keeps the modal input sane. */
export const MAX_WISH_PURCHASE = 100

type ShopCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction

export async function isVip(guildId: string, userId: string): Promise<boolean> {
    const doc = await profileSchema.findOne({ guildId, userId })
    return Boolean(doc?.vip)
}

/**
 * The silver shop.
 *
 * Wish tokens feed both character gachas. VIP unlocks their premium banners and
 * the cosmetic `/vipcolor` perk.
 */
export async function renderShop(ctx: ShopCtx, guildId: string, userId: string, note = '') {
    const [silver, wishes, vip] = await Promise.all([
        getSilver(guildId, userId),
        getWishes(guildId, userId),
        isVip(guildId, userId),
    ])

    const lines = [
        `## ${await resolveKey(ctx, 'common:shopTitle')}`,
        await resolveKey(ctx, 'common:shopBalance', { silver, wishes }),
        await resolveKey(ctx, 'common:shopWish', { cost: WISH_COST }),
        await resolveKey(ctx, 'common:shopVip', { cost: VIP_COST }),
        vip ? await resolveKey(ctx, 'common:shopVipOwned') : '',
        note,
    ].filter(Boolean)

    const row = buttonRow(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: SHOP_CMD, owner: userId, action: 'buy', arg: 'wish' }))
            .setEmoji('💫')
            .setLabel(await resolveKey(ctx, 'common:shopBuyWish'))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(silver < WISH_COST),
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: SHOP_CMD, owner: userId, action: 'buy', arg: 'vip' }))
            .setEmoji('👑')
            .setLabel(await resolveKey(ctx, 'common:shopBuyVip', { cost: VIP_COST }))
            .setStyle(ButtonStyle.Success)
            .setDisabled(vip || silver < VIP_COST)
    )
    return v2Container(lines, { rows: [row], color: note ? 0x2ecc71 : undefined })
}

/** Buys one wish token. Returns the note to show on the refreshed shop. */
export async function buyWish(
    ctx: ShopCtx,
    guildId: string,
    userId: string,
    amount: number
): Promise<string> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_WISH_PURCHASE) {
        return resolveKey(ctx, 'common:shopWishInvalid', { max: MAX_WISH_PURCHASE })
    }
    const total = WISH_COST * amount

    // One conditional deduct for the whole order: a partially-filled order would
    // be worse than a refused one, since you'd have paid for tokens you didn't ask
    // for. Returning null means the balance moved or was never enough.
    const silver = await spendSilver(guildId, userId, total)
    if (silver === null) {
        return resolveKey(ctx, 'common:shopNotEnough', { cost: total })
    }
    let wishes: number
    try {
        wishes = await addWishes(guildId, userId, amount)
    } catch (error) {
        await addSilver(guildId, userId, total)
        throw error
    }
    return resolveKey(ctx, 'common:shopWishBought', { amount, spent: total, silver, wishes })
}

/** Buys VIP. Returns the note to show on the refreshed shop. */
export async function buyVip(ctx: ShopCtx, guildId: string, userId: string): Promise<string> {
    if (await isVip(guildId, userId)) return resolveKey(ctx, 'common:shopAlreadyVip')
    if ((await spendSilver(guildId, userId, VIP_COST)) === null) {
        return resolveKey(ctx, 'common:shopNotEnough', { cost: VIP_COST })
    }
    try {
        const granted = await profileSchema.findOneAndUpdate(
            { guildId, userId, vip: { $ne: true } },
            { $setOnInsert: { guildId, userId }, $set: { vip: true } },
            { upsert: true, new: true }
        )
        if (!granted) {
            await addSilver(guildId, userId, VIP_COST)
            return resolveKey(ctx, 'common:shopAlreadyVip')
        }
    } catch (error: any) {
        await addSilver(guildId, userId, VIP_COST)
        if (error?.code === 11000) return resolveKey(ctx, 'common:shopAlreadyVip')
        throw error
    }
    return resolveKey(ctx, 'common:shopVipBought')
}

@ApplyOptions<Command.Options>({
    name: 'shop',
    aliases: ['buy', 'market'],
    description: 'Spend your silver',
    runIn: 'GUILD_ANY',
})
export class ShopCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('shop').setDescription('Spend your silver'))
    }

    public override async messageRun(message: Message) {
        await message.reply(v2Payload(await renderShop(message, message.guild!.id, message.author.id)))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            v2Payload(await renderShop(interaction, interaction.guild!.id, interaction.user.id))
        )
    }
}
