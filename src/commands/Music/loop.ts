import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { RepeatMode, getQueue } from '../../lib/music/queue.js'
import { updatePanel } from '../../lib/music/panel.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

const MODES: Record<string, RepeatMode> = {
    off: 'off',
    track: 'track',
    queue: 'queue',
}

@ApplyOptions<Command.Options>({ name: 'loop', description: 'Set loop mode (off/track/queue)', runIn: 'GUILD_ANY' })
export class LoopCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b).setName('loop').setDescription('Set loop mode').addStringOption((o) =>
                o
                    .setName('mode')
                    .setDescription('off / track / queue')
                    .setRequired(true)
                    .addChoices({ name: 'off', value: 'off' }, { name: 'track', value: 'track' }, { name: 'queue', value: 'queue' })
            )
        )
    }
    public override async messageRun(message: Message, args: Args) {
        const mode = (await args.pick('string').catch(() => 'off')).toLowerCase()
        return this.run(message, mode)
    }
    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction, interaction.options.getString('mode', true))
    }
    private async run(ctx: MusicCtx, mode: string) {
        const queue = getQueue(guildIdOf(ctx))
        if (!queue?.current) return ctx.reply(v2(await resolveKey(ctx, 'common:musicNothingPlaying')))
        if (!canControlQueue(ctx, queue)) {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        queue.repeat = Object.hasOwn(MODES, mode) ? MODES[mode] : 'off'
        void updatePanel(queue)
        return ctx.reply(v2(await resolveKey(ctx, 'common:musicLoopSet', { mode: queue.repeat })))
    }
}
