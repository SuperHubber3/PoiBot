import { ICommand } from 'wokcommands'
import { Collection, GuildMember, MessageEmbed } from "discord.js";
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';
import { addGeh } from '../../functions/counters';

export default {
    name: 'geh',
    category: 'Anime',
    description: "Helly's second name",
    slash: 'both',
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<USER>',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        '<USER>': 'Incorrect usage! Please use "{PREFIX}geh {ARGUMENTS}"'
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

        let mediaString = (new MediaService(CommandType.Geh)).getMedia()
        const gehs = await addGeh(guild!.id, user.id, target, message)
        let text = `That's ${gehs} hugs now!`
        if (gehs == 1) text = `Their first geh from you!`
        const embed = new MessageEmbed({ footer: { text } })
            .setColor("RANDOM")
            .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
            .setDescription(`<@${user.id}> asks why <@${target}> is so geh!`)
            .setImage(mediaString)

        return embed
    },
} as ICommand