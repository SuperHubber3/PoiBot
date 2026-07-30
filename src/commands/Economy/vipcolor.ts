import { ApplyOptions } from '@sapphire/decorators'
import { Args, Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, GuildMember, Message, PermissionFlagsBits } from 'discord.js'
import profileSchema from '../../lib/models/profile-schema.js'
import { isVip } from './shop.js'
import { v2 } from '../../lib/util/v2.js'
import { guildOnly } from '../../lib/util/install-context.js'

const HEX = /^#[0-9a-f]{6}$/i

/** Personal colour roles are named after the owner so they're easy to find. */
const roleName = (userId: string) => `vip-${userId}`

/**
 * VIP perk: a personal colour role.
 *
 * The role is created on demand, hoisted above nothing and granted no
 * permissions — it exists purely to tint the member's name. Passing no colour
 * removes it, which is what the old `v-del-color` did.
 */
@ApplyOptions<Command.Options>({
    name: 'vipcolor',
    aliases: ['vc'],
    description: 'Set your personal VIP name colour (VIP only)',
    runIn: 'GUILD_ANY',
    cooldownDelay: 5000,
})
export class VipColorCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((b) =>
            guildOnly(b)
                .setName('vipcolor')
                .setDescription('Set your personal VIP name colour (VIP only)')
                .addStringOption((opt) =>
                    opt.setName('hex').setDescription('Hex colour like #cbdcf7. Omit it to remove the role.').setRequired(false)
                )
        )
    }

    public override async messageRun(message: Message, args: Args) {
        const hex = await args.pick('string').catch(() => '')
        await message.reply(await this.setColor(message, message.member, hex))
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        await interaction.reply(
            await this.setColor(interaction, interaction.member as GuildMember, interaction.options.getString('hex') ?? '')
        )
    }

    private async setColor(
        ctx: Message | ChatInputCommandInteraction,
        member: GuildMember | null,
        hex: string
    ) {
        const guild = ctx.guild!
        if (!member) return v2(await resolveKey(ctx, 'common:vipColorFailed'), { color: 0xe74c3c })

        if (!(await isVip(guild.id, member.id))) {
            return v2(await resolveKey(ctx, 'common:vipRequired'), { color: 0xe74c3c })
        }
        if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return v2(await resolveKey(ctx, 'common:vipColorNoPerms'), { color: 0xe74c3c })
        }

        const existing = guild.roles.cache.find((r) => r.name === roleName(member.id))

        // No colour given → drop the role entirely.
        if (!hex) {
            if (existing) await existing.delete('vipcolor removed').catch(() => null)
            await profileSchema.updateOne({ guildId: guild.id, userId: member.id }, { $unset: { vipColor: '' } })
            return v2(await resolveKey(ctx, 'common:vipColorRemoved'))
        }

        if (!HEX.test(hex)) {
            return v2(await resolveKey(ctx, 'common:vipColorInvalid'), { color: 0xe74c3c })
        }

        const parsedColor = parseInt(hex.slice(1), 16)
        const color = parsedColor === 0 ? 0x000001 : parsedColor
        try {
            if (existing) {
                await existing.setColor(color)
                if (!member.roles.cache.has(existing.id)) await member.roles.add(existing)
            } else {
                const role = await guild.roles.create({
                    name: roleName(member.id),
                    color,
                    reason: `VIP colour for ${member.user.tag}`,
                })
                await member.roles.add(role)
            }
        } catch {
            // Almost always the bot's own role sitting below the new one.
            return v2(await resolveKey(ctx, 'common:vipColorFailed'), { color: 0xe74c3c })
        }

        await profileSchema.updateOne(
            { guildId: guild.id, userId: member.id },
            { $set: { vipColor: hex.toLowerCase() } }
        )
        return v2(await resolveKey(ctx, 'common:vipColorSet', { hex: hex.toLowerCase() }), { color })
    }
}
