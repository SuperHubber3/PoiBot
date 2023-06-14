import { ICommand } from 'wokcommands'
import { Client, Collection, GuildMember, MessageEmbed } from "discord.js"
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';
import { addHug } from '../../functions/counters';
const wait = require('util').promisify(setTimeout);
let messageCount = 0

export default {
    name: 'hug',
    category: 'Counter',
    description: "Hug someone!",
    slash: 'both',
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: false,
    cooldown: '5s',
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`hug {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to hug", type: "USER", required: true },
    ],

    init: (client: Client) => {
        client.on('messageCreate', async message => {
            messageCount++
            const { guild } = message
            let target: string
            let userId: string
            let isHug: boolean
            message.embeds.forEach(async e => {
                const desc = e.description
                if (!desc || !desc?.includes("hug") || desc?.includes("command")) return isHug = false
                let parse = desc.substring(desc.length - 20)
                if (desc.length > 50) {
                    parse = desc.substring(desc.length - 21)
                }
                target = parse.slice(0, -2)
                const parsedeez = desc.substring(0, 21)
                userId = parsedeez.slice(3, desc.length)
                isHug = true
            });
            if (message.embeds.length < 1 || message.author.id !== "993069924362760202" || !target! || !userId! || !isHug!) return

            function luck() {
                let pass: boolean = false
                const chance = Math.floor(Math.random() * 100)
                if (target == "708324787352764429") { if (chance <= 60) { pass = true } }       // vako
                else if (target == "1014482054538350612") { if (chance <= 60) { pass = true } } // kiri
                else if (target == "193749488135962625") { if (chance <= 40) { pass = true } }  // foga
                else if (target == "618496924781379595") { if (chance <= 40) { pass = true } }  // spark
                else chance >= 50 ? pass = true : pass = false
                return pass
            }

            if (luck()) {
                const gif = Math.ceil(Math.random() * 2);
                const hugs = await addHug(guild!.id, userId!, target!, message, true)
                let text = `That's ${hugs} hug` + (hugs > 1 ? "s " : " ") + "now."
                const embed = new MessageEmbed({ footer: { text } })
                    .setColor("RANDOM")
                    .setTitle('You got dodged!')
                    .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
                    .setDescription(`*<@${target!}> dodges <@${userId!}>*`)
                    .setImage(gif == 1 ? "https://cdn.discordapp.com/attachments/768414521978126346/1040954686699741254/acchi-kocchi-my-chance-to-hug-him.gif" : "https://cdn.discordapp.com/attachments/768414521978126346/1040954687035297812/kuroshitsuji-grell-sutcliff.gif")
                await wait(250);
                message.edit({ embeds: [embed] })
            }
        })
    },

    callback: async ({ interaction: msgInt, channel, user, message, args, guild }) => {
        //if (messageCount < 15) return
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

        messageCount = 0

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