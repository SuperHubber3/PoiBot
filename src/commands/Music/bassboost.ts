import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getFilterState, scheduleFilterFlush } from '../../lib/music/filters.js'
import { getQueue } from '../../lib/music/queue.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({
    name: 'bassboost',
    aliases: ['bb'],
    description: 'Boost the bass (0 = off, 1-10 = intensity)',
    runIn: 'GUILD_ANY',
})
export class BassboostCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                .setName('bassboost')
                .setDescription('Boost the bass (0 = off, 1-10 = intensity)')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('0-10').setRequired(true).setMinValue(0).setMaxValue(10)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const level = await args.pick('integer').catch(() => Number.NaN)
        await this.run(message, level)
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.run(interaction, interaction.options.getInteger('level', true))
    }

    private async run(ctx: MusicCtx, level: number) {
        const guildId = guildIdOf(ctx)
        // Settable while idle: the state is stored now and applied when playback starts.
        const queue = getQueue(guildId)
        if (queue && !canControlQueue(ctx, queue)) {
            return ctx.reply(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const clamped = Math.max(0, Math.min(10, isNaN(level) ? 0 : level))
        getFilterState(guildId).bass = clamped
        scheduleFilterFlush(guildId, queue?.player)
        const [set, shortly] = await Promise.all([
            resolveKey(ctx, clamped === 0 ? 'common:musicBassboostOff' : 'common:musicBassboostSet', {
                level: clamped,
            }),
            resolveKey(ctx, queue?.current ? 'common:musicFilterWillApplyShortly' : 'common:musicFilterOnNextPlay'),
        ])
        return ctx.reply(v2([set, shortly]))
    }
}
