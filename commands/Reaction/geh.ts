import { ICommand } from 'wokcommands'
import { Collection, GuildMember, MessageEmbed } from "discord.js";

export default {
    name: 'geh',
    category: 'Anime',
    description: "Helly's second name",
    slash: 'both',
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: true,
    syntaxError: {
        '<user>': 'Incorrect usage! Please use "{PREFIX}geh {ARGUMENTS}"'
    },
    options: [{ name: 'user', description: 'Ask why are they geh', type: 'USER' }],

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
        if (target === "") return

        const embed = new MessageEmbed({ footer: { text: "That's x gehs now!" } })
            .setColor("RANDOM")
            .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
            .setDescription(`<@${user.id}> asks why <@${target}> is so geh!`)
            .setImage('https://cdn.discordapp.com/attachments/850395930531725377/913590897696968764/ezgif.com-gif-maker_2.gif?size=4096')

        return embed
    },
} as ICommand