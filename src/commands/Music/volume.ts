import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { updatePanel } from '../../lib/music/panel.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({ name: 'volume', aliases: ['vol'], description: 'Set the playback volume (1-100)', runIn: 'GUILD_ANY' })
export class VolumeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b).setName('volume').setDescription('Set the playback volume (1-100)').addIntegerOption((o) =>
                o.setName('percent').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)
            )
        )
    }
    public override async messageRun(message: Message, args: Args) {
        const vol = await args.pick('integer').catch(() => Number.NaN)
        return this.run(message, vol)
    }
    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        return this.run(interaction, interaction.options.getInteger('percent', true), true)
    }
    private async run(ctx: MusicCtx, volume: number, deferred = false) {
        const respond = (payload: ReturnType<typeof v2>) =>
            deferred && ctx instanceof ChatInputCommandInteraction ? ctx.editReply(payload) : ctx.reply(payload)
        const queue = getQueue(guildIdOf(ctx))
        if (!queue?.current) return respond(v2(await resolveKey(ctx, 'common:musicNothingPlaying')))
        if (!canControlQueue(ctx, queue)) {
            return respond(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const clamped = Math.max(1, Math.min(100, isNaN(volume) ? 50 : volume))
        await queue.player.setGlobalVolume(clamped)
        void updatePanel(queue)
        queue.volume = clamped
        return respond(v2(await resolveKey(ctx, 'common:musicVolumeSet', { volume: clamped })))
    }
}
