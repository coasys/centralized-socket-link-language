const startSocketServer = require('./index')
const ioc = require('socket.io-client');

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(() => {resolve()}, ms));
}

describe("Test", () => {
    let io, clientSocket;

    const channelId = "languageID2"
    
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

    test("Commit and Sync", (done) => {
        const time = Date.now();

        const commitData = {
            "additions": [{
                "author": "did:test-sync1",
                "timestamp": time,
                "data": {
                    "source": "test-sync",
                    "predicate": "test-sync",
                    "target": "test-sync"
                }
            }],
            "removals": [],
            "linkLanguageUUID": "languageID2",
            "did": "did:test-sync1",
            "roomId": channelId
        };

        // User 1 commits a message
        clientSocket.emit("commit", commitData);

        clientSocket.on("commit-status", (arg) => {
            expect(arg.status).toBe("Ok");

            // After the commit, another user connects and calls sync
            const clientSocket2 = ioc(`http://localhost:3000`);

            clientSocket2.on("connect", () => {
                clientSocket2.emit("join-room", channelId);
                clientSocket2.emit("update-sync-state", { linkLanguageUUID: "languageID2", date: time, did: "did:test-sync2" });
                clientSocket2.emit("sync", {
                    "linkLanguageUUID": "languageID2",
                    "did": "did:test-sync2",
                    // timestamp: time
                });
            });

            clientSocket2.on("sync-emit", (data) => {
                expect(data.payload.additions).toEqual([commitData.additions[0]]);
                clientSocket2.disconnect();
                done();
            });
        });
    });

    test("Commit and Signal", (done) => {
        const channelId = "languageID3";
        const commitData = {
            "additions": [{
                "author": "did:test-signal1",
                "timestamp": Date.now(),
                "data": {
                    "source": "test-signal",
                    "predicate": "test-signal",
                    "target": "test-signal"
                }
            }],
            "removals": [],
            "linkLanguageUUID": "languageID3",
            "did": "did:test-signal1",
            "roomId": channelId
        };

        // Another user connects and listens to signal
        const clientSocket2 = ioc(`http://localhost:3000`);

        clientSocket2.on("connect", () => {
            clientSocket2.emit("join-room", channelId);

            // User 1 commits a message
            clientSocket.emit("commit", commitData);

            clientSocket2.on("signal", (data) => {
                expect(data.payload.additions).toEqual([commitData.additions[0]]);
                clientSocket2.disconnect();
                done();
            });
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
});
