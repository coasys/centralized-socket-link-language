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

    test("Join room", (done) => {
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
            console.log('meow')
            expect(arg.status).toBe("Ok");
            done();
        });
    });
})