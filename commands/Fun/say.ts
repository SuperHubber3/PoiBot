import { ICommand } from "wokcommands";

export default {
    name: "say",
    category: "Fun",
    description: "I will repeat your message!",
    slash: false,
    guildOnly: true,
    testOnly: false,
    ownerOnly: true,

    callback: async ({ guild, user, args, message }) => {
        if (!args) return;
        message.delete();
        if (args.length > 2000) {
          const first = args.slice(0, 2000);
          const rest = args.slice(2000, args.length);
          message.channel.send(first);
          message.channel.send(rest);
          return;
        }
      message.channel.send(args);
    },
} as ICommand;
