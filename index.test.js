const startSocketServer = require('./index')
const ioc = require('socket.io-client');

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(() => {resolve()}, ms));
}

describe("Test", () => {
    let io, clientSocket;

    const channelId = "test"
    
    beforeAll(async () => {
        io = startSocketServer();
        
        await sleep(2000);

        clientSocket = ioc(`http://localhost:3000`);
    })

    afterAll(() => {
        io.close();
        clientSocket.disconnect();
    });

    test("Commit test", (done) => {
        clientSocket.emit("join-room", channelId);

        clientSocket.emit("commit", ({
            "additions": [{
                "author": "did:test1",
                "timestamp": 1697033597138,
                "data": {
                    "source": "test4",
                    "predicate": "test4",
                    "target": "test4"
                }
            }],
            "removals": [],
            "linkLanguageUUID": "languageID",
            "did": "did:test1",
            "rommId": channelId
        }))

        clientSocket.on("commit-status", (arg) => {
            expect(arg.status).toBe("Ok");
            done();
        });
    });

    test("Render test", (done) => {
        clientSocket.emit("join-room", channelId);

        clientSocket.emit("render", ({
            "linkLanguageUUID": "languageID",
        }))

        clientSocket.on("render-emit", (arg) => {
            expect(arg.payload.length).toBe(1);
            done();
        });
    });

    test("Sync test", (done) => {
        clientSocket.emit("join-room", channelId);

        clientSocket.emit("sync", ({
            "linkLanguageUUID": "languageID",
            "did": "did:test1",
            "timestamp": 1697033597138,
        }))

        clientSocket.on("sync-emit", (arg) => {
            console.log("wow", arg)
            expect(arg.payload.additions.length).toBe(1);
            expect(arg.payload.removals.length).toBe(0);
            done();
        });
    })
})