import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import {
    ChatInputCommandInteraction,
    Guild,
    Message,
    TextDisplayBuilder,
    User,
} from 'discord.js'
import { CommandType } from './enums/command.enum.js'
import { MediaService } from './services/media.service.js'
import { resolveTarget, type ResolvedTarget } from './util/resolveTarget.js'
import { sendable } from './util/send.js'
import { cantTargetSelf } from './constants.js'
import type { AwardReplyTarget } from './types.js'
import { v2Container, v2Payload } from './util/v2.js'
import { anywhere } from './util/install-context.js'

/** Counter bucket used when there is no server — DMs and group DMs. */
export const DM_SCOPE = '@dm'

type TargetContext = Message | ChatInputCommandInteraction

/**
 * Shared target lookup and self-target validation for bespoke counter flows.
 *
 * `preResolved` lets a caller that already ran `resolveTarget` hand the result
 * in. Resolving twice means a second `guild.members.search()` REST call for every
 * name-based target, which is both slower and twice the rate-limit budget.
 */
export async function resolveCounterTarget(
    ctx: TargetContext,
    guild: Guild | null,
    giver: User,
    rawTarget: string | undefined,
    verb: string,
    sendError: (content: string) => Promise<unknown>,
    preResolved?: ResolvedTarget
): Promise<string | undefined> {
    const resolved = preResolved ?? (await resolveTarget(guild, rawTarget))
    if (resolved.tooShort) {
        await sendError(await resolveKey(ctx, 'counter:argumentTooShort'))
        return undefined
    }
    if (resolved.notFound) {
        await sendError(await resolveKey(ctx, 'counter:userNotFound', { user: resolved.raw }))
        return undefined
    }
    if (resolved.invalid || !resolved.targetId) return undefined
    if (resolved.targetId === giver.id) {
        await sendError(cantTargetSelf(verb))
        return undefined
    }
    return resolved.targetId
}

type AddFn = (
    guildId: string,
    giverId: string,
    targetId: string,
    target: AwardReplyTarget
) => Promise<number>

export interface CounterCommandConfig {
    name: string
    description: string
    /** Media/counter type; drives which media file and counter field are used. */
    commandType: CommandType
    /** Counter add function (e.g. addHug). */
    add: AddFn
    /** I18n key override for a title. Omit for reaction-style commands (geh) that have none. */
    titleKey?: string | null
    /** I18n key override for the whole description line (geh uses a custom phrasing). */
    descriptionKey?: string
    /** Whether acting on yourself performs the normal action (punch allows it). */
    allowSelf?: boolean
    /**
     * Custom V2 container to send when a user targets themselves instead of the generic
     * "You can't <name> yourself!" error (e.g. a future "hugs a pillow" response).
     * Takes precedence over the generic error. Ignored when `allowSelf` is set.
     */
    selfResponse?: (ctx: Message | ChatInputCommandInteraction, giverId: string) => Promise<ReturnType<typeof v2Container>>
    aliases?: string[]
    cooldownMs?: number
}

interface ExecContext {
    guild: Guild | null
    /**
     * Bucket the counts belong to.
     *
     * Normally the guild id. Outside a server — a DM or group DM via the user app —
     * there is none, so counts fall into one shared `DM_SCOPE` bucket instead of
     * being dropped. Note this is the guild *id*, not the Guild object: when the
     * app is used in a server the bot isn't a member of, `guild` is null but the
     * id is still there, so those counts stay per-server.
     */
    guildId: string
    giver: User
    rawTarget: string | undefined
    awardTarget: AwardReplyTarget
    source: Message | ChatInputCommandInteraction
    send: (container: ReturnType<typeof v2Container>) => Promise<unknown>
    sendError: (content: string) => Promise<unknown>
}

/**
 * Builds a full Sapphire command (message + slash) for an interaction counter.
 * Adding a new counter is just a config object — see src/commands/Counter/*.
 */
export function createCounterCommand(config: CounterCommandConfig) {
    @ApplyOptions<Command.Options>({
        name: config.name,
        description: config.description,
        aliases: config.aliases,
        cooldownDelay: config.cooldownMs ?? 5000,
    })
    class CounterCommand extends Command {
        public override registerApplicationCommands(registry: Command.Registry) {
            registry.registerChatInputCommand((builder) =>
                anywhere(builder)
                    .setName(config.name)
                    .setDescription(config.description)
                    .addUserOption((opt) =>
                        opt.setName('user').setDescription(config.description).setRequired(true)
                    )
            )
        }

        public override async messageRun(message: Message, args: Args) {
            const rawTarget = await args.pick('string').catch(() => undefined)
            await this.execute({
                guild: message.guild,
                guildId: message.guildId ?? DM_SCOPE,
                giver: message.author,
                rawTarget,
                awardTarget: message,
                source: message,
                send: (container) =>
                    message.reply({ ...v2Payload(container), allowedMentions: { parse: [] } }),
                sendError: (content) => sendable(message).send({ content, allowedMentions: { parse: [] } }),
            })
        }

        public override async chatInputRun(interaction: ChatInputCommandInteraction) {
            await interaction.deferReply()
            const rawTarget = interaction.options.getUser('user')?.toString() ?? undefined
            await this.execute({
                guild: interaction.guild,
                guildId: interaction.guildId ?? DM_SCOPE,
                giver: interaction.user,
                rawTarget,
                awardTarget: interaction,
                source: interaction,
                send: (embed) =>
                    interaction.editReply({ ...v2Payload(embed), allowedMentions: { parse: [] } }),
                sendError: (content) => interaction.editReply({ content, allowedMentions: { parse: [] } }),
            })
        }

        private async execute(ctx: ExecContext) {
            const resolved = await resolveTarget(ctx.guild, ctx.rawTarget)
            if (resolved.targetId === ctx.giver.id && config.selfResponse && !config.allowSelf) {
                await ctx.send(await config.selfResponse(ctx.source, ctx.giver.id))
                return
            }
            const target = config.allowSelf
                ? resolved.targetId
                : await resolveCounterTarget(
                    ctx.source,
                    ctx.guild,
                    ctx.giver,
                    ctx.rawTarget,
                    config.name,
                    ctx.sendError,
                    resolved
                )
            if (!target) {
                if (config.allowSelf) {
                    if (resolved.tooShort) await ctx.sendError(await resolveKey(ctx.source, 'counter:argumentTooShort'))
                    else if (resolved.notFound) {
                        await ctx.sendError(await resolveKey(ctx.source, 'counter:userNotFound', { user: resolved.raw }))
                    }
                }
                return
            }

            const { guildId } = ctx
            const giverId = ctx.giver.id

            const media = await new MediaService(config.commandType).getReactionMedia()
            const count = await config.add(guildId, giverId, target, ctx.awardTarget)

            const footer = await this.countFooter(ctx.source, config.name, count)
            const description = config.descriptionKey
                ? await resolveKey(ctx.source, config.descriptionKey, { giver: `<@${giverId}>`, target: `<@${target}>` })
                : await resolveKey(ctx.source, 'counter:counterDescription', {
                    giver: `<@${giverId}>`,
                    target: `<@${target}>`,
                    verb: await resolveKey(ctx.source, `counter:actions.${config.name}.verb`),
                })
            const title = config.titleKey === undefined ? `counter:actions.${config.name}.title` : config.titleKey
            const container = v2Container(
                title ? [`## ${await resolveKey(ctx.source, title)}`, description] : description,
                { image: media }
            )
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer))

            await ctx.send(container)
        }

        private async countFooter(ctx: Message | ChatInputCommandInteraction, name: string, count: number) {
            if (count === 1) {
                return resolveKey(ctx, 'counter:firstCount', {
                    singular: await resolveKey(ctx, `counter:actions.${name}.singular`),
                })
            }
            return resolveKey(ctx, 'counter:countNow', {
                count,
                plural: await resolveKey(ctx, `counter:actions.${name}.plural`),
            })
        }

    }

    return CounterCommand
}
