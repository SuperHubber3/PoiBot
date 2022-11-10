import { ICommand } from "wokcommands";
import { Collection, GuildMember, MessageEmbed } from "discord.js"
import { addKill, getKill } from "../../functions/counters";

export default {
    name: "kill",
    category: "Fun",
    description: "Kill someone!",
    slash: "both",
    minArgs: 1,
    maxArgs: 1,
    expectedArgs: '<user>',
    guildOnly: true,
    testOnly: false,
    syntaxError: {
        'user': 'Incorrect usage! Use `{PREFIX}`kill {ARGUMENTS}'
    },
    options: [
        { name: "user", description: "User to kill", type: "USER", required: true },
    ],

    callback: async ({ message, interaction: msgInt, guild, user, args, channel, client }) => {
        let interactionUser = msgInt?.options.getUser("user")?.toString() || args[0];
        if (interactionUser.startsWith('<')) {
            interactionUser = interactionUser.substring(2)
            interactionUser = interactionUser.slice(0, -1)
        }
        let target: string = interactionUser
        let targetName: string = msgInt?.options.getUser("user")?.username! || (await client.users.fetch(interactionUser)).username

        if (args[0] == "me") {
            const embed = new MessageEmbed()
                .setDescription("❤️ You change your mind.")
            return embed
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
            const embed = new MessageEmbed()
                .setDescription("❤️ You change your mind.")
            return embed
        }

        const luckyGuy = client.guilds.cache.get("735499671648206889")!.members.cache.random()

        const luck = Math.ceil(Math.random() * 2);
        const goodLuck = [
            "🏹 *You shoot at {USR} piercing them with an arrow!*",
            "🗡 *You stab {USR} in the back of the heart!*",
            "💣 *You throw a bomb at {USR}* 💥💥💥",
            "🔫 *You shoot {USR} point blank. No remorse.*",
            "🔪 *Your blade digs deep into {USR}.*",
            "🔫 *You shoot at {USR} piercing them with bullets!*",
            "🔪 *{USR} struggles as your blade digs deep.*",
            "🪓 *You swing your axe at {USR} slicing them in half.*",
        ]
        const badLuck = [
            "🪓 *You drop your axe mid-swing, {USR} looks at you in shame.*",
            "🔫 *You're a terrible shot, shooting at everything but hitting nothing.*",
            "💣 *Your bomb fails to detonate, {USR} looks at you in shame.*",
            "🔪 *You lunge at {USR} but clearly misjudged the distance.*",
            "🗡 *You brought a knife to a gunfight, {USR} takes you out.*",
            `<:vyrnstare:807590123184717834> *You try to no-scope {USR} but you end up killing **${luckyGuy!.user.username}** instead.*`,
        ]
        let selectedString: string
        let kills: number
        let rival: number
        if (luck == 1) {
            let randomElement = Math.floor(Math.random() * goodLuck.length)
            selectedString = goodLuck[randomElement]
            kills = await addKill(guild!.id, user.id, target, message)
            rival = await getKill(guild!.id, target, user.id)
        } else {
            let randomElement = Math.floor(Math.random() * badLuck.length)
            selectedString = badLuck[randomElement]

            if (selectedString.startsWith("🗡")) {
                kills = await getKill(guild!.id, user.id, target)
                rival = await addKill(guild!.id, target, user.id, message)
            } else if (selectedString.startsWith("<:vyrnstare")) {
                kills = await addKill(guild!.id, user.id, luckyGuy!.user.id, message)
                rival = await getKill(guild!.id, luckyGuy!.user.id, user.id)
            } else {
                kills = await getKill(guild!.id, user.id, target)
                rival = await getKill(guild!.id, target, user.id)
            }
        }

        let text = selectedString.replace(/{USR}/g, `**${targetName}**`)

        if (selectedString.startsWith("<:vyrnstare")) targetName = luckyGuy!.user.username

        const embed = new MessageEmbed()
            .setColor("RANDOM")
            .setAuthor({
                name: `(${kills!}) ${user.username} ⚔️ ${targetName} (${rival!})`,
                url: 'https://discord.com/api/oauth2/authorize?client_id=993069924362760202&permissions=8&scope=bot%20applications.commands',
                iconURL: user.displayAvatarURL()
            })
            .setDescription(text)
        return embed
    },
} as ICommand;
