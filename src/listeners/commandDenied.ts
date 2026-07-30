import { Events, Listener, UserError } from '@sapphire/framework'
import type { MessageCommandDeniedPayload } from '@sapphire/framework'
import { deniedText } from '../lib/util/denied.js'

// The framework ships no default denied-handler, so precondition failures (e.g.
// cooldowns, owner-only) would otherwise be silent. The slash-command half lives
// in chatInputCommandDenied.ts: two Listener classes in one file load, then the
// later one evicts the earlier by name, leaving that event unhandled.

export class MessageCommandDeniedListener extends Listener<typeof Events.MessageCommandDenied> {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, { ...options, event: Events.MessageCommandDenied })
    }

    public override run(error: UserError, { message }: MessageCommandDeniedPayload) {
        return message
            .reply({ content: deniedText(error), allowedMentions: { users: [message.author.id] } })
            .catch(() => null)
    }
}
