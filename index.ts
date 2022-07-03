import DiscordJS, { Intents } from "discord.js";
import WOKCommands from "wokcommands";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// This is for testing only!
// process.on('uncaughtException', function (err) {
//     console.error(err);
//     console.log("Node NOT Exiting...");
// });

const client = new DiscordJS.Client({
    // These are new in v13 nothing crazy lol
    intents: [
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_TYPING,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_MESSAGE_TYPING,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_INVITES,
        Intents.FLAGS.GUILD_BANS,
        Intents.FLAGS.GUILD_INTEGRATIONS,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.GUILD_WEBHOOKS,
    ],
});

client.on("ready", async () => {
    console.log("PoiBot Online");
    new WOKCommands(client, {
        commandsDir: path.join(__dirname, "commands"), // We put commands to this folder
        featuresDir: path.join(__dirname, "features"), // We put features to this folder
        typeScript: true,
        ignoreBots: true,
        // mongoUri: process.env.MONGO_URI, // We will use this later
        // dbOptions: {
        //     keepAlive: true
        // },
        botOwners: ["338760814884290562", "193749488135962625"], // Our discord IDs
        testServers: ["993084390722772992"],
        debug: true,
    })
        .setDefaultPrefix("poi") // poi hug foga
        .setCategorySettings([
            {
                name: "Anime",
                emoji: "807590056445345813", // I don't think this is working but if it is working we should find a good emoji
                customEmoji: true,
            },
        ]);
});

client.login(process.env.DISCORD_TOKEN);
