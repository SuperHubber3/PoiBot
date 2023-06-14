import { ICommand } from "wokcommands";

export default {
  name: "say",
  category: "Fun",
  description: "I will repeat your message!",
  slash: false,
  minArgs: 1,
  expectedArgs: '<text>',
  guildOnly: true,
  testOnly: false,
  globalCooldown: "3m",
  syntaxError: {
    'text': 'Incorrect usage! Use `{PREFIX}`say {ARGUMENTS}'
  },

  callback: async ({ guild, user, args, message }) => {
    let hidden = false
    if (args[args.length - 1] == "-hide") {
      hidden = true
      message.delete();
      args.pop()
    }
    let msg = args.join(" ")
    if (!msg) return;
    if (hidden) {
      msg = ":mega: " + msg
    }
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
