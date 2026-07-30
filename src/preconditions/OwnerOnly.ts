import { Precondition } from '@sapphire/framework'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { BOT_OWNERS } from '../lib/constants.js'

// Restricts a command to the configured bot owner(s).
export class OwnerOnlyPrecondition extends Precondition {
    public override messageRun(message: Message) {
        return this.check(message.author.id)
    }

    public override chatInputRun(interaction: ChatInputCommandInteraction) {
        return this.check(interaction.user.id)
    }

    private check(userId: string) {
        return BOT_OWNERS.includes(userId)
            ? this.ok()
            : this.error({ message: 'This command can only be used by the bot owner.' })
    }
}

declare module '@sapphire/framework' {
    interface Preconditions {
        OwnerOnly: never
    }
}
