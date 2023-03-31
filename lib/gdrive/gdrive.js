const fs = require("fs").promises;
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const prettyBytes = require("pretty-bytes");
const { fromBuffer } = require("file-type");
const { Readable } = require("stream");

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: "authorized_user",
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

async function drive() {
    const authClient = await authorize();
    const drives = google.drive({ version: "v3", auth: authClient });
    return {
        about: async () => {
            let list = (await drives.about.get({ fields: "storageQuota" })).data;
            return list;
            // return [
            //     `usage:`,
            //     ``,
            //     `  ❐ Storage: ${prettyBytes(Number(list.storageQuota.limit))}`,
            //     `  ❐ Usage: ${prettyBytes(Number(list.storageQuota.usage))}`,
            //     `  ❐ Trash: ${prettyBytes(Number(list.storageQuota.usageInDriveTrash))}`
            // ].join('\n')
        },
        listFiles: async () => {
            let list = (
                await drives.files.list({
                    fields: "*",
                })
            ).data;
            list = list.files.filter((p) => p.parents[0] == "1WYmMSkq40Psonpd6KyLqKHHOFYLhj6kf");
            return list;
        },
        uploadFiles: async (name, buffer) => {
            let { ext, mime } = await fromBuffer(buffer);
            // name = `${name}.${name.endsWith(`.${ext}`) ? "" : `.${ext}`}`;
            name = name.includes(".") ? name : `${name}.${ext}`;
            let exist = false;
            for (let i of await (await drive()).listFiles()) {
                if (i.name == name) {
                    exist = i.id;
                    break;
                }
            }
            let list = drives.files[exist ? "update" : "create"]({
                fields: "*",
                [exist ? "fileId" : "aku"]: exist,
                media: {
                    body: Readable.from(buffer),
                },
                requestBody: {
                    name: name,
                    mimeType: mime,
                    [[exist ? "aku" : "parents"]]: ["1WYmMSkq40Psonpd6KyLqKHHOFYLhj6kf"],
                },
            });
            return list;
        },
        deleteFiles: async (fileId) => {
            let list = await drives.files.delete({
                fileId,
            });
            return list;
        },
    };
}

// drive().then(async (p) => console.log(await p.uploadFiles("img", await fs.readFile(__dirname + "/../../media/photo-1606107557195-0e29a4b5b4aa.jpg"))));
// drive().then(async (p) => console.log(await p.deleteFiles("1GKaF1qhqA_kgU1ADidQL9LnYB3FMpVDo")));

module.exports = { drive };
