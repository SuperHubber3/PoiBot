import { ICommand } from "wokcommands";
import { Collection, GuildMember, MessageEmbed } from "discord.js";

export default {
    name: "hug",
    category: "Anime",
    description: "Hug someone!",
    slash: "both", // This is for the usage of the slash commands and message commands at the same time
    guildOnly: true,
    expectedArgs: '<user>', // For the correct usage of the command
    cooldown: '1',
    minArgs: 1,
    maxArgs: 1,
    syntaxError: {
        '<user>': 'Incorrect usage! Please use "{PREFIX}hug {ARGUMENTS}"'
    },
    callback: async ({ guild, user, args, message, interaction, channel }) => {
        let replyMessage = {}
        const interactionUser: string = args[0]

        if (interactionUser.length >= 2) {
            await guild?.members.search({ 'query': interactionUser }).then((result: Collection<string, GuildMember>) => {
                const firstResult = result.first()

                if (firstResult) {
                    const embed = new MessageEmbed({ footer: { text: "That's x hugs now!" } })
                        .setColor("RANDOM")
                        .setTitle('You gave a hug!')
                        .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
                        .setDescription(`*<@${user.id}> hugs <@${firstResult.user.id}>*`)
                        .setImage('https://images-ext-2.discordapp.net/external/BaeODfmtiHpGGmRJ2_10l8tVqzfddc7xFoTjRdNoFl8/https/data.yuibot.app/reactions/hug/kdfslkf.gif')
                    replyMessage = { embeds: [embed] }
                } else {
                    replyMessage = { content: 'User ' + interactionUser + ' not found!' }
                }
            })
        } else {
            replyMessage = { content: 'Argument <user> should be at least 2 characters long!' }
        }

        if (message) {
            channel.send(replyMessage)
            return;
        }

        interaction.reply(replyMessage)
    },
} as ICommand;
