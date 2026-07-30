import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageComponentInteraction,
    User,
} from 'discord.js'
import gachaSchema from '../../lib/models/gacha-schema.js'
import type { GachaGame } from '../../lib/gacha/gacha.js'
import { buttonRow, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const COLLECTION_CMD = 'gcol'

/** Characters listed per page. Star groups keep the message well under limits. */
const PAGE_SIZE = 20

export const GAMES: { value: GachaGame; titleKey: string }[] = [
    { value: 'genshin', titleKey: 'games:gacha.genshinTitle' },
    { value: 'bluearchive', titleKey: 'games:gacha.blueArchiveTitle' },
]

type CollectionCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction

interface OwnedCharacter {
    name: string
    star: number
    status: string
    constellation: number
}

/**
 * One page of a gacha collection.
 *
 * Sorted by rarity then constellation then name, so the best pulls sit at the
 * top; `C6` is called out because reaching it is what turns duplicates into
 * silver, and it's the thing players actually chase.
 */
export async function renderCollection(
    ctx: CollectionCtx,
    game: GachaGame,
    guildId: string,
    viewerId: string,
    owner: User,
    page: number
) {
    const doc = await gachaSchema.findOne({ guildId, userId: owner.id, game })
    const all = ((doc?.characters as OwnedCharacter[]) ?? []).slice().sort(
        (a, b) => b.star - a.star || b.constellation - a.constellation || a.name.localeCompare(b.name)
    )

    const gameTitle = await resolveKey(ctx, GAMES.find((g) => g.value === game)!.titleKey)
    if (!all.length) {
        return v2Container([
            `## ${gameTitle}`,
            await resolveKey(ctx, 'games:gacha.collectionEmpty', { user: owner.username }),
        ], { rows: [gameSwitchRow(viewerId, owner.id, game)] })
    }

    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
    const current = ((page % pages) + pages) % pages
    const slice = all.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

    const lines = slice
        .map((c) => {
            const stars = '⭐'.repeat(Math.max(1, Math.min(5, c.star)))
            const con = c.constellation >= 6 ? '**C6**' : `C${c.constellation}`
            return `${stars} **${c.name}** · ${con}`
        })
        .join('\n')

    const maxed = all.filter((c) => c.constellation >= 6).length
    const summary = await resolveKey(ctx, 'games:gacha.collectionSummary', {
        user: owner.username,
        total: all.length,
        maxed,
        page: current + 1,
        pages,
    })

    const rows = [gameSwitchRow(viewerId, owner.id, game)]
    if (pages > 1) {
        rows.unshift(
            buttonRow(
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd: COLLECTION_CMD, owner: viewerId, action: 'page', arg: `${current - 1}.${game}.${owner.id}` }))
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd: COLLECTION_CMD, owner: viewerId, action: 'noop', arg: 'x' }))
                    .setLabel(`${current + 1} / ${pages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd: COLLECTION_CMD, owner: viewerId, action: 'page', arg: `${current + 1}.${game}.${owner.id}` }))
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    }

    return v2Container([`## ${gameTitle}`, summary, lines], { rows })
}

/** Jumps straight to the other game's collection. */
function gameSwitchRow(viewerId: string, ownerId: string, game: GachaGame) {
    const other = game === 'genshin' ? 'bluearchive' : 'genshin'
    return buttonRow(
        new ButtonBuilder()
            .setCustomId(encodeId({ cmd: COLLECTION_CMD, owner: viewerId, action: 'game', arg: `0.${other}.${ownerId}` }))
            .setEmoji(other === 'genshin' ? '🌜' : '🔵')
            .setLabel(other === 'genshin' ? 'Genshin' : 'Blue Archive')
            .setStyle(ButtonStyle.Secondary)
    )
}

@ApplyOptions<Command.Options>({
    name: 'collection',
    aliases: ['pulls', 'mywishes'],
    description: 'View your Genshin and Blue Archive pulls',
    runIn: 'GUILD_ANY',
})
export class CollectionCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b)
                .setName('collection')
                .setDescription('View your Genshin and Blue Archive pulls')
                .addStringOption((opt) =>
                    opt
                        .setName('game')
                        .setDescription('Which gacha')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Genshin', value: 'genshin' },
                            { name: 'Blue Archive', value: 'bluearchive' }
                        )
                )
                .addUserOption((opt) => opt.setName('user').setDescription('Whose collection').setRequired(false))
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const raw = (await args.pick('string').catch(() => 'genshin')).toLowerCase()
        const game: GachaGame = raw.startsWith('b') ? 'bluearchive' : 'genshin'
        await message.reply(
            v2Payload(
                await renderCollection(
                    message,
                    game,
                    message.guildId!,
                    message.author.id,
                    message.mentions.users.first() ?? message.author,
                    0
                )
            )
        )
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const game = (interaction.options.getString('game') ?? 'genshin') as GachaGame
        const owner = interaction.options.getUser('user') ?? interaction.user
        await interaction.reply(
            v2Payload(
                await renderCollection(
                    interaction,
                    game,
                    interaction.guildId!,
                    interaction.user.id,
                    owner,
                    0
                )
            )
        )
    }
}
