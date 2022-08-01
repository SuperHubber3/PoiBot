import { ICommand } from "wokcommands";
import { Collection, GuildMember, Interaction, Message, MessageActionRow, MessageButton } from "discord.js";

export default {
    name: "kiss",
    category: "Anime",
    description: "Kiss someone!",
    slash: "both",
    guildOnly: true,
    testOnly: false,
	ownerOnly: true,
    expectedArgs: "<USER>",
    minArgs: 1,
    maxArgs: 1,
    cooldown: '15s',
    syntaxError: {
        "<USER>": 'Incorrect usage! Please use "{PREFIX}kiss {ARGUMENTS}"',
    },
    options: [
        { name: "user", description: "User to kiss", type: "USER", required: true },
    ],

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
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("ok")
                    .setEmoji("👌")
                    .setLabel("Yes")
                    .setStyle("SUCCESS")
            )
            .addComponents(
                new MessageButton()
                    .setCustomId("not_ok")
                    .setEmoji("⛔")
                    .setLabel("Oh hell nah")
                    .setStyle("DANGER")
            );

        let msg: Message<boolean>;
        let timeout: NodeJS.Timeout;
        const content = `Hey <@${target}>, looks like <@${user.id}> wants to kiss you!`
        if (message) {
            msg = await channel.send({
                content,
                components: [row],
            })
            timeout = setTimeout(() => {
                msg.delete().catch((err) => { console.error(err) })
            }, 1000 * 15);
        } else if (msgInt) {
            await msgInt.reply({
                content,
                components: [row],
            })
            timeout = setTimeout(() => {
                msgInt.deleteReply().catch((err) => { console.error(err) })
            }, 1000 * 15);
        }

        const filter = (interaction: Interaction) =>
            interaction.user.id === target;

        const collector = channel.createMessageComponentCollector({
            filter,
            max: 10,
            time: 1000 * 15,
        });

        collector.on("collect", async (collected) => {
            if (collected.user.id !== target) return
            if (collected.customId === "ok") {
                clearTimeout(timeout)
                const reply = `<@${user.id}> kisses <@${target}>`;
                if (message) {
                    await msg.edit({
                        content: reply,
                        components: [],
                    });
                    return;
                }
                await msgInt.editReply({
                    content: reply,
                    components: [],
                });
            } else if (collected.customId === "not_ok") {
                clearTimeout(timeout)
                const reply = `<@${target}> doesn't wants to get kissed 👎`;
                if (message) {
                    await msg.edit({
                        content: reply,
                        components: [],
                    });
                    return;
                }
                await msgInt.editReply({
                    content: reply,
                    components: [],
                });
            }
        });

        // collector.on("end", async (collection) => {
        //     collection.forEach(async (click) => {
        //         console.log(click.user.id, click.customId);
        //     });
        // });
    },
} as ICommand;
