import type { AwardReplyTarget } from './lib/types.js'
import type { IAward } from './lib/models/award-schema.js'

// Register the bot's custom client event so listeners can subscribe to it typed.
declare module 'discord.js' {
    interface ClientEvents {
        awardDeserved: [awardItem: IAward, userId: string, guildId: string, target: AwardReplyTarget]
    }
}
