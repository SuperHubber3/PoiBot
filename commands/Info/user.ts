import { Collection, GuildMember, MessageEmbed } from 'discord.js';
import { ICommand } from 'wokcommands'

export default {
  name: 'user',
  category: 'Info',
  description: 'Displays information of a users account',
  slash: 'both',
  minArgs: 0,
  maxArgs: 1,
  expectedArgs: '<USER>',
  guildOnly: true,
  testOnly: false,
  syntaxError: {
    '<USER>': 'Incorrect usage! Please use "{PREFIX}geh {ARGUMENTS}"'
  },
  options: [{ name: 'user', description: 'User', type: 'USER' }],

  callback: async ({ message, guild, channel, interaction: msgInt, user, args }) => {
    user = msgInt?.options.getUser("user") || user;
    let interactionUser = msgInt?.options.getUser("user")?.username || args[0] || user.username;
    let firstResult: GuildMember | undefined
    let replyMessage = {}

    if (interactionUser.length >= 2) {
      if (isNaN(parseInt(interactionUser))) {
        await guild?.members.search({ 'query': interactionUser }).then(async (result: Collection<string, GuildMember>) => {
          firstResult = result.first()
          const member = guild!.members.cache.get(firstResult!.id) as GuildMember

          let str = ``;
          const roles = member.roles.cache;
          let counter = 0;
          roles.forEach((key) => {
            str += `${key},`;
          })
          const one = str.split(",");
          one.pop();
          let text = "";
          for (const key in one) {
            let value = one[key];
            text += `${value}, `;
            counter++;
          }
          const ntext = text.slice(0, -2);

          if (firstResult) {
            const embed = new MessageEmbed({ author: { name: `User info for ${member.user.username}` } })
              .setThumbnail(member.user.displayAvatarURL())
              .addFields(
                {
                  name: "User Tag",
                  value: member.user.tag,
                  inline: true
                },
                {
                  name: "Nickname",
                  value: member.nickname || "None",
                  inline: true
                },
                {
                  name: '\u200b',
                  value: '\u200b',
                  inline: true
                },
                {
                  name: "Joined Discord",
                  value: new Date(member.user.createdTimestamp).toLocaleDateString(),
                  inline: true
                },
                {
                  name: "Joined Server",
                  value: new Date(member.joinedTimestamp!).toLocaleDateString(),
                  inline: true
                },
                {
                  name: "Is Bot",
                  value: `${member.user.bot}`,
                  inline: true
                },
                {
                  name: `Roles [${counter}]:`,
                  value: ntext || "None"
                }
              )
            replyMessage = { embeds: [embed] }
          } else {
            replyMessage = { content: 'User ' + interactionUser + ' not found!' }
          }
        })
      } else {
        replyMessage = { content: 'Argument <user> should be at least 2 characters long!' }
      }

      if (message) {
        channel.send(replyMessage)
        return;
      }

      msgInt.reply(replyMessage)
    }
  },
} as ICommand