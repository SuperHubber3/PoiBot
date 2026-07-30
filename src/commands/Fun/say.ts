import { ApplyOptions } from '@sapphire/decorators'
import { Args, BucketScope, Command } from '@sapphire/framework'
import { Message } from 'discord.js'
import { sendable } from '../../lib/util/send.js'

// Message-only command (no slash), with a 3-minute global cooldown.
@ApplyOptions<Command.Options>({
    name: 'say',
    description: 'I will repeat your message!',
    runIn: 'GUILD_ANY',
    cooldownDelay: 1000 * 60 * 3,
    cooldownScope: BucketScope.Global,
})
export class SayCommand extends Command {
    public override async messageRun(message: Message, args: Args) {
        const rest = await args.rest('string').catch(() => '')
        const tokens = rest.length ? rest.split(/ +/) : []

        let hidden = false
        if (tokens[tokens.length - 1] === '-hide') {
            hidden = true
            message.delete().catch(() => { })
            tokens.pop()
        }

        let msg = tokens.join(' ')
        if (!msg) return
        if (hidden) msg = ':mega: ' + msg

        for (let offset = 0; offset < msg.length; offset += 2000) {
            await sendable(message).send({
                content: msg.slice(offset, offset + 2000),
                allowedMentions: { parse: [] },
            })
        }
    }
}
