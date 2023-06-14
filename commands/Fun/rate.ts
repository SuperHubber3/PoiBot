import { Collection, GuildMember } from "discord.js";
import { ICommand } from "wokcommands";
const md5 = require("md5")

export default {
    name: "rate",
    category: "Fun",
    description: "Rate someone!",
    slash: "both",
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: false,
    cooldown: "5s",
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`rate {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to rate", type: "USER", required: true },
    ],

    callback: async ({ message, interaction: msgInt, guild, user, args, channel }) => {
        let interactionUser = msgInt?.options.getUser("user")?.toString() || args[0];
        if (interactionUser.startsWith('<')) {
            interactionUser = interactionUser.substring(2)
            interactionUser = interactionUser.slice(0, -1)
        }
        let target: string = interactionUser
        let targetName: string = msgInt?.options.getUser("user")?.username!

        const hash: string = md5(`${user.id}`)
        const string = hash
            .split("")
            .filter((e: any) => !isNaN(e))
            .join("");
        const percent = parseInt(string.substring(0, 2), 10);

        if (args[0] == "me") {
            channel.send({ content: `🤔 Hmmm... I rate the user **${user.username}** a ${percent}/100! ${percent >= 50 ? "❤️" : "💔"}`, allowedMentions: { parse: [] } })
            return
        }

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
                            targetName = firstResult.user.username;
                        } else {
                            await no()
                        }
                    });
            }
        } else {
            return "Argument <user> should be at least 2 characters long!";
        }

        if (isNaN(parseInt(target))) return

        if (target == user.id) {
            const reply = { content: `🤔 Hmmm... I rate the user **${targetName}** a ${percent}/100! ${percent >= 50 ? "❤️" : "💔"}`, allowedMentions: { parse: [] } }
            if (message) {
                channel.send(reply)
            } else {
                msgInt.reply(reply)
            }
            return
        }

        const hash1: string = md5(`${target}`)
        const string1 = hash1
            .split("")
            .filter((e: any) => !isNaN(e))
            .join("");
        const percent1 = parseInt(string1.substring(0, 2), 10);

        const reply = { content: `🤔 Hmmm... I rate the user **${targetName}** a ${percent1}/100! ${percent1 >= 50 ? "❤️" : "💔"}`, allowedMentions: { parse: [] } }

        if (message) {
            channel.send(reply)
        } else {
            msgInt.reply(reply)
        }
    },
} as ICommand;
