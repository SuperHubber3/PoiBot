import { ICommand } from 'wokcommands'
import { Client, Collection, GuildMember, MessageEmbed } from "discord.js"
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';
import { addHug } from '../../functions/counters';
let count = 0

export default {
    name: 'hug',
    category: 'Counter',
    description: "Hug someone!",
    slash: 'both',
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    cooldown: '30s',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`hug {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to hug", type: "USER", required: true },
    ],

    init: (client: Client) => {
        client.on('messageCreate', async message => {
            const { guild } = message
            let target: string
            let userId: string
            let isHug: boolean
            message.embeds.forEach(async e => {
                const desc = e.description
                if (!desc || !desc?.includes("hug")) return isHug = false
                const parse = desc.substring(desc.length - 20)
                target = parse.slice(0, -2)
                const parsedeez = desc.substring(0, 21)
                userId = parsedeez.slice(3, desc.length)
                isHug = true
            });
            if (message.embeds.length < 1 || message.author.id !== "993069924362760202" || !target! || !userId! || !isHug!) return
            count++
            if (count > 5) {
                const gif = Math.ceil(Math.random() * 2);
                const hugs = await addHug(guild!.id, userId!, target!, message, true)
                let text = `That's ${hugs} hug` + (hugs > 1 ? "s " : " ") + "now."
                const embed = new MessageEmbed({ footer: { text } })
                    .setColor("RANDOM")
                    .setTitle('You got dodged!')
                    .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
                    .setDescription(`*<@${target!}> dodges <@${userId!}>*`)
                    .setImage(gif == 1 ? "https://cdn.discordapp.com/attachments/768414521978126346/1040954686699741254/acchi-kocchi-my-chance-to-hug-him.gif" : "https://cdn.discordapp.com/attachments/768414521978126346/1040954687035297812/kuroshitsuji-grell-sutcliff.gif")
                message.edit({ embeds: [embed] })
                count = 0
            }
        })
    },

    callback: async ({ interaction: msgInt, channel, user, message, args, guild }) => {
        let interactionUser = msgInt?.options.getUser("user")?.toString() || args[0];
        if (interactionUser.startsWith('<')) {
            interactionUser = interactionUser.substring(2)
            interactionUser = interactionUser.slice(0, -1)
        }
        let target: string = interactionUser

        const no = async () => {
            const reply = { content: `User ${interactionUser} not found!` }
            if (message) {
                channel.send(reply)
                return
            }
            msgInt.reply(reply)
        }

        if (interactionUser.length >= 2) {
            if (isNaN(parseInt(interactionUser))) {
                await guild?.members
                    .search({ query: interactionUser })
                    .then(async (result: Collection<string, GuildMember>) => {
                        const firstResult = result.first();
                        if (firstResult) {
                            target = firstResult.user.id;
                        } else {
                            await no()
                        }
                    });
            }
        } else {
            return "Argument <user> should be at least 2 characters long!";
        }
        if (isNaN(parseInt(target))) return
        if (target == user.id) return

        let mediaString = (new MediaService(CommandType.Hug)).getMedia()
        const hugs = await addHug(guild!.id, user.id, target, message)
        let text = `That's ${hugs} hugs now!`
        if (hugs == 1) text = `Their first hug from you!`

        const embed = new MessageEmbed({ footer: { text } })
            .setColor("RANDOM")
            .setTitle('You gave a hug!')
            .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
            .setDescription(`*<@${user.id}> hugs <@${target}>*`)
            .setImage(mediaString)

        if (target == user.id) {
            embed.setTitle("You hug yourself")
            embed.setDescription(`*<@${user.id}> hugs themselves*`)
            embed.setImage(``)
            return embed
        }
        return embed
    },
} as ICommand