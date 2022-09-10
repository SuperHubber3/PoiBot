import { ICommand } from "wokcommands";
import { Collection, GuildMember, MessageEmbed } from "discord.js"
import { MediaService } from '../../services/media.service';
import { CommandType } from '../../enums/command.enum';
import { addCuddle } from "../../functions/counters";

export default {
    name: "cuddle",
    category: "Counter",
    description: "Cuddle someone!",
    slash: "both",
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`cuddle {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to cuddle", type: "USER", required: true },
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
        if (isNaN(parseInt(target))) return
        if (target == user.id) return

        let mediaString = (new MediaService(CommandType.Cuddle)).getMedia()
        const bites = await addCuddle(guild!.id, user.id, target, message)
        let text = `That's ${bites} cuddles now!`
        if (bites == 1) text = `Their first cuddle from you!`

        const embed = new MessageEmbed({ footer: { text } })
            .setColor("RANDOM")
            .setTitle('You gave a cuddle!')
            .setURL('https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands')
            .setDescription(`*<@${user.id}> cuddles <@${target}>*`)
            .setImage(mediaString)

        return embed
    },
} as ICommand;
