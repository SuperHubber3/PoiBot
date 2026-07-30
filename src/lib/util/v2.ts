import {
    ActionRowBuilder,
    ButtonBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from 'discord.js'

/**
 * Components V2 helpers. Every user-facing reply that used an embed should use
 * these instead. A V2 message is built from a ContainerBuilder and MUST be sent
 * with the IsComponentsV2 flag — you cannot mix `content`/`embeds` with it.
 *
 * Typical usage:
 *   import { v2, v2Container, v2Payload } from '../../lib/util/v2.js'
 *   // simple text:
 *   await interaction.reply(v2('**Hello**', { color: 0x5865f2 }))
 *   // with image + buttons:
 *   const c = v2Container(['**Title**', 'body'], { image: url, rows: [row] })
 *   await message.reply(v2Payload(c))
 *   // ephemeral:
 *   await interaction.reply(v2('done', { ephemeral: true }))
 */

export const IS_V2 = MessageFlags.IsComponentsV2

/** A pleasant random accent color as an int (Components V2 needs a number). */
export function randomColor(): number {
    return Math.floor(Math.random() * 0xffffff)
}

export interface V2Options {
    /** Container accent bar color (int). Omit for a random color; pass null for none. */
    color?: number | null
    /** Adds a full-width image (media gallery). */
    image?: string | null
    /** Adds the text as a section with this image as a thumbnail accessory. */
    thumbnail?: string | null
    /** Button/select-menu rows appended after the text. */
    rows?: ActionRowBuilder<MessageActionRowComponentBuilder>[]
    /** Insert a separator between text blocks. */
    separator?: boolean
}

/** Builds a Components V2 container from markdown text plus optional media/rows. */
export function v2Container(text: string | string[], opts: V2Options = {}): ContainerBuilder {
    const container = new ContainerBuilder()
    container.setAccentColor(opts.color === undefined ? randomColor() : opts.color ?? undefined)

    const blocks = (Array.isArray(text) ? text : [text]).filter((t) => t && t.length)

    if (opts.thumbnail && blocks.length) {
        // Discord caps a Section at 3 text components — anything beyond that is
        // appended after the section instead of blowing up at render time.
        const SECTION_MAX = 3
        const section = new SectionBuilder().setThumbnailAccessory(
            new ThumbnailBuilder().setURL(opts.thumbnail)
        )
        for (const b of blocks.slice(0, SECTION_MAX)) {
            section.addTextDisplayComponents(new TextDisplayBuilder().setContent(b))
        }
        container.addSectionComponents(section)
        for (const b of blocks.slice(SECTION_MAX)) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(b))
        }
    } else {
        blocks.forEach((b, i) => {
            if (opts.separator && i > 0) {
                container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            }
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(b))
        })
    }

    if (opts.image) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(opts.image))
        )
    }

    for (const row of opts.rows ?? []) container.addActionRowComponents(row)

    return container
}

/** Wraps a prebuilt container into a ready-to-send reply payload. */
export function v2Payload(container: ContainerBuilder, opts: { ephemeral?: boolean } = {}) {
    let flags: number = IS_V2
    if (opts.ephemeral) flags |= MessageFlags.Ephemeral
    return { flags, components: [container] as any }
}

/** One-shot: build + wrap a text (and optional media/rows) reply payload. */
export function v2(text: string | string[], opts: V2Options & { ephemeral?: boolean } = {}) {
    return v2Payload(v2Container(text, opts), { ephemeral: opts.ephemeral })
}

/** Convenience for a single row of buttons. */
export function buttonRow(...buttons: ButtonBuilder[]) {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons)
}

/**
 * Payload for editing an already-V2 message (the IsComponentsV2 flag persists on
 * the existing message, so only components are passed). Use with
 * `interaction.update(...)` inside InteractionHandlers or `message.edit(...)`.
 */
export function v2Update(container: ContainerBuilder) {
    return { components: [container] as any }
}
