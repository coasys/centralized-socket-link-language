const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { Sequelize } = require("sequelize");
const { Diff, AgentSyncState, initDatabase, AgentStatus, AgentExpression } = require("./db.js");

const onlineAgents = new Map();

async function startSocketServer() {
  await initDatabase();

  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  app.get("/", (req, res) => {
    res.send("<h1>Hello world</h1>");
  });

  app.get("/agent", async (req, res) => {
    const did = req.body.did;

    try {
      const { Expression } = await AgentExpression.findOne({
        where: {
          DID: did
        }
      });

      if (Expression) {
        return res.json({ expression: Expression })
      } else {
        return res.json({ expression: null })
      }
    } catch (e) {
      console.error("Error getting agent expression:", e);
      return res.json({ status: "Error" });
    }
  })

  app.post('/agent', async (req, res) => {
    const did = req.body.did;
    const expression = req.body.expression;

    try {
      const results = await AgentExpression.upsert({
        DID: did,
        Expression: expression,
        Timestamp: Date.now()
      })
  
      console.log("Added or Updated Agent Expression", results);
  
      return res.json({ status: "Ok" });
    } catch (e) {
      console.error("Error setting agent expression:", e);
      return res.json({ status: "Error" });
    }
  })

  app.post("/currentRevision", (req, res) => {
    //Fetch the agents SyncState given the DID and LinkLanguageUUID
    //If there is no record, return null
    //If there is a record, return timestamp

    //Get did and linkLanguageUuid from posted json
    const did = req.body.did;
    const linkLanguageUUID = req.body.linkLanguageUUID;

    AgentSyncState.findOne({
      where: {
        DID: did,
        LinkLanguageUUID: linkLanguageUUID,
      },
    }).then((syncState) => {
      if (syncState) {
        return res.json({ currentRevision: syncState.Timestamp });
      } else {
        return res.json({ currentRevision: null });
      }
    });
  });

  //Returns all agents who have ever interacted in a given link language uuid
  app.get("/getOthers", (req, res) => {
    //Get linkLanguageUUID from query params
    const linkLanguageUUID = req.query.linkLanguageUUID;

    //Get all agents in the link language
    //Return an array of all agents in the link language
    AgentSyncState.findAll({
      where: {
        LinkLanguageUUID: linkLanguageUUID,
      },
    }).then((syncStates) => {
      const others = syncStates.map((syncState) => syncState.DID);
      return res.json(others);
    });
  });

  //Sets the status for some given agent in a given link language
  app.post("/setAgentStatus", async (req, res) => {
    try {
      //Get did and linkLanguageUuid from posted json
      const did = req.body.did;
      const linkLanguageUUID = req.body.linkLanguageUUID;
      const status = req.body.status;

      const existingRecord = await AgentStatus.findOne({
        where: {
          DID: did,
          LinkLanguageUUID: linkLanguageUUID,
        },
      });

      if (existingRecord) {
        // Update the existing record
        await existingRecord.update({
          Status: status,
        });
        console.log("Record updated:", did, linkLanguageUUID, status);
      } else {
        const results = await AgentStatus.upsert({
          DID: did,
          LinkLanguageUUID: linkLanguageUUID,
          Status: status,
        });
        console.log("updated agent status with result", results);
      };
      return res.json({ status: "Ok" });
    } catch (e) {
      console.error("Error setting agent status:", e);
      return res.json({ status: "Error" });
    }
  });

  //Gets the status for all agents online from Map and their saved status from the database
  app.get("/getOnlineAgents", async (req, res) => {
    try {
      //Get linkLanguageUUID from query params
      const linkLanguageUUID = req.query.linkLanguageUUID;
      const requestAgentsDid = req.query.did;

      //Get all agents in the link language
      //Return an array of all agents in the link language
      const onlineAgentsInLinkLanguage = onlineAgents.get(linkLanguageUUID);

      if (!onlineAgentsInLinkLanguage) {
        return res.json([]);
      }

      //Filter out the agent who made the request
      const onlineAgentsInLinkLanguageFiltered = Array.from(onlineAgentsInLinkLanguage).filter((agent) => agent.did !== requestAgentsDid);

      //For each onlineAgent, get their status or if no status have status has null
      const onlineAgentsWithStatus = [];
      for (const onlineAgent of onlineAgentsInLinkLanguageFiltered) {
        const did = onlineAgent.did;
        const agentStatus = await AgentStatus.findOne({
          where: {
            DID: did,
            LinkLanguageUUID: linkLanguageUUID,
          },
        });

        if (agentStatus) {
          onlineAgentsWithStatus.push({
            did: did,
            status: agentStatus.Status,
          });
        } else {
          onlineAgentsWithStatus.push({
            did: did,
            status: null,
          });
        }
      }
      
      //Return the array of online agents with status
      return res.json(onlineAgentsWithStatus);
    } catch (e) {
      console.error("Error getting online agents:", e);
      return res.json({ status: "Error" });
    }
  });

  // Set up a simple timestamp function for prettier logs
  const timestamp = () => `[${new Date().toISOString()}]`;

  io.on("connection", function (socket) {
    const did = socket.handshake.query.did;
    const linkLanguageUUID = socket.handshake.query.linkLanguageUUID;
    console.log(`${timestamp()} New connection: ${socket.id}; who has did: ${did}; who is connected on linkLanguageUUID: ${linkLanguageUUID}`);

    // If this linkLanguageUUID is not yet in the map, add it with an empty Set
    if (did && linkLanguageUUID) {
      if (!onlineAgents.has(linkLanguageUUID)) {
        onlineAgents.set(linkLanguageUUID, new Set());
      }

      // Add the DID to the Set for this linkLanguageUUID
      onlineAgents.get(linkLanguageUUID).add({did, socketId: socket.id});
    }

    socket.on("disconnect", (reason) => {
      console.log(
        `${timestamp()} Socket ${socket.id}; (${did}), (${linkLanguageUUID}); disconnected. Reason: ${reason}`
      );

      if (did && linkLanguageUUID) {
        // Remove the DID from the Set
        onlineAgents.get(linkLanguageUUID)?.delete({did, socketId: socket.id});

        // Optionally, if the Set is now empty, you can delete the linkLanguageUUID key from the map
        if (onlineAgents.get(linkLanguageUUID)?.size === 0) {
          onlineAgents.delete(linkLanguageUUID);
        }
      }
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

    // Telepresence handler for sending a signal to a remote agent by did & link language
    socket.on("send-signal", async ({ remoteAgentDid, linkLanguageUUID, payload }, cb) => {
      try {
        //Get socket id for remote agent given the linkLanguageUUID
        const onlineAgentsInLinkLanguage = onlineAgents.get(linkLanguageUUID);
        
        //For the given set find the object which contains the remoteAgentDid
        const remoteAgent = Array.from(onlineAgentsInLinkLanguage).find((agent) => agent.did === remoteAgentDid);
        if (!remoteAgent) {
          return cb("Remote agent not found", null);
        }
        //Get the socket id for the remote agent
        const remoteAgentSocketId = remoteAgent.socketId;

        //Send signal to remote agent
        io.to(remoteAgentSocketId).emit("telepresence-signal", payload);

        //Notify the client of the successful update using the callback
        cb(null, {
          status: "Ok",
        });
      } catch (e) {
        console.error("Error sending signal:", e);
        cb(e, null);
      }
    });

    // Telepresence handler for sending a broadcast to all agents in a link language
    socket.on("send-broadcast", async ({linkLanguageUUID, payload}, cb) => {
      try {
        //Get all agents in the link language
        const onlineAgentsInLinkLanguage = onlineAgents.get(linkLanguageUUID);
        
        //For each online agent, send the broadcast
        for (const onlineAgent of onlineAgentsInLinkLanguage) {
          const remoteAgentSocketId = onlineAgent.socketId;
          io.to(remoteAgentSocketId).emit("telepresence-signal", payload);
        };

        //Notify the client of the successful update using the callback
        cb(null, {
          status: "Ok",
        });
      } catch (e) {
        console.error("Error sending broadcast:", e);
        cb(e, null);
      }
    });

    //Allows for the client to tell the server that it received some data; and it can update its sync state to a given timestamp
    socket.on(
      "update-sync-state",
      async ({ did, date, linkLanguageUUID }, cb) => {
        try {
          const existingRecord = await AgentSyncState.findOne({
            where: {
              DID: did,
              LinkLanguageUUID: linkLanguageUUID,
            },
          });

          if (existingRecord) {
            // Update the existing record
            await existingRecord.update({
              Timestamp: date,
            });
            console.log("Record updated:", did, linkLanguageUUID, date);
          } else {
            const results = await AgentSyncState.upsert(
              { DID: did, LinkLanguageUUID: linkLanguageUUID, Timestamp: date },
              {
                fields: ["DID", "LinkLanguageUUID", "Timestamp"],
              }
            );
            console.log("updated sync state with result", results);
          }

          cb(null, {
            status: "Ok",
          });
        } catch (error) {
          cb(error, null);
        }
      }
    );

    //Allows the client to save a commit to the server; and have that commit be signaled to all agents in the room
    socket.on(
      "commit",
      async ({ additions, removals, linkLanguageUUID, did }, cb) => {
        let serverRecordTimestamp = new Date();

        try {
          const results = await Diff.create({
            LinkLanguageUUID: linkLanguageUUID,
            DID: did,
            Diff: {
              additions: JSON.stringify(additions),
              removals: JSON.stringify(removals),
            },
            ServerRecordTimestamp: serverRecordTimestamp,
          });

          let onlineAgentsInLinkLanguage = onlineAgents.get(linkLanguageUUID);
          if (!onlineAgentsInLinkLanguage) {
            onlineAgentsInLinkLanguageFiltered = [];
          }
          
          //For each online agent, send the broadcast
          for (const onlineAgent of Array.from(onlineAgentsInLinkLanguage)) {
            if (onlineAgent.did !== did) {
              //Send a signal to all agents online in the link language with the commit data
              io.to(onlineAgent.socketId).emit("signal-emit", {
                payload: {
                  additions,
                  removals,
                },
                serverRecordTimestamp,
              });
            }
          };

          // //Send a signal to all agents online in the link language with the commit data
          // io.to(linkLanguageUUID).emit("signal-emit", {
          //   payload: {
          //     additions,
          //     removals,
          //   },
          //   serverRecordTimestamp,
          // });

          // Notify the client of the successful update using the callback
          cb(null, {
            status: "Ok",
            payload: {
              additions,
              removals,
            },
            serverRecordTimestamp,
          });
        } catch (error) {
          console.error("Error updating diff records:", error);
          // Notify the client of the error using the callback
          cb(error, null);
        }
      }
    );

    //Allows an agent to sync the links since the last timestamp where they received links from
    socket.on("sync", async ({ linkLanguageUUID, did, timestamp }, cb) => {
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

        if (!timestamp) {
          timestamp = 0;
        };

        // Retrieve records from Links
        const results = await Diff.findAll({
          where: {
            LinkLanguageUUID: linkLanguageUUID,
            ServerRecordTimestamp: {
              [Sequelize.Op.gt]: timestamp,
            },
          },
          order: [["ServerRecordTimestamp", "DESC"]],
        });

        const value = {
          additions: [],
          removals: [],
        };

        for (const result of results) {
          value.additions.push(...JSON.parse(result.Diff.additions));
          value.removals.push(...JSON.parse(result.Diff.removals));
        }

        let serverRecordTimestamp;
        if (results.length > 0) {
          serverRecordTimestamp = results[0]?.ServerRecordTimestamp;
        } else {
          serverRecordTimestamp = new Date();
        }

        cb(null, {
          status: "Ok",
          payload: value,
          serverRecordTimestamp,
        });
      } catch (error) {
        console.error("Error on sync:", error);
        cb(error, null);
      }
    });

    socket.on("render", async ({ linkLanguageUUID }, cb) => {
      try {
        const results = await Diff.findAll({
          where: {
            LinkLanguageUUID: linkLanguageUUID,
          },
        });

        const value = {
          additions: [],
          removals: [],
        };

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

        cb(null, {
          status: "Ok",
          payload: value,
          serverRecordTimestamp,
        });
      } catch (error) {
        console.error("Error on render:", error);
        cb(error, null);
      }
    });
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
