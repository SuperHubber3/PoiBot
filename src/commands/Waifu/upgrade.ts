import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageComponentInteraction,
} from 'discord.js'
import { WAIFU_CLAIMS_UPGRADE_BASE, WAIFU_PULLS_UPGRADE_BASE } from '../../lib/economy/prices.js'
import { addSilver, getSilver, spendSilver } from '../../lib/functions/economy.js'
import userCommandUpgradeSchema from '../../lib/models/user-command-upgrade-schema.js'
import { buttonRow, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'
import { DEFAULT_CLAIM_LIMIT, DEFAULT_PULL_LIMIT } from '../../lib/waifu/pull.js'

export const UPGRADE_CMD = 'wupg'

export type UpgradeType = 'pulls' | 'claims'

// commandKey -> { base cost, base hourly limit }
export const UPGRADES: Record<UpgradeType, { key: string; base: number; baseLimit: number; labelKey: string }> = {
    pulls: { key: 'waifu_pulls', base: WAIFU_PULLS_UPGRADE_BASE, baseLimit: DEFAULT_PULL_LIMIT, labelKey: 'upgradeLabelPulls' },
    claims: { key: 'waifu_claims', base: WAIFU_CLAIMS_UPGRADE_BASE, baseLimit: DEFAULT_CLAIM_LIMIT, labelKey: 'upgradeLabelClaims' },
}

type UpgradeCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction

interface UpgradeStatus {
    level: number
    cost: number
    limit: number
}

async function statusOf(guildId: string, userId: string, type: UpgradeType): Promise<UpgradeStatus> {
    const cfg = UPGRADES[type]
    const record = await userCommandUpgradeSchema.findOne({ guildId, userId, commandKey: cfg.key })
    const level = record?.upgradeLevel ?? 0
    return { level, cost: cfg.base * 2 ** level, limit: cfg.baseLimit + level }
}

/**
 * The upgrade shop.
 *
 * This used to be `/upgrade type:<pulls|claims>`, which told you nothing: you had
 * to already know what the next level cost, what limit you were on, and whether
 * you could afford it — and you found out by spending. Both tracks are now shown
 * side by side with their level, next price and a button that greys out when you
 * can't afford it.
 */
export async function renderUpgrade(ctx: UpgradeCtx, guildId: string, userId: string, note = '') {
    const [pulls, claims, silver] = await Promise.all([
        statusOf(guildId, userId, 'pulls'),
        statusOf(guildId, userId, 'claims'),
        getSilver(guildId, userId),
    ])

    const row = async (type: UpgradeType, s: UpgradeStatus) =>
        resolveKey(ctx, 'waifu:upgradeRow', {
            label: await resolveKey(ctx, `waifu:${UPGRADES[type].labelKey}`),
            level: s.level,
            limit: s.limit,
            next: s.limit + 1,
            cost: s.cost,
        })

    const lines = [
        `## ${await resolveKey(ctx, 'waifu:upgradeTitle')}`,
        await resolveKey(ctx, 'waifu:upgradeBalance', { silver }),
        `${await row('pulls', pulls)}\n${await row('claims', claims)}`,
        note,
    ].filter(Boolean)

    const button = async (type: UpgradeType, s: UpgradeStatus, emoji: string) =>
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: UPGRADE_CMD, owner: userId, action: 'buy', arg: type }))
            .setEmoji(emoji)
            .setLabel(
                await resolveKey(ctx, 'waifu:upgradeButton', {
                    label: await resolveKey(ctx, `waifu:${UPGRADES[type].labelKey}`),
                    cost: s.cost,
                })
            )
            .setStyle(ButtonStyle.Success)
            .setDisabled(silver < s.cost)

    const rows = [buttonRow(await button('pulls', pulls, '🎴'), await button('claims', claims, '💖'))]
    return v2Container(lines, { rows, color: note ? 0x2ecc71 : undefined })
}

/** Buys one level. Returns the note to show on the refreshed panel. */
export async function buyUpgrade(ctx: UpgradeCtx, guildId: string, userId: string, type: UpgradeType) {
    const cfg = UPGRADES[type]
    const { level, cost } = await statusOf(guildId, userId, type)

    if ((await spendSilver(guildId, userId, cost)) === null) {
        return resolveKey(ctx, 'waifu:upgradeNotEnough', { cost })
    }
    let updated: any
    try {
        updated = await userCommandUpgradeSchema.findOneAndUpdate(
            { guildId, userId, commandKey: cfg.key },
            {
                $setOnInsert: { guildId, userId, commandKey: cfg.key },
                $inc: { upgradeLevel: 1 },
            },
            { upsert: true, new: true }
        )
    } catch (error) {
        await addSilver(guildId, userId, cost)
        throw error
    }
    const newLevel = updated?.upgradeLevel ?? level + 1
    return resolveKey(ctx, 'waifu:upgradeSuccess', {
        key: await resolveKey(ctx, `waifu:${cfg.labelKey}`),
        level: newLevel,
        limit: cfg.baseLimit + newLevel,
    })
}

@ApplyOptions<Command.Options>({
    name: 'upgrade',
    description: 'Upgrade your hourly waifu pull/claim limits',
    runIn: 'GUILD_ANY',
})
export class UpgradeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('upgrade').setDescription('Upgrade your hourly waifu pull/claim limits')
        )
    }

    public override async messageRun(message: Message) {
        await message.reply(v2Payload(await renderUpgrade(message, message.guild!.id, message.author.id)))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            v2Payload(await renderUpgrade(interaction, interaction.guild!.id, interaction.user.id))
        )
    }
}
