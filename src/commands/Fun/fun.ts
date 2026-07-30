import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Guild,
    GuildMember,
    Message,
    MessageFlags,
    SendableChannels,
    User,
} from 'discord.js'
import { percentFrom } from '../../lib/util/percent.js'
import { randomRedditPost } from '../../lib/util/reddit.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'
import { OWO_BOT_ID } from '../../lib/constants.js'

// Hardcoded meme targets carried over from the source bots.
const ID_KIRImiZi = '300561167619981312'
const ID_OWNER = '338760814884290562'
const ID_SATIS = '279494365221486593'
const ID_OWO = OWO_BOT_ID

interface FunContext {
    source: Message | ChatInputCommandInteraction
    author: User
    member: GuildMember | null
    guild: Guild
    channel: SendableChannels
    /** Extra text argument(s). */
    argString: string
    /** Resolved mentioned members (first is the primary target). */
    mentions: GuildMember[]
    /** Reply to the invoker (ephemeral for slash). */
    ack: (content: string) => Promise<unknown>
    /** Public channel send. */
    send: (content: any) => Promise<Message>
    deleteInvoking: () => Promise<unknown>
}

type FunHandler = (ctx: FunContext) => string | void | Promise<string | void>

const rng = (max: number) => Math.ceil(Math.random() * max)
const t = (ctx: FunContext, key: string, vars?: Record<string, unknown>) => resolveKey(ctx.source, `fun:${key}`, vars)

function loveMeter(a: GuildMember, b: GuildMember): number {
    const members = [a, b].sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
    return percentFrom(
        `${members[0].id}${members[1].user.username}${members[0].user.username}${members[1].id}`
    )
}

const EIGHTBALL = [
    'eightballSure',
    'eightballSafe',
    'eightballYes',
    'eightballNoBest',
    'eightballAskLater',
    'eightballCannotThink',
    'eightballDontThink',
    'eightballSourcesNo',
    'eightballNo',
    'eightballNotNice',
]

const HANDLERS: Record<string, FunHandler> = {
    '8ball': async (ctx) => {
        if (!ctx.argString) return t(ctx, 'eightballMissing')
        if (!ctx.argString.trim().endsWith('?')) return t(ctx, 'eightballNeedsQuestion')
        return t(ctx, 'eightballAnswer', {
            user: ctx.author.username,
            answer: await t(ctx, EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)]),
        })
    },
    '31': async (ctx) => {
        const m = await ctx.send(await t(ctx, 'meme31'))
        await m.react('👌').catch(() => { })
        await m.pin().catch(() => { })
        setTimeout(() => m.unpin().catch(() => { }), 3000)
    },
    ab: (ctx) => t(ctx, 'ab'),
    abone: (ctx) => t(ctx, 'subscribeUrl'),
    apex: (ctx) => t(ctx, 'apex'),
    aşk: async (ctx) => {
        const pair = getTwoMembers(ctx)
        if (typeof pair === 'string') return t(ctx, pair)
        const [first, second] = pair
        const percent = loveMeter(first, second)
        await ctx.send(v2([
            await t(ctx, 'loveTitle'),
            await t(ctx, 'loveDescription', {
                first: first.user.username,
                second: second.user.username,
                percent,
            }),
            await t(ctx, 'requestedBy', { user: ctx.author.tag }),
        ]))
    },
    beleş: async (ctx) => {
        await ctx.send(v2(await t(ctx, 'freeClick')))
    },
    bitcoin: (ctx) => t(ctx, 'bitcoin'),
    captcha: (ctx) => t(ctx, 'captcha'),
    cum: (ctx) => t(ctx, 'cum'),
    ddd: async (ctx) => {
        const m = await ctx.send(await t(ctx, 'ddd', { count: rng(69) }))
        await m.react('😳').catch(() => { })
    },
    emoji: async (ctx) => {
        const name = ctx.argString.trim()
        if (!name) return
        const emo = ctx.guild.emojis.cache.find((e) => e.name?.toLowerCase() === name.toLowerCase())
        if (!emo) return
        await ctx.deleteInvoking().catch(() => { })
        await ctx.send(emo.toString())
    },
    flip: (ctx) => t(ctx, Math.floor(Math.random() * 2) === 0 ? 'coinHeads' : 'coinTails'),
    gizli: async (ctx) => {
        const m = await ctx.send(await t(ctx, 'secretFound'))
        await m.react('😳').catch(() => { })
        const m2 = await ctx.send(await t(ctx, 'secretJokePublic'))
        await m2.edit(await t(ctx, 'secretJokeSecret')).catch(() => { })
    },
    iftar: (ctx) => t(ctx, 'iftar'),
    kedi: async (ctx) => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8_000)
        try {
            const res = await fetch('https://api.thecatapi.com/v1/images/search', { signal: controller.signal })
            if (!res.ok) return t(ctx, 'catNotFound')
            const data = (await res.json()) as any
            const url = data?.[0]?.url
            if (typeof url !== 'string' || !url.trim()) return t(ctx, 'catNotFound')
            await ctx.send(url)
        } catch {
            return t(ctx, 'catNotFound')
        } finally {
            clearTimeout(timeout)
        }
    },
    malafat: (ctx) => {
        const targetsKirmizi = ctx.mentions.some((m) => m.id === ID_KIRImiZi) || ctx.author.id === ID_KIRImiZi
        return targetsKirmizi
            ? t(ctx, 'malafatKirmizi')
            : t(ctx, 'malafatDefault')
    },
    memes: async (ctx) => sendReddit(ctx, 'memes'),
    nnn: (ctx) => {
        const target = ctx.mentions[0]?.id
        if (ctx.member?.roles.cache.some((r) => r.name === 'MISTIK NEDEN 1001')) return t(ctx, 'nnnSelfFail')
        if (target === ID_KIRImiZi) return t(ctx, 'nnnTargetFail')
        if (target === ID_OWNER) return t(ctx, 'nnnTwo')
        if (target === ID_SATIS) return t(ctx, 'nnnOneSatis')
        if (ctx.member?.roles.cache.some((r) => r.name === 'Server Booster')) return t(ctx, 'nnnTwo')
        return t(ctx, 'nnnRandom', { count: rng(5) })
    },
    nova3: (ctx) => t(ctx, 'didYouMean', { user: `<@!${ID_KIRImiZi}>` }),
    pickle: (ctx) => {
        const target = ctx.mentions[0]?.id
        if (target === ID_OWO) return t(ctx, 'pickleOwo')
        if (ctx.member?.roles.cache.some((r) => r.name === 'MISTIK NEDEN 1001')) return t(ctx, 'pickleNoSelf')
        if (target === ID_KIRImiZi) return t(ctx, 'pickleKirmizi')
        if (target === ID_OWNER || ctx.author.id === ID_OWNER) return t(ctx, 'pickleKm', { amount: rng(100) })
        if (ctx.member?.roles.cache.some((r) => r.name === 'Tsundere Loli Enjoyer')) return t(ctx, 'pickleKm', { amount: rng(100) })
        return t(ctx, 'pickleCm', { amount: rng(60) })
    },
    roketlig: (ctx) => t(ctx, 'rocketLeague'),
    satış: (ctx) => t(ctx, 'didYouMean', { user: `<@!${ID_SATIS}>` }),
    say: async (ctx) => {
        let text = ctx.argString.trim()
        let hidden = false
        if (text.endsWith('-hide')) {
            hidden = true
            text = text.slice(0, -'-hide'.length).trim()
            await ctx.deleteInvoking().catch(() => { })
        }
        if (!text) return
        if (hidden) text = ':mega: ' + text
        for (let i = 0; i < text.length; i += 2000) await ctx.send(text.slice(i, i + 2000))
    },
    ship: async (ctx) => {
        const pair = getTwoMembers(ctx)
        if (typeof pair === 'string') return t(ctx, pair)
        const [first, second] = pair
        try {
            const url =
                `https://nekobot.xyz/api/imagegen?type=ship` +
                `&user1=${first.user.displayAvatarURL({ extension: 'png', size: 512 })}` +
                `&user2=${second.user.displayAvatarURL({ extension: 'png', size: 512 })}`
            // Bounded like `kedi` above: an unresponsive nekobot would otherwise
            // leave this awaiting forever, and the slash path's deferred reply
            // never resolves.
            const res = await fetch(encodeURI(url), { signal: AbortSignal.timeout(8_000) })
            if (!res.ok) return t(ctx, 'error')
            const json = (await res.json()) as any
            await ctx.send(v2(await t(ctx, 'shipTitle'), { image: json.message }))
            await ctx.deleteInvoking().catch(() => { })
        } catch {
            return t(ctx, 'error')
        }
    },
    shitpost: async (ctx) => sendReddit(ctx, 'shitpostTC'),
    tf2: async (ctx) => {
        await ctx.send(await t(ctx, 'tf2One'))
        await ctx.send(await t(ctx, 'tf2Two'))
        await ctx.send(await t(ctx, 'tf2Three', { user: `<@!${ctx.author.id}>` }))
    },
    tm: async (ctx) => {
        await ctx.deleteInvoking().catch(() => { })
        await ctx.ack(await t(ctx, 'tm'))
    },
    turkeyjerky: async (ctx) => sendReddit(ctx, 'TurkeyJerky'),
    valorant: (ctx) => t(ctx, 'valorant'),
    yo: async (ctx) => {
        await ctx.deleteInvoking().catch(() => { })
        await ctx.ack(await t(ctx, 'yo'))
    },
}

// Aliases → canonical subcommand.
const ALIASES: Record<string, string> = { e: 'emoji', rl: 'roketlig' }

const SUBCOMMANDS = Object.keys(HANDLERS)

async function sendReddit(ctx: FunContext, subreddit: string): Promise<string | void> {
    const url = await randomRedditPost(subreddit)
    if (!url) return t(ctx, 'redditNoResponse')
    await ctx.send(url)
}

function getTwoMembers(ctx: FunContext): [GuildMember, GuildMember] | string {
    const first = ctx.mentions.find((m) => m.id !== ctx.author.id)
    if (!first) return 'needOneMention'
    const second =
        ctx.mentions.find((m) => m.id !== first.id && m.id !== ctx.author.id) ?? (ctx.member as GuildMember)
    return [first, second]
}

@ApplyOptions<Command.Options>({
    name: 'fun',
    description: 'All fun commands in one command!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 3000,
})
export class FunCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('fun')
                .setDescription('All fun commands in one command!')
                .addStringOption((opt) =>
                    opt.setName('command').setDescription('Name of the fun command').setRequired(true).setAutocomplete(true)
                )
                .addStringOption((opt) => opt.setName('arguments').setDescription('Arguments for the command'))
                .addUserOption((opt) => opt.setName('mentions').setDescription('User for the command'))
        )
    }

    public override autocompleteRun(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused().toLowerCase()
        const matches = SUBCOMMANDS.filter((s) => s.includes(focused)).slice(0, 25)
        return interaction.respond(matches.map((s) => ({ name: s, value: s })))
    }

    private resolve(sub: string): FunHandler | undefined {
        const key = ALIASES[sub] ?? sub
        return HANDLERS[key]
    }

    public override async messageRun(message: Message, args: Args) {
        const sub = (await args.pick('string').catch(() => ''))
        const handler = this.resolve(sub)
        if (!handler) {
            await message.reply({
                content: await resolveKey(message, 'fun:unknownCommand'),
                allowedMentions: { parse: [] },
            })
            return
        }
        const rest = await args.rest('string').catch(() => '')
        const mentions = [...message.mentions.members?.values() ?? []]

        const ctx: FunContext = {
            source: message,
            author: message.author,
            member: message.member,
            guild: message.guild!,
            channel: message.channel as SendableChannels,
            argString: rest,
            mentions,
            ack: (content) => message.reply({ content, allowedMentions: { parse: [] } }),
            send: (content) =>
                (message.channel as SendableChannels).send(
                    typeof content === 'string' ? { content, allowedMentions: { parse: [] } } : content
                ),
            deleteInvoking: () => message.delete(),
        }
        const result = await handler(ctx)
        if (typeof result === 'string') await ctx.send(result)
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getString('command', true)
        const handler = this.resolve(sub)
        if (!handler) {
            await interaction.reply({ content: await resolveKey(interaction, 'fun:unknownCommand'), flags: MessageFlags.Ephemeral })
            return
        }
        const argString = interaction.options.getString('arguments') ?? ''
        const mentionUser = interaction.options.getUser('mentions')
        const mentions: GuildMember[] = []
        if (mentionUser) {
            const gm = await interaction.guild!.members.fetch(mentionUser.id).catch(() => null)
            if (gm) mentions.push(gm)
        }

        // Defer publicly, then let the handler's first `send` *become* the reply.
        // Previously this posted an ephemeral "discord moment :)" ack and then a
        // second channel message — two messages for one command.
        await interaction.deferReply()
        let usedReply = false

        const channel = interaction.channel as SendableChannels
        const ctx: FunContext = {
            source: interaction,
            author: interaction.user,
            member: interaction.member as GuildMember | null,
            guild: interaction.guild!,
            channel,
            argString,
            mentions,
            ack: (content) => interaction.followUp({ content, flags: MessageFlags.Ephemeral }),
            send: async (content) => {
                const payload =
                    typeof content === 'string' ? { content, allowedMentions: { parse: [] } } : content
                if (usedReply) return channel.send(payload)
                usedReply = true
                return (await interaction.editReply(payload)) as Message
            },
            deleteInvoking: async () => { },
        }

        const result = await handler(ctx)
        if (typeof result === 'string') await ctx.send(result)
        // Handlers that only `ack`ed (an error) never produced a public message —
        // drop the deferred reply so it doesn't hang as a "thinking" placeholder.
        if (!usedReply) await interaction.deleteReply().catch(() => { })
    }
}
