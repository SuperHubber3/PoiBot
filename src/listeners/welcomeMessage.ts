import { ApplyOptions } from '@sapphire/decorators'
import { Events, Listener } from '@sapphire/framework'
import { GuildMember, SendableChannels } from 'discord.js'
import guildSettingsSchema from '../lib/models/guild-settings-schema.js'

// Sends a configurable welcome message when a member joins (see /welcome).
@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class WelcomeMessageListener extends Listener<typeof Events.GuildMemberAdd> {
    public override async run(member: GuildMember) {
        const settings = await guildSettingsSchema.findOne({ guildId: member.guild.id })
        if (!settings?.welcomeChannelId || !settings?.welcomeMessage) return

        const channel = member.guild.channels.cache.get(settings.welcomeChannelId)
        if (!channel || !channel.isTextBased()) return

        const text = String(settings.welcomeMessage).replace(/\{user\}/g, `<@${member.id}>`)
        await (channel as SendableChannels).send({
            content: text,
            allowedMentions: { parse: [], users: [member.id] },
        }).catch(() => {})
    }
}
