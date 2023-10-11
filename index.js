const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize('sqlite::memory:');

const Link = sequelize.define('Link', {
    LinkID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Link: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkTimestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    Removed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
});

const AgentStatus = sequelize.define('AgentStatus', {
    DID: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Link: {
        type: DataTypes.JSON,
        allowNull: true, // Adjust as needed
    },
    StatusTimestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
});

const ActiveAgent = sequelize.define('ActiveAgent', {
    LinkID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
});

const AgentSyncState = sequelize.define('AgentSyncState', {
    ID: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    DID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    LinkLanguageUUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    Timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
    },
}, {
    uniqueKeys: {
        unique_constraint: {
            fields: ['DID', 'LinkLanguageUUID'],
        },
    },
});

Link.sync();
AgentStatus.sync();
ActiveAgent.sync();
AgentSyncState.sync();

function hash(data, author, timestamp) {
    console.log(data, author, timestamp)
    const mash = JSON.stringify(data, Object.keys(data).sort()) +
        JSON.stringify(author) + timestamp
    let hash = 0, i, chr;
    for (i = 0; i < mash.length; i++) {
        chr = mash.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function startSocketServer() {
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
        socket.on("update-sync-state", async ({ did, hash, date, linkLanguageUUID }) => {
            const results = await AgentSyncState.upsert(
                {DID: did, LinkLanguageUUID: linkLanguageUUID, StatusTimestamp: date, Hash: Hash}, {
                fields: ['DID', 'LinkLanguageUUID', 'Timestamp', 'HASH'],
            });
            console.log("updated sync state with result", results);
            io.to(connectionId).emit("update-sync-state-status", {status: "Ok"})
        })

        //Allows the client to save a commit to the server; and have that commit be signaled to all agents in the room
        socket.on("commit", async ({ additions, removals, linkLanguageUUID, did, roomId }) => {
            let commitServerTimestamp = new Date();

            if (removals.length > 0) {
                const updatePromises = removals.map((removal) => {
                    return Link.update({ Removed: true }, {
                        where: { Link: JSON.stringify(removal) }
                    });
                });

                try {
                    const results = await Promise.all(updatePromises);
                    console.log('Removal updates successful:', results);
                } catch (error) {
                    console.error('Error updating removal records:', error);
                }
            }

            if (additions.length > 0) {
                try {
                    const results = await Link.bulkCreate(additions.map((addition) => ({
                        LinkLanguageUUID: linkLanguageUUID,
                        Hash: hash(addition.data, addition.author, addition.timestamp),
                        Link: JSON.stringify(addition),
                        DID: addition.author,
                        LinkTimestamp: addition.timestamp,
                    })));
                    console.log('Addtion updates successful:', results);
                } catch (error) {
                    console.error('Error updating addition records:', error);
                }
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
                timestamp: commitServerTimestamp
            });
            
            //Tell the original client that it was recorded correctly
            io.to(connectionId).emit("commit-status", {
                status: "Ok",
                timestamp: commitServerTimestamp
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
                const results = await Link.findAll({
                    where: {
                        LinkLanguageUUID: linkLanguageUUID,
                        LinkTimestamp: {
                            [Sequelize.Op.gte]: timestamp,
                        },
                    },
                    order: [['LinkTimestamp', 'DESC']],
                });

                const value = {
                    additions: [],
                    removals: []
                }

                for (const result of results) {
                    if (result.Removed) {
                        value.removals.push(JSON.parse(result.Link))
                    } else {
                        value.additions.push(JSON.parse(result.Link))
                    }
                }

                //Only return the sync results to the connection id that requested it
                io.to(connectionId).emit("sync-emit", { payload: value })
            } catch (error) {
                console.error('Error retrieving links:', error);
            }
        })

        socket.on("render", async ({ linkLanguageUUID }) => {
            const results = await Link.findAll({
                where: {
                    LinkLanguageUUID: linkLanguageUUID,
                },
            });

            const finalResult = results.map((r) => JSON.parse(r.Link))

            io.to(connectionId).emit("render-emit", { payload: finalResult });
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