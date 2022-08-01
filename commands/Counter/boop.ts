import { Collection, GuildMember } from "discord.js";
import { ICommand } from "wokcommands";
import { addBoop } from "../../functions/counters";

export default {
    name: "boop",
    category: "Anime",
    description: "Boop someone!",
    slash: "both",
    guildOnly: true,
    testOnly: false,
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    syntaxError: {
        '<user>': 'Incorrect usage! Please use "{PREFIX}hug {ARGUMENTS}"'
    },
    options: [
        { name: "user", description: "User to boop", type: "MENTIONABLE", required: true },
    ],

    callback: async ({ message, interaction: msgInt, guild, user, args, channel }) => {
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
        const boops = await addBoop(guild!.id, user.id, target)
        let content = `You gave <@${target}> a boop! That's ${boops} boops now!`
        if (boops == 1) content = `You gave <@${target}> a boop! Their first boop from you!`
        if (message) {
            message.reply({ content });
            return;
        }
        msgInt.reply({ content });
    },
} as ICommand;
