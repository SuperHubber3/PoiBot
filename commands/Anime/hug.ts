import { ICommand } from "wokcommands";
import { Collection, GuildMember } from "discord.js";

export default {
    name: "hug",
    category: "Anime",
    description: "Hug someone!",
    slash: "both", // This is for the usage of the slash commands and message commands at the same time
    guildOnly: true,
    testOnly: true, // This is for faster testing
    expectedArgs: '<user>', // For the correct usage of the command
    minArgs: 1,
    maxArgs: 1,
    syntaxError: {
        '<user>': 'Incorrect usage! Please use "{PREFIX} hug {ARGUMENTS}"'
    },
    callback: async ({guild, user, args, message, interaction }) => {
        let replyMessage = {}
        const interactionUser: string = args[0]

        if (interactionUser.length >= 2) {
            guild?.members.search({'query': interactionUser}).then((result: Collection<string, GuildMember>) => {
                const firstResult = result.first()
    
                if (firstResult) {
                    replyMessage = { content: '<@' + user + '>' + " hugs " + firstResult.user.id }
                } else {
                    replyMessage = { content: 'User ' + interactionUser + ' not found!' }
                }
            })
        } else {
            replyMessage = { content: 'Argument <user> should be at least 2 characters length!' }
        }

        if (message) {
            message.reply(replyMessage)
            return;
        }
        
        interaction.reply(replyMessage)
    },
} as ICommand;
