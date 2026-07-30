import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message } from 'discord.js'
import { sendable } from '../../lib/util/send.js'
import { addKill, getKill } from '../../lib/functions/counters.js'
import { v2 } from '../../lib/util/v2.js'
import { anywhere } from '../../lib/util/install-context.js'
import { DM_SCOPE } from '../../lib/counter-command.js'

const GOOD_LUCK = [
    'killGoodArrow',
    'killGoodStab',
    'killGoodBomb',
    'killGoodPointBlank',
    'killGoodBlade',
    'killGoodBullets',
    'killGoodStruggles',
    'killGoodAxe',
]

const BAD_LUCK = [
    'killBadAxe',
    'killBadShot',
    'killBadBomb',
    'killBadLunge',
    'killBadKnife',
]

@ApplyOptions<Command.Options>({
    name: 'kill',
    description: 'Kill someone!',
    cooldownDelay: 5000,
})
export class KillCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand((builder) =>
            anywhere(builder)
                .setName('kill')
                .setDescription('Kill someone!')
                .addUserOption((opt) => opt.setName('user').setDescription('User to kill').setRequired(true))
        )
    }

    // The prefix command only nudges the user toward the slash command.
    public override async messageRun(message: Message) {
        try {
            const sent = await sendable(message).send(await resolveKey(message, 'fun:killSlashNudge'))
            setTimeout(() => sent.delete().catch(() => {}), 1000 * 3)
        } catch (error) {
            this.container.logger.warn('[kill] failed to send slash-command nudge', error)
        }
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        // Several counter reads and writes happen before the first response, so
        // ack up front rather than racing Discord's 3-second deadline.
        await interaction.deferReply()
        // No guild in a DM — kill tallies share the DM bucket, like the other counters.
        const guildId = interaction.guildId ?? DM_SCOPE
        const user = interaction.user
        const targetUser = interaction.options.getUser('user', true)

        let target = targetUser.id
        let targetName = targetUser.username

        if (target === user.id) {
            return interaction.editReply(v2(await resolveKey(interaction, 'fun:killSelf')))
        }

        let luck = Math.ceil(Math.random() * 2)

        // Killing PoiBot redirects to MEE6 and is always a "success".
        if (target === this.container.client.user?.id) {
            target = '159985870458322944'
            targetName = 'MEE6'
            luck = 1
        }

        let selectedKey: string
        let kills: number
        let rival: number

        if (luck === 1) {
            selectedKey = GOOD_LUCK[Math.floor(Math.random() * GOOD_LUCK.length)]
            kills = await addKill(guildId, user.id, target, interaction)
            rival = await getKill(guildId, target, user.id)
        } else {
            selectedKey = BAD_LUCK[Math.floor(Math.random() * BAD_LUCK.length)]
            if (selectedKey === 'killBadKnife') {
                kills = await getKill(guildId, user.id, target)
                rival = await addKill(guildId, target, user.id, interaction)
            } else {
                kills = await getKill(guildId, user.id, target)
                rival = await getKill(guildId, target, user.id)
            }
        }

        const title = await resolveKey(interaction, 'fun:killTitle', {
            kills,
            user: user.username,
            target: targetName,
            rival,
            url: `https://discord.com/oauth2/authorize?client_id=${interaction.applicationId}&permissions=275146730592&scope=bot%20applications.commands`,
        })
        const text = await resolveKey(interaction, `fun:${selectedKey}`, { target: `**${targetName}**` })

        return interaction.editReply(v2([`## ${title}`, text], { thumbnail: user.displayAvatarURL() }))
    }
}
