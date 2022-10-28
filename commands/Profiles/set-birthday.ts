import { Interaction, Message, MessageActionRow, MessageButton, MessageCollector, MessageEmbed, TextChannel } from 'discord.js';
import { ICommand } from 'wokcommands'
import moment from 'moment';
import { setBd, getBd } from '../../functions/counters';

export default {
    name: 'birthday',
    category: 'Profiles',
    description: 'You are getting older!',
    aliases: ["bd"],
    slash: 'both',
    guildOnly: true,
    testOnly: false,

    callback: async ({ guild, user, message, interaction: msgInt, channel }) => {
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("set")
                    .setEmoji("📆")
                    .setLabel("Set Birthday")
                    .setStyle("SUCCESS")
            )

        const bd: Date = await getBd(guild!.id, user.id)

        const embed = new MessageEmbed()
            .setTitle("VEry c00l c<:hoshinO:808799248908156928>mmand")
            .addField("Your Birthday", bd ? `${bd.getDate()}` + "/" + `${bd.getMonth() + 1}` : "No Birthday Set")
            .setFooter({ text: `${user.tag}`, iconURL: user.displayAvatarURL() })
            .setTimestamp()

        let msg: Message<boolean>;
        if (message) {
            msg = await channel.send({
                embeds: [embed],
                components: [row],
                allowedMentions: { parse: [] }
            })
        } else if (msgInt) {
            await msgInt.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            })
        }

        const filter = (interaction: Interaction) =>
            interaction.user.id === user.id;

        const collector = channel.createMessageComponentCollector({
            filter,
            max: 1,
            time: 1000 * 45,
        });

        collector.on("end", async (collection) => {
            if (collection.first()?.customId === 'set') {
                const reply = `Please type your birthday like this: "DD/MM"`;
                let failCount = 0
                let isSuccessful = false
                if (message) {
                    await msg.edit({
                        content: reply,
                        components: [],
                        embeds: []
                    });
                    const filter = (m: Message) => message.author.id === m.author.id;
                    const collector = new MessageCollector(message.channel, {
                        filter,
                        max: 2,
                        time: 1000 * 45,
                    });
                    collector.on("collect", async (m) => {
                        m.content = m.content + "/2000"
                        const dateMomentObject = moment(m.content, "DD/MM/YYYY", true);
                        if (!dateMomentObject.isValid()) {
                            m.delete()
                            await msg.edit("Please specify a valid date. Type a date to try again.").catch((err) => { console.error(err) })
                            failCount++
                            return
                        }
                        const dateObject = dateMomentObject.toDate();
                        if (!dateObject) {
                            m.delete()
                            await msg.edit("Please specify a valid date. Type a date to try again.").catch((err) => { console.error(err) })
                            failCount++
                            return
                        }
                        collector.stop();
                        m.delete().catch((err) => { console.error(err) })
                        message.delete().catch((err) => { console.error(err) })
                        setBd(guild!.id, user.id, dateObject)
                        isSuccessful = true
                        msg.edit("Birthday set!")
                            .then((a) => {
                                setTimeout(() => {
                                    a.delete().catch((err) => { console.error(err) })
                                }, 1000 * 5);
                            })
                    });
                    collector.on("end", (collected) => {
                        if (collected.size < 1) {
                            msg.edit("Command timed out.")
                                .then((a) => {
                                    setTimeout(() => {
                                        message.delete().catch((err) => { console.error(err) })
                                        a.delete().catch((err) => { console.error(err) })
                                    }, 1000 * 5);
                                })
                            return;
                        }
                        if (failCount > 0) {
                            msg.edit("Invalid date.")
                                .then((a) => {
                                    setTimeout(() => {
                                        if (isSuccessful) return
                                        message.delete().catch((err) => { console.error(err) })
                                        a.delete().catch((err) => { console.error(err) })
                                    }, 1000 * 5);
                                })
                        }
                    })
                    return;
                }
                await msgInt.editReply({
                    content: reply,
                    components: [],
                    embeds: []
                });
                const filter = (m: Message) => msgInt.user.id === m.author.id;
                const collector = new MessageCollector(msgInt.channel as TextChannel, {
                    filter,
                    max: 2,
                    time: 1000 * 45,
                });
                collector.on("collect", async (m) => {
                    m.content = m.content + "/2000"
                    const dateMomentObject = moment(m.content, "DD/MM/YYYY", true);
                    if (!dateMomentObject.isValid()) {
                        await msgInt.editReply("Please specify a valid date. Type a date to try again.")
                        failCount++
                        return
                    }
                    const dateObject = dateMomentObject.toDate();
                    if (!dateObject) {
                        await msgInt.editReply("Please specify a valid date. Type a date to try again.")
                        failCount++
                        return
                    }
                    collector.stop();
                    m.delete().catch((err) => { console.error(err) })
                    setBd(guild!.id, user.id, dateObject)
                    isSuccessful = true
                    msgInt.editReply("Birthday set!")
                });
                collector.on("end", () => {
                    if (failCount > 0) {
                        if (isSuccessful) return
                        msgInt.editReply("Invalid date.")
                    }
                })
                return;
            }
        });
    },
} as ICommand