import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { getQueue } from '../../lib/music/queue.js'
import { updatePanel } from '../../lib/music/panel.js'
import { MusicCtx, canControlQueue, guildIdOf } from '../../lib/util/music-ctx.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

@ApplyOptions<Command.Options>({ name: 'resume', description: 'Resume playback', runIn: 'GUILD_ANY' })
export class ResumeCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) => guildOnly(b).setName('resume').setDescription('Resume playback'))
    }
    public override messageRun(message: Message) {
        return this.run(message)
    }
    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply()
        return this.run(interaction, true)
    }
    private async run(ctx: MusicCtx, deferred = false) {
        const respond = (payload: ReturnType<typeof v2>) =>
            deferred && ctx instanceof ChatInputCommandInteraction ? ctx.editReply(payload) : ctx.reply(payload)
        const queue = getQueue(guildIdOf(ctx))
        if (queue?.current && !canControlQueue(ctx, queue)) {
            return respond(v2(await resolveKey(ctx, 'common:musicDifferentVoice')))
        }
        const key = !queue?.current ? 'common:musicNothingPlaying' : 'common:musicResumed'
        if (queue?.current) { await queue.player.setPaused(false); void updatePanel(queue) }
        return respond(v2(await resolveKey(ctx, key)))
    }
}
