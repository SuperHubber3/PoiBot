import { Client } from 'discord.js'
import counterSchema from '../models/command-counter-schema'
const wait = require('util').promisify(setTimeout);

const boopsCache = {} as { [key: string]: number }
const hugsCache = {} as { [key: string]: number }
const punchesCache = {} as { [key: string]: number }
const gehsCache = {} as { [key: string]: number }

export default (client: Client) => { }

export const addBoop = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let boopCount = 1
    counterSchema.findOne({
        guildId,
        userId,
    }, async function (err: any, schema: any) {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                boops: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const boops = schema.boops;
        const index = boops.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            boops.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            boops[index].count += 1;
            boopCount = boops[index].count + 1
        }
        schema.boops = boops;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    }
    )
    await wait(1000); // this wait is sus if you can find another way to do it, it will be nice

    boopsCache[`${guildId}-${userId}`] = boopCount;
    return boopCount;
};

export const getBoop = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = boopsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let boops = 0;
    if (result) {
        result.boops.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                boops = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            boops: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    boopsCache[`${guildId}-${userId}`] = boops;

    return boops;
};

export const addHug = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let hugCount = 1
    counterSchema.findOne({
        guildId,
        userId,
    }, async function (err: any, schema: any) {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                hugs: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const hugs = schema.hugs;
        const index = hugs.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            hugs.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            hugs[index].count += 1;
            hugCount = hugs[index].count
        }
        schema.hugs = hugs;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    }
    )
    await wait(1000); // this wait is sus if you can find another way to do it, it will be nice

    hugsCache[`${guildId}-${userId}`] = hugCount;
    return hugCount;
};

export const getHug = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = hugsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let hugs = 0;
    if (result) {
        result.hugs.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                hugs = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            hugs: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    hugsCache[`${guildId}-${userId}`] = hugs;

    return hugs;
};

export const addPunch = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let punchCount = 1
    counterSchema.findOne({
        guildId,
        userId,
    }, async function (err: any, schema: any) {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                punches: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const punches = schema.punches;
        const index = punches.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            punches.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            punches[index].count += 1;
            punchCount = punches[index].count
        }
        schema.punches = punches;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    }
    )
    await wait(1000); // this wait is sus if you can find another way to do it, it will be nice

    punchesCache[`${guildId}-${userId}`] = punchCount;
    return punchCount;
};

export const getPunch = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = punchesCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let punches = 0;
    if (result) {
        result.punches.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                punches = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            punches: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    punchesCache[`${guildId}-${userId}`] = punches;

    return punches;
};

export const addGeh = async (guildId: string, userId: string, partnerId: string) => {
    console.log("Running findOneAndUpdate()");
    let gehCount = 1
    counterSchema.findOne({
        guildId,
        userId,
    }, async function (err: any, schema: any) {
        if (!schema) {
            schema = new counterSchema({
                guildId,
                userId,
                gehs: [{
                    userId: partnerId,
                    count: 1,
                }],
            });
            return schema.save(function (err: any) {
                if (err) throw err;
            });
        }
        const gehs = schema.gehs;
        const index = gehs.findIndex((x: any) => x.userId === partnerId);
        if (index === -1) {
            gehs.push({
                userId: partnerId,
                count: 1,
            });
        } else {
            gehs[index].count += 1;
            gehCount = gehs[index].count
        }
        schema.gehs = gehs;
        return schema.save(function (err: any) {
            if (err) throw err;
        });
    }
    )
    await wait(1000); // this wait is sus if you can find another way to do it, it will be nice

    gehsCache[`${guildId}-${userId}`] = gehCount;
    return gehCount;
};

export const getGeh = async (guildId: string, userId: string, partnerId: string) => {
    const cachedValue = gehsCache[`${guildId}-${userId}`];
    if (cachedValue) {
        return cachedValue;
    }

    console.log("Running findOne()");

    const result = await counterSchema.findOne({
        guildId,
        userId,
    });

    let gehs = 0;
    if (result) {
        result.gehs.forEach(async (element: { userId: string, count: number }) => {
            if (element.userId === partnerId) {
                gehs = element.count
            }
        });
    } else {
        console.log("Inserting a document");
        await new counterSchema({
            guildId,
            userId,
            gehs: [{
                userId: partnerId,
                count: 0
            }]
        }).save();
    }

    gehsCache[`${guildId}-${userId}`] = gehs;

    return gehs;
};

export const config = {
    displayName: 'Command Counters',
    dbName: 'COUNTERS',
}