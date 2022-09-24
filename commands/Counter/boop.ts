import { Collection, GuildMember } from "discord.js";
import { ICommand } from "wokcommands";
import { addBoop } from "../../functions/counters";

export default {
    name: "boop",
    category: "Counter",
    description: "Boop someone!",
    slash: "both",
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`boop {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to boop", type: "USER", required: true },
    ],

    callback: async ({ message, interaction: msgInt, guild, user, args, channel }) => {
        if (args[0] == "razor") {
            const boops = await addBoop(guild!.id, user.id, "555484255363530782", message)
            let content = `You gave <@555484255363530782> a boop! That's ${boops} boops now!`
            if (boops == 1) content = `You gave <@555484255363530782> a boop! Their first boop from you!`
            message.reply({ content, allowedMentions: { parse: [] } });
            return;
        }
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

        const boops = await addBoop(guild!.id, user.id, target, message)
        let content = `You gave <@${target}> a boop! That's ${boops} boops now!`
        if (boops == 1) content = `You gave <@${target}> a boop! Their first boop from you!`
        if (message) {
            message.reply({ content, allowedMentions: { parse: [] } });
            return;
        }
        msgInt.reply({ content, allowedMentions: { parse: [] } });
    },
} as ICommand;
