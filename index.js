import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

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

const hashes = new Map();

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

// Set up a simple timestamp function for prettier logs
const timestamp = () => `[${new Date().toISOString()}]`;

io.on("connection", function (socket) {
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

    // Broadcast a message to a specific room (unique ID)
    socket.on("broadcast", function ({ roomId, signal }) {
        console.log(`Broadcasting to room ${roomId}: ${signal}`);
        io.to(roomId).emit("signal", signal);
    });

    socket.on("receive", function (msg) {
        console.log("socket received something hash related");
        hashes.set(socket.id, msg);
    });

    socket.on("commit", async ({ additions, removals, linkLanguageUUID, did }) => {
        let currentActiveRevisionHash = null;
        let currentActiveRevisionTimestamp = null;

        if (removals.length > 0) {
            const updatePromises = removals.map((removal) => {
                return Link.update({ Removed: true }, {
                    where: { Link: JSON.stringify(removal) }
                });
            });

            try {
                const results = await Promise.all(updatePromises);
                console.log('Updates successful:', results);
            } catch (error) {
                console.error('Error updating records:', error);
            }

            const removal = removals[removals.length - 1];
            currentActiveRevisionHash = hash(removal.data, removal.author, removal.timestamp);
            currentActiveRevisionTimestamp = removal.timestamp;
        }

        if (additions.length > 0) {
            const results = await Link.bulkCreate(additions.map((addition) => ({
                LinkLanguageUUID: 'your_link_language_uuid', // Replace with your actual value
                Hash: hash(addition.data, addition.author, addition.timestamp),
                Link: JSON.stringify(addition),
                DID: addition.author,
                LinkTimestamp: addition.timestamp,
            })));

            const addition = additions[additions.length - 1];
            currentActiveRevisionHash = hash(addition.data, addition.author, addition.timestamp);
            currentActiveRevisionTimestamp = addition.timestamp;
        }

        await AgentSyncState.upsert({
            DID: did,
            LinkLanguageUUID: LinkLanguageUUID,
            HASH: currentActiveRevisionHash,
            Timestamp: currentActiveRevisionTimestamp,
        }, {
            fields: ['DID', 'LinkLanguageUUID', 'HASH', 'Timestamp'],
        });

        const results = await AgentSyncState.findAll({
            where: {
                DID: did,
                LinkLanguageUUID: LinkLanguageUUID,
            },
        });

        socket.emit("commit-results", {
            hash: results[0].Hash,
            timestamp: results[0].Timestamp
        })
    })

    socket.on("sync", async ({ linkLanguageUUID, did, timestamp }) => {
        try {
            // If timestamp is not provided, retrieve it from AgentSyncState
            if (!timestamp) {
                const agentSyncStateResult = await AgentSyncState.findAll({
                    where: {
                        DID: did,
                        LinkLanguageUUID: LinkLanguageUUID,
                    },
                });

                timestamp = agentSyncStateResult[0]?.Timestamp;
            }

            // Retrieve records from Links
            const results = await Links.findAll({
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

            socket.emit("sync-result", value)
        } catch (error) {
            console.error('Error retrieving links:', error);
        }
    })

    socket.on("render", async ({ linkLanguageUUID }) => {
        const results = await Links.findAll({
            where: {
                LinkLanguageUUID: LinkLanguageUUID,
            },
        });

        const finalResult = results.map((r) => JSON.parse(r.Link))

        socket.emit("render-emit", finalResult);
    })


});

server.listen(3000, () => {
    console.log("server running at http://localhost:3000");
});