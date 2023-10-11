const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { Sequelize } = require("sequelize");
const { Diff, AgentStatus, ActiveAgent, AgentSyncState, initDatabase, sequelize } = require("./db.js");

async function startSocketServer() {
    await initDatabase();

    const app = express();

    const server = createServer(app);
    const io = new Server(server, {
        cors: {
            origin: "*",
        },
    });

    app.get("/", (req, res) => {
        res.send("<h1>Hello world</h1>");
    });

    // Set up a simple timestamp function for prettier logs
    const timestamp = () => `[${new Date().toISOString()}]`;

    io.on("connection", function (socket) {
        let connectionId = socket.id;

        console.log(`${timestamp()} New connection: ${socket.id}`);

        socket.on("disconnect", (reason) => {
            console.log(`${timestamp()} Socket ${socket.id} disconnected. Reason: ${reason}`);
        });

        socket.on("error", (error) => {
            console.error(`${timestamp()} Error on socket ${socket.id}: `, error);
        });

        // Join a specific room (Subscribe to a unique ID)
        socket.on("join-room", function (roomId) {
            socket.join(roomId);
            console.log(`Socket ${socket.id} joined room ${roomId}`);
        });

        // Leave a specific room (Unsubscribe from a unique ID)
        socket.on("leave-room", function (roomId) {
            socket.leave(roomId);
            console.log(`Socket ${socket.id} left room ${roomId}`);
        });

        // // Broadcast a message to a specific room (unique ID)
        // socket.on("broadcast", function ({ roomId, signal }) {
        //     console.log(`Broadcasting to room ${roomId}: ${signal}`);
        //     io.to(roomId).emit("signal", signal);
        // });

        //Allows for the client to tell the server that it received some data; and it can update its sync state to a given timestamp
        socket.on("update-sync-state", async ({ did, date, linkLanguageUUID }) => {
            const results = await AgentSyncState.upsert(
                {DID: did, LinkLanguageUUID: linkLanguageUUID, Timestamp: date}, {
                fields: ['DID', 'LinkLanguageUUID', 'Timestamp'],
            });
            console.log("updated sync state with result", results);
            io.to(connectionId).emit("update-sync-state-status", {status: "Ok"})
        })

        //Allows the client to save a commit to the server; and have that commit be signaled to all agents in the room
        socket.on("commit", async ({ additions, removals, linkLanguageUUID, did }) => {
            let serverRecordTimestamp = new Date();

            try {
                const results = await Diff.create({
                    LinkLanguageUUID: linkLanguageUUID,
                    DID: did,
                    Diff: {
                        additions: JSON.stringify(additions),
                        removals: JSON.stringify(removals)
                    },
                    ServerRecordTimestamp: serverRecordTimestamp,
                });
            } catch (error) {
                console.error('Error updating diff records:', error);
            }

            // await AgentSyncState.upsert({
            //     DID: did,
            //     LinkLanguageUUID: LinkLanguageUUID,
            //     HASH: currentActiveRevisionHash,
            //     Timestamp: currentActiveRevisionTimestamp,
            // }, {
            //     fields: ['DID', 'LinkLanguageUUID', 'HASH', 'Timestamp'],
            // });

            // const results = await AgentSyncState.findAll({
            //     where: {
            //         DID: did,
            //         LinkLanguageUUID: LinkLanguageUUID,
            //     },
            // });

            //Send a signal to all agents online in the link language with the commit data
            io.to(linkLanguageUUID).emit("signal", {
                payload: {
                    additions,
                    removals
                },
                serverRecordTimestamp
            });
            
            //Tell the original client that it was recorded correctly
            io.to(connectionId).emit("commit-status", {
                status: "Ok",
                serverRecordTimestamp
            });
        })

        //Allows an agent to sync the links since the last timestamp where they received links from
        socket.on("sync", async ({ linkLanguageUUID, did, timestamp }) => {
            try {
                // If timestamp is not provided, retrieve it from AgentSyncState
                if (!timestamp) {
                    const agentSyncStateResult = await AgentSyncState.findAll({
                        where: {
                            DID: did,
                            LinkLanguageUUID: linkLanguageUUID,
                        },
                    });

                    timestamp = agentSyncStateResult[0]?.Timestamp;
                }

                // Retrieve records from Links
                const results = await Diff.findAll({
                    where: {
                        LinkLanguageUUID: linkLanguageUUID,
                        ServerRecordTimestamp: {
                            [Sequelize.Op.gte]: timestamp,
                        },
                    },
                    order: [['ServerRecordTimestamp', 'DESC']],
                });

                const value = {
                    additions: [],
                    removals: []
                }

                for (const result of results) {
                    value.additions.push(...JSON.parse(result.Diff.additions));
                    value.removals.push(...JSON.parse(result.Diff.removals));
                }

                let serverRecordTimestamp;
                if (results.length > 0) {
                    serverRecordTimestamp = results[0]?.ServerRecordTimestamp;
                } else {
                    serverRecordTimestamp = null;
                }

                //Only return the sync results to the connection id that requested it
                io.to(connectionId).emit("sync-emit", { payload: value, serverRecordTimestamp })
            } catch (error) {
                console.error('Error retrieving links:', error);
            }
        })

        socket.on("render", async ({ linkLanguageUUID }) => {
            const results = await Diff.findAll({
                where: {
                    LinkLanguageUUID: linkLanguageUUID,
                },
            });

            const value = {
                additions: [],
                removals: []
            }

            for (const result of results) {
                value.additions.push(...JSON.parse(result.Diff.additions));
                value.removals.push(...JSON.parse(result.Diff.removals));
            }

            let serverRecordTimestamp;
            if (results.length > 0) {
                serverRecordTimestamp = results[0]?.ServerRecordTimestamp;
            } else {
                serverRecordTimestamp = null;
            }

            io.to(connectionId).emit("render-emit", { payload: value, serverRecordTimestamp });
        })
    });

    server.listen(3000, () => {
        console.log("server running at http://localhost:3000");
    });

    return io;
}

module.exports = startSocketServer;

if (require.main === module) {
    startSocketServer();
}