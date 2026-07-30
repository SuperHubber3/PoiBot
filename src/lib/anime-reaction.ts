import { ApplyOptions } from '@sapphire/decorators'
import { Command } from '@sapphire/framework'
import { resolveKey } from '@sapphire/plugin-i18next'
import { ChatInputCommandInteraction, Message, User } from 'discord.js'
import { v2 } from './util/v2.js'
import { guildOnly } from './util/install-context.js'
import { fetchReactionGif, type NekosBestReaction } from './services/media.service.js'

export interface AnimeReactionConfig {
    name: string
    description: string
    /** i18n key shown when there's no target (or you target yourself). */
    selfKey: string
    /** Optional image for the self case (uwu has none). */
    selfImage?: string
    /** i18n key for the targeted action title. */
    actionKey: string
    /** Candidate images for the targeted case (random pick). */
    images: string[]
    /** Matching nekos.best category, when one exists for this command. */
    apiCategory?: NekosBestReaction
    aliases?: string[]
}

/** Builds a Sapphire command for a simple "do X to someone" anime gif reaction. */
export function createAnimeReaction(config: AnimeReactionConfig) {
    @ApplyOptions<Command.Options>({
        name: config.name,
        description: config.description,
        aliases: config.aliases,
        runIn: 'GUILD_ANY',
        cooldownDelay: 3000,
    })
    class AnimeReactionCommand extends Command {
        public override registerApplicationCommands(registry: Command.Registry) {
            registry.registerChatInputCommand((builder) =>
            guildOnly(builder)
                    .setName(config.name)
                    .setDescription(config.description)
                    .addUserOption((opt) => opt.setName('person').setDescription('Tag someone!').setRequired(false))
            )
        }

        private async build(ctx: Message | ChatInputCommandInteraction, author: User, target: User | null | undefined) {
            if (!target || target.id === author.id) {
                const image =
                    config.apiCategory && config.selfImage
                        ? await fetchReactionGif(config.apiCategory, () => config.selfImage!)
                        : config.selfImage
                return v2(await resolveKey(ctx, `anime:${config.selfKey}`), { image })
            }
            const fallback = () => config.images[Math.floor(Math.random() * config.images.length)]
            const image = config.apiCategory
                ? await fetchReactionGif(config.apiCategory, fallback)
                : fallback()
            return v2(
                [
                    await resolveKey(ctx, `anime:${config.actionKey}`),
                    await resolveKey(ctx, 'anime:reactionSent', {
                        target: `<@!${target.id}>`,
                        author: `<@!${author.id}>`,
                    }),
                ],
                { image }
            )
        }

        public override async messageRun(message: Message) {
            const target = message.mentions.users.first()
            return message.reply({ ...(await this.build(message, message.author, target)), allowedMentions: { parse: [] } })
        }

        public override async chatInputRun(interaction: ChatInputCommandInteraction) {
            const target = interaction.options.getUser('person')
            // The body embeds <@!id> mentions, so the slash path needs the same
            // mention suppression the message path applies — otherwise the same
            // command pings on one route and not the other.
            const mentions = { allowedMentions: { parse: [] as never[] } }
            if (config.apiCategory) {
                await interaction.deferReply()
                return interaction.editReply({ ...(await this.build(interaction, interaction.user, target)), ...mentions })
            }
            return interaction.reply({ ...(await this.build(interaction, interaction.user, target)), ...mentions })
        }
    }

    return AnimeReactionCommand
}
