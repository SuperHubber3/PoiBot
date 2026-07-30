import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js'
import type { OwnedWaifu } from '../functions/waifu.js'
import { encodeId } from '../util/component-id.js'

/**
 * Paginated picker over a character collection.
 *
 * A Discord select menu holds at most 25 options, which used to mean `/sell`
 * could only ever reach your first 25 cards and everything past that was
 * unsellable. Rather than special-casing each screen, every collection UI pages
 * through the list 25 at a time with shared navigation.
 *
 * Selection values are stable per-card identifiers, so collection reordering
 * cannot silently redirect a pick to a different card.
 */
export const PAGE_SIZE = 25

type I18nCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction

export function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

/** Clamps to a valid page and wraps out-of-range values around the ends. */
export function wrapPage(page: number, total: number): number {
    const pages = pageCount(total)
    return ((page % pages) + pages) % pages
}

export interface PickerOptions {
    /** Component-id `cmd` the handler matches on. */
    cmd: string
    /** Who is allowed to use these components. */
    owner: string
    list: OwnedWaifu[]
    page: number
    /** Allow selecting more than one card. */
    multi?: boolean
    placeholder: string
    /**
     * Extra payload appended to nav args (e.g. a trade partner id). Kept short —
     * customIds are capped at 100 characters.
     */
    tag?: string
    /** Overrides the select menu's action verb (default `pick`). */
    action?: string
}

/**
 * Select menu for the current page plus a nav row.
 *
 * Prev/Next **wrap**: on the first page, Previous jumps to the last one. The
 * middle button opens a "jump to page" modal.
 */
export async function pickerRows(
    ctx: I18nCtx,
    opts: PickerOptions
): Promise<ActionRowBuilder<MessageActionRowComponentBuilder>[]> {
    const { cmd, owner, list, multi, placeholder, tag, action = 'pick' } = opts
    const pages = pageCount(list.length)
    const page = wrapPage(opts.page, list.length)
    const start = page * PAGE_SIZE
    const slice = list.slice(start, start + PAGE_SIZE)

    const arg = (p: number) => (tag ? `${p}.${tag}` : String(p))

    const menu = new StringSelectMenuBuilder()
        .setCustomId(encodeId({ cmd, owner, action, arg: arg(page) }))
        .setPlaceholder(placeholder.slice(0, 150))
        .setMinValues(1)
        .setMaxValues(multi ? slice.length : 1)
        .addOptions(
            await Promise.all(
                slice.map(async (w, i) => ({
                    // Absolute index — the label shows the same 1-based number the
                    // browser and the trade command use.
                    label: `${start + i + 1}. ${w.name}`.slice(0, 100),
                    description: (
                        await resolveKey(ctx, 'waifu:sellOptionDescription', {
                            anime: w.animeName,
                            price: w.price,
                        })
                    ).slice(0, 100),
                    value: w.uid,
                }))
            )
        )

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu as any),
    ]

    if (pages > 1) {
        rows.push(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd, owner, action: 'page', arg: arg(page - 1) }))
                    .setEmoji('◀️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd, owner, action: 'jump', arg: arg(page) }))
                    .setLabel(`${page + 1} / ${pages}`)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(encodeId({ cmd, owner, action: 'page', arg: arg(page + 1) }))
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    }

    return rows
}

/** Modal asking for a page (or card) number to jump to. */
export async function jumpModal(
    ctx: I18nCtx,
    cmd: string,
    owner: string,
    arg: string,
    total: number,
    unit: 'page' | 'card'
): Promise<ModalBuilder> {
    const titleKey = unit === 'page' ? 'waifu:jumpPageTitle' : 'waifu:jumpCardTitle'
    const labelKey = unit === 'page' ? 'waifu:jumpPageLabel' : 'waifu:jumpCardLabel'
    return new ModalBuilder()
        .setCustomId(encodeId({ cmd, owner, action: 'jumpto', arg }))
        .setTitle((await resolveKey(ctx, titleKey)).slice(0, 45))
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel((await resolveKey(ctx, labelKey, { total })).slice(0, 45))
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(6)
            )
        )
}
