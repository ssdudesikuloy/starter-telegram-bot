var http = require("http");
http.createServer(function (req, res) {
    res.writeHead(200, {
        "Content-Type": "text/plain",
    });
    res.write("Hello World!");
    res.end();
}).listen(8050);

const { default: makeWASocket, isRealMessage, fetchLatestBaileysVersion, useMultiFileAuthState, DisconnectReason, Browsers, jidNormalizedUser, delay, makeInMemoryStore, getContentType, makeCacheableSignalKeyStore } = require("baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const { serialize } = require("./lib/serialize.js");
const { imageToWebp, videoToWebp } = require("./lib/ezgif.js");
const FileType = require("file-type");
const Jimp = require("jimp");
const { apk4all } = require("./lib/apk4all.js");
const { drive } = require("./lib/gdrive/gdrive.js");
const prettyBytes = require("pretty-bytes");
const fs = require("fs");

var react = JSON.parse(fs.readFileSync("./random/reactList.json"));
const store = makeInMemoryStore({});
const logger = pino({ level: "silent" });
var timerE = {};

const connect = async (sessionName) => {
    const { state, saveCreds } = await useMultiFileAuthState(`./session/${sessionName}`);
    const { version } = await fetchLatestBaileysVersion();

    const client = makeWASocket({
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        browser: Browsers.macOS("Desktop"),
        version,
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg.message || undefined;
            }
            return {
                conversation: "Hello!!",
            };
        },
    });

    store.bind(client.ev);

    client.ev.on("connection.update", async (up) => {
        const { lastDisconnect, connection, qr } = up;
        if (connection) {
            console.log(`Connection Status: ${connection}`);
        }

        connection == "open" && (await client.sendPresenceUpdate("unavailable"));

        if (connection === "close") {
            let reason = new Boom(lastDisconnect.error).output.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log(`Device Logged Out, Please Delete ./session/${sessionName} and Scan Again.`);
                client.logout();
            } else if (reason != DisconnectReason.loggedOut) {
                console.log("Restarting...");
                connect(sessionName);
            } else {
                client.end(new Error(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`));
                connect(sessionName);
            }
        }
    });

    // messages.upsert
    client.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type == "append") return;
        for (let msg of messages) {
            if (msg?.key?.remoteJid == "status@broadcast") return; // await client.readMessages([msg?.key]);
            if (!msg.message) return;
            // let unix = Math.floor(new Date().getTime() / 1000);
            // if (unix - msg.messageTimestamp >= 5) return;
            let m = await serialize({ ...msg }, client);

            // "🌷"
            // "🌺"

            if (!m.isSelf) return;
            let command = m.body?.startsWith(".") ? m.body.replace(".", "").trim().split(/ +/).shift().toLowerCase() : "";
            let args = m.body?.trim().split(/ +/).slice(1);
            console.log(command);

            switch (command) {
                case "m": {
                    m.reply("s, sp, spf, gu, c");
                    break;
                }
                case "s": {
                    let buffer = await (m.quoted || m).download();
                    var filetype = await FileType.fromBuffer(buffer);

                    if (filetype.mime.includes("image/")) {
                        var url = await imageToWebp(buffer, filetype.ext);
                        client.sendMessage(m.from, {
                            sticker: {
                                url,
                            },
                        });
                    } else if (filetype.mime.includes("video/")) {
                        var url = await videoToWebp(buffer);
                        client.sendMessage(m.from, {
                            sticker: {
                                url,
                            },
                        });
                    } else if (m.typeCheck.isSticker || m.typeCheck.isQuotedSticker) {
                        client.sendMessage(m.from, {
                            sticker: buffer,
                        });
                    }
                    break;
                }
                case "sp": {
                    var res = await (m.quoted || m).download();
                    if (!Buffer.isBuffer(res)) return;
                    res = await reSize(res, 720, 720);
                    await client.query({
                        tag: "iq",
                        attrs: {
                            to: jidNormalizedUser(client.user.id),
                            type: "set",
                            xmlns: "w:profile:picture",
                        },
                        content: [
                            {
                                tag: "picture",
                                attrs: {
                                    type: "image",
                                },
                                content: res,
                            },
                        ],
                    });
                    break;
                }
                case "spf": {
                    var res = await (m.quoted || m).download();
                    if (!Buffer.isBuffer(res)) return;
                    res = await reSize(res, 1280, 720);
                    await client.query({
                        tag: "iq",
                        attrs: {
                            to: jidNormalizedUser(client.user.id),
                            type: "set",
                            xmlns: "w:profile:picture",
                        },
                        content: [
                            {
                                tag: "picture",
                                attrs: {
                                    type: "image",
                                },
                                content: res,
                            },
                        ],
                    });
                    break;
                }
                case "gu": {
                    let text = args[0];
                    if (!text) return;
                    let res = await (m.quoted || m).download();
                    if (!Buffer.isBuffer(res)) return;
                    res = await (await drive()).uploadFiles(text, res);
                    let disk = await (await drive()).about();
                    text = [`*usage:*`, ``, `  *❐ Storage:* ${prettyBytes(Number(disk.storageQuota.limit))}`, `  *❐ Usage:* ${prettyBytes(Number(disk.storageQuota.usage))}`, `  *❐ Trash:* ${prettyBytes(Number(disk.storageQuota.usageInDriveTrash))}`, ``, `*uploaded:*`, ``, `  *❐ Link:* https://s.id/ozan-gdrive`, `\n.`].join("\n");
                    m.reply(text);
                    break;
                }
                case "c": {
                    let buff = await (m.quoted || m).download();
                    if (!Buffer.isBuffer(buff)) return;
                    let type = await FileType.fromBuffer(buff).catch(() => {});
                    let media = type.mime.split("/")[0];
                    if (!(media == "image" || media == "video")) return;
                    if (media == "video") type.mime = "video/mp4";
                    await client.sendMessage(m.from, { [media]: buff, caption: m.body ? m.body.replace(".c ", "") : "" });
                    break;
                }
            }
        }
    });
    client.ev.on("creds.update", saveCreds);
};

connect("ozan");

async function reSize(media, h, w) {
    const jimp = await Jimp.read(media);
    const min = jimp.getWidth();
    const max = jimp.getHeight();
    const cropped = jimp.crop(0, 0, min, max);
    return await cropped.scaleToFit(h, w).getBufferAsync(Jimp.MIME_JPEG);
}
