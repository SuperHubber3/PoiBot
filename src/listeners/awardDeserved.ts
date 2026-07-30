import { Listener } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { IAward } from '../lib/models/award-schema.js'
import { INVITE_URL } from '../lib/constants.js'
import type { AwardReplyTarget } from '../lib/types.js'
import { v2 } from '../lib/util/v2.js'

// Handles the custom `awardDeserved` event: announces an unlocked achievement.
export class AwardDeservedListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, { ...options, event: 'awardDeserved' })
    }

    public override async run(awardItem: IAward, _userId: string, _guildId: string, target: AwardReplyTarget) {
        const user = target instanceof Message ? target.author : (target as ChatInputCommandInteraction).user

        const [title, description, reward] = await Promise.all([
            resolveKey(target, 'misc:achievementTitle', { reward: awardItem.rewardMessage }),
            resolveKey(target, 'misc:achievementDescription', { type: awardItem.type, count: awardItem.countNeeded }),
            resolveKey(target, 'misc:achievementReward', { amount: awardItem.silverReward }),
        ])
        const payload = v2([`## [${title}](${INVITE_URL})`, description, reward], {
            thumbnail: user.displayAvatarURL(),
        })

        if (target instanceof Message) {
            await target.reply({ ...payload, allowedMentions: { parse: [] } }).catch((err) => this.container.logger.warn('[awardDeserved] could not announce award', err))
        } else {
            await target.followUp({ ...payload, allowedMentions: { parse: [] } }).catch((err) => this.container.logger.warn('[awardDeserved] could not announce award', err))
        }
    }
}
