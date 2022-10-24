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
        const msg = args.join(" ")
        if (!msg) return;
        message.delete();
        if (msg.length > 2000) {
          const first = msg.slice(0, 2000);
          const rest = msg.slice(2000, msg.length);
          message.channel.send(first);
          message.channel.send(rest);
          return;
        }
      message.channel.send(msg);
    },
} as ICommand;
