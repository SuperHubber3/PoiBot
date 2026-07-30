import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ActionRowBuilder,
    ChatInputCommandInteraction,
    Message,
    MessageActionRowComponentBuilder,
    MessageComponentInteraction,
    SendableChannels,
    StringSelectMenuBuilder,
    User,
} from 'discord.js'
import { getBd } from '../../lib/functions/counters.js'
import { getGuildLanguage } from '../../lib/functions/guild-language.js'
import { v2Container, v2Payload } from '../../lib/util/v2.js'
import { encodeId } from '../../lib/util/component-id.js'
import { guildOnly } from '../../lib/util/install-context.js'

export const BIRTHDAY_CMD = 'bday'

/**
 * Birthdays are stored against the year 2000 — a leap year, so 29 February is a
 * valid choice. Only the day and month are ever read back.
 */
const YEAR = 2000

type BirthdayCtx = Message | ChatInputCommandInteraction | MessageComponentInteraction

function daysInMonth(month: number): number {
    return new Date(YEAR, month + 1, 0).getDate()
}

/** Month names in the server's language, rather than a dozen hand-written keys. */
function monthName(locale: string, month: number): string {
    return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(YEAR, month, 1))
}

export function formatBirthday(locale: string, date: Date): string {
    return `${date.getDate()} ${monthName(locale, date.getMonth())}`
}

/**
 * The picker.
 *
 * Choosing a month re-renders with a day menu sized to that month, so 31 April
 * can't be picked at all. The chosen month rides along in the day menu's
 * customId, which is why this needs no session storage.
 */
export async function renderBirthday(
    ctx: BirthdayCtx,
    guildId: string,
    user: User,
    month: number | null,
    note?: string
) {
    const locale = await getGuildLanguage(guildId)
    const stored = await getBd(guildId, user.id)

    const current = stored
        ? formatBirthday(locale, stored)
        : await resolveKey(ctx, 'counter:birthdayNotSet')

    const monthMenu = new StringSelectMenuBuilder()
        .setCustomId(encodeId({ cmd: BIRTHDAY_CMD, owner: user.id, action: 'month' }))
        .setPlaceholder(await resolveKey(ctx, 'counter:birthdayPickMonth'))
        .addOptions(
            Array.from({ length: 12 }, (_, m) => ({
                label: monthName(locale, m),
                value: String(m),
                default: m === month,
            }))
        )

    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(monthMenu as any),
    ]

    if (month !== null) {
        const dayMenu = new StringSelectMenuBuilder()
            .setCustomId(encodeId({ cmd: BIRTHDAY_CMD, owner: user.id, action: 'day', arg: String(month) }))
            .setPlaceholder(
                await resolveKey(ctx, 'counter:birthdayPickDay', { month: monthName(locale, month) })
            )
            .addOptions(
                Array.from({ length: daysInMonth(month) }, (_, i) => ({
                    label: String(i + 1),
                    value: String(i + 1),
                }))
            )
        rows.push(new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(dayMenu as any))
    }

    return v2Container(
        [
            `## ${await resolveKey(ctx, 'counter:birthdayTitle')}`,
            `**${await resolveKey(ctx, 'counter:birthdayField')}**\n${current}`,
            note ?? (await resolveKey(ctx, 'counter:birthdayHint')),
        ].filter(Boolean),
        { rows }
    )
}

@ApplyOptions<Command.Options>({
    name: 'birthday',
    description: 'You are getting older!',
    aliases: ['bd'],
    runIn: 'GUILD_ANY',
})
export class BirthdayCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder).setName('birthday').setDescription('You are getting older!')
        )
    }

    public override async messageRun(message: Message) {
        const channel = message.channel as SendableChannels
        await channel.send({
            ...v2Payload(await renderBirthday(message, message.guild!.id, message.author, null)),
            allowedMentions: { parse: [] },
        })
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            v2Payload(await renderBirthday(interaction, interaction.guild!.id, interaction.user, null), {
                ephemeral: true,
            })
        )
    }
}
