import { Events, Listener, UserError } from '@sapphire/framework'
import type { ChatInputCommandDeniedPayload } from '@sapphire/framework'
import { MessageFlags } from 'discord.js'
import { deniedText } from '../lib/util/denied.js'

// Slash-command half of the denied handling; see commandDenied.ts for why these
// are two files.

export class ChatInputCommandDeniedListener extends Listener<typeof Events.ChatInputCommandDenied> {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, { ...options, event: Events.ChatInputCommandDenied })
    }

    public override run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
        const content = deniedText(error)
        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => null)
        }
        return interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null)
    }
}
