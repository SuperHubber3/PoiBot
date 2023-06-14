import type { Client, Guild, User } from "discord.js";
//const dockyard = "735499671648206889"
const poisupport = "993084390722772992"

let cC = {} as { [key: string]: boolean }
const cc = (str: string) => {
    setTimeout(() => {
        cC[str] = false;
    }, 1000 * 60 * 5);
};

function sc(s: string) {
    cC[s] = true;
    cc(s);
};

function cd(m: string, c: string) {
    if (m == c) return true
    if (m.includes(" " + c)) return true
    if (m.includes(c + " ")) return true
};

export default (client: Client) => {
    // const TDown = client.guilds.cache.get(dockyard)?.emojis.cache.get("985288206851399740")!
    // const TUp = client.guilds.cache.get(dockyard)?.emojis.cache.get("985288207874801795")!
    // const momijiStare = client.guilds.cache.get(dockyard)?.emojis.cache.get("939199905874989116")!
    const sus = client.guilds.cache.get(poisupport)?.emojis.cache.get("1040228714602053643")!
    client.on("messageCreate", async (m) => {
        const { guild: g, author: a } = m
        if (!g) return
        const s = `${g.id}-${a.id}`
        if (cC[s]) return
        const c = m.content.toLowerCase();
        // if (c == "good bot") {
        //     m.react(TDown)
        //     sc(s)
        // } if (c == "bad bot") {
        //     m.react(TUp)
        //     sc(s)
        // } 
        if (c == "sus") {
            m.react(sus)
            sc(s)
        } if (cd(c, "forgor")) {
            m.react("💀")
            sc(s)
        }
    });
};

export const config = {
    displayName: 'Reaction Feature',
    dbName: 'REACTIONS',
}