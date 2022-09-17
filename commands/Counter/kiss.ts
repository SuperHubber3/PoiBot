import { ICommand } from "wokcommands";
import { Collection, GuildMember, Interaction, Message, MessageActionRow, MessageButton, MessageEmbed } from "discord.js";
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';
import { addGeh } from '../../functions/counters';

export default {
    name: "kiss",
    category: "Counter",
    description: "Kiss someone!",
    slash: "both",
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: "<user>",
    cooldown: '30s',
    guildOnly: true,
    testOnly: false,
    ownerOnly: false,
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`kiss {ARGUMENTS}'
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
        if (isNaN(parseInt(target))) return
        if (target == user.id) return

        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("ok")
                    .setEmoji("👌")
                    .setLabel("Ok")
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
                allowedMentions: { parse: [] }
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
                let mediaString = (new MediaService(CommandType.Geh)).getMedia()
                const gehs = await addGeh(guild!.id, target, user.id, message)
                let text = `That's ${gehs} gehs now!`
                if (gehs == 1) text = `Their first geh from you!`
                const embed = new MessageEmbed({ footer: { text } })
                    .setColor("RANDOM")
                    .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
                    .setDescription(`<@${target}> asks why <@${user.id}> is so geh!`)
                    .setImage(mediaString)

                if (message) {
                    await msg.edit({
                        content: " ",
                        embeds: [embed],
                        components: [],
                    });
                    return;
                }
                await msgInt.editReply({
                    content: " ",
                    embeds: [embed],
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
