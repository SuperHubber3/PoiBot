import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { Message } from 'discord.js'
import { RAZOR_ID, razorState } from '../lib/state/razor.js'

// Marks razor as "recently active" so the boop command allows booping them.
@ApplyOptions<Listener.Options>({ event: Events.MessageCreate })
export class RazorTrackerListener extends Listener<typeof Events.MessageCreate> {
    public override run(message: Message) {
        if (message.author.id === RAZOR_ID) razorState.razorCache = true
    }
}
