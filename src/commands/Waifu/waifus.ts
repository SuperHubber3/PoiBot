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
    MessageComponentInteraction,
    ModalSubmitInteraction,
    User,
} from 'discord.js'
import { getWaifus, OwnedWaifu } from '../../lib/functions/waifu.js'
import { claimCount } from '../../lib/waifu/pull.js'
import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const WAIFUS_PAGE_CMD = 'wpage'

type WaifusPageCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction
type WaifusOwner = Pick<User, 'id' | 'username'>

export async function renderWaifusPage(
    ctx: WaifusPageCtx,
    viewerId: string,
    owner: WaifusOwner,
    page: number,
    prefetched?: OwnedWaifu[]
) {
    const list = prefetched ?? await getWaifus(ctx.guild!.id, owner.id)
    if (!list.length) return v2Container(await resolveKey(ctx, 'waifu:listEmpty'))

    // Wraps instead of clamping: Previous on the first card lands on the last one.
    const bounded = ((page % list.length) + list.length) % list.length
    const w: OwnedWaifu = list[bounded]
    const title = await resolveKey(ctx, 'waifu:collectionTitle', {
        name: w.name,
        url: `https://myanimelist.net/character/${w.id}`,
    })
    const details = await resolveKey(ctx, 'waifu:characterDetails', {
        anime: w.animeName,
        animeUrl: `https://myanimelist.net/anime/${w.animeId}`,
        price: w.price,
        claims: await claimCount(w.id),
    })
    const footer = await resolveKey(ctx, 'waifu:collectionFooter', {
        user: owner.username,
        page: bounded + 1,
        total: list.length,
    })
    return v2Container([`## ${title}`, details, footer], { image: w.img, rows: [waifusPageButtons(viewerId, owner.id, bounded, list.length)] })
}

/**
 * Prev / "n of total" / Next.
 *
 * Neither arrow is ever disabled — both wrap, so Previous on card 1 goes to the
 * last card. The middle button opens a modal to jump straight to a number, which
 * is the only sane way to reach card 240 of 300.
 */
function waifusPageButtons(viewerId: string, ownerId: string, page: number, total: number) {
    const nav = (action: string, target: number) =>
        encodeId({ cmd: WAIFUS_PAGE_CMD, owner: viewerId, action, arg: `${target}.${ownerId}` })

    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId(nav('page', page - 1)).setEmoji('◀️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(nav('jump', page))
            .setLabel(`${page + 1} / ${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(total <= 1),
        new ButtonBuilder().setCustomId(nav('page', page + 1)).setEmoji('▶️').setStyle(ButtonStyle.Secondary)
    )
}

@ApplyOptions<Command.Options>({
    name: 'waifus',
    aliases: ['ws'],
    description: 'Browse claimed characters',
    runIn: 'GUILD_ANY',
})
export class WaifusCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('waifus')
                .setDescription('Browse claimed characters')
                .addUserOption((opt) => opt.setName('user').setDescription('Whose collection').setRequired(false))
        )
    }

    public override async messageRun(message: Message) {
        await this.view(message, message.author, message.mentions.users.first() ?? message.author)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await this.view(interaction, interaction.user, interaction.options.getUser('user') ?? interaction.user)
    }

    private async view(ctx: Message | ChatInputCommandInteraction, viewer: User, owner: User) {
        const list = await getWaifus(ctx.guild!.id, owner.id)
        const reply = async (payload: any) => {
            if (ctx instanceof Message) return ctx.reply(payload)
            await ctx.reply(payload)
            return ctx.fetchReply()
        }

        if (!list.length) return void reply(v2(await resolveKey(ctx, 'waifu:listEmpty')))
        await reply(v2Payload(await renderWaifusPage(ctx, viewer.id, owner, 0, list)))
    }
}
