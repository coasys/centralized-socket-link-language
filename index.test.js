const startSocketServer = require("./index");
const ioc = require("socket.io-client");
const fs = require("fs");
const fetch = require("node-fetch");

async function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve();
    }, ms)
  );
}

describe("Test", () => {
  let io, clientSocket;

  const channelId = "languageID2";

  beforeAll(async () => {
    io = await startSocketServer();

    await sleep(2000);

    clientSocket = ioc(`http://localhost:3000`);
  });

  afterAll(() => {
    io.close();
    clientSocket.disconnect();
    //Delete the database.sqlite file
    fs.rmSync("./database.sqlite");
  });

  test("Commit test", (done) => {
    clientSocket.emit("join-room", channelId);

    clientSocket.emit(
      "commit",
      {
        additions: [
          {
            author: "did:test1",
            timestamp: 1697033597138,
            data: {
              source: "test4",
              predicate: "test4",
              target: "test4",
            },
          },
        ],
        removals: [],
        linkLanguageUUID: "languageID",
        did: "did:test1",
      },
      (err, response) => {
        if (err) {
          console.log(err);
        } else {
          console.log("CALLBACK TRIGGERED");
          expect(response.status).toBe("Ok");
          done();
        }
      }
    );
  });

  test("Commit and Sync", (done) => {
    const time = Date.now();

    const commitData = {
      additions: [
        {
          author: "did:test-sync1",
          timestamp: time,
          data: {
            source: "test-sync",
            predicate: "test-sync",
            target: "test-sync",
          },
        },
      ],
      removals: [],
      linkLanguageUUID: "languageID2",
      did: "did:test-sync1",
    };

    // User 1 commits a message
    clientSocket.emit("commit", commitData, (err, commitRes) => {
      if (err) {
        console.log(err);
      } else {
        expect(commitRes.status).toBe("Ok");

        // After the commit, another user connects and calls sync
        const clientSocket2 = ioc(`http://localhost:3000`);

        clientSocket2.on("connect", () => {
          clientSocket2.emit("join-room", channelId);

          clientSocket2.emit(
            "update-sync-state",
            {
              linkLanguageUUID: "languageID2",
              date: time,
              did: "did:test-sync2",
            },
            (error) => {
              if (!error) {
                clientSocket2.emit(
                  "sync",
                  {
                    linkLanguageUUID: "languageID2",
                    did: "did:test-sync2",
                    // timestamp: time
                  },
                  (error, syncRes) => {
                    expect(syncRes.payload.additions).toEqual([
                      commitData.additions[0],
                    ]);
                    clientSocket2.disconnect();
                    done();
                  }
                );
              }
            }
          );
        });
      }
    });
  });

  test("Commit and Signal", (done) => {
    const channelId = "languageID3";
    const commitData = {
      additions: [
        {
          author: "did:test-signal1",
          timestamp: Date.now(),
          data: {
            source: "test-signal",
            predicate: "test-signal",
            target: "test-signal",
          },
        },
      ],
      removals: [],
      linkLanguageUUID: "languageID3",
      did: "did:test-signal1",
    };

    // Another user connects and listens to signal
    const clientSocket2 = ioc(`http://localhost:3000`);

    clientSocket2.on("connect", () => {
      clientSocket2.emit("join-room", channelId);

      // User 1 commits a message
      clientSocket.emit("commit", commitData, (err, res) => {
        expect(res.payload.additions).toEqual([commitData.additions[0]]);
        clientSocket2.disconnect();
        done();
      });
    });
  });

  test("Render test", (done) => {
    clientSocket.emit("join-room", channelId);

    clientSocket.emit(
      "render",
      {
        linkLanguageUUID: "languageID",
      },
      (err, res) => {
        expect(res.payload.additions.length).toBe(1);
        done();
      }
    );
  });

  test("Sync test", (done) => {
    clientSocket.emit("join-room", channelId);

    clientSocket.emit(
      "sync",
      {
        linkLanguageUUID: "languageID",
        did: "did:test1",
        timestamp: 1697033597138,
      },
      (err, res) => {
        expect(res.payload.additions.length).toBe(1);
        expect(res.payload.removals.length).toBe(0);
        done();
      }
    );
  });

  test("Commit, Sync, Update Sync State, and Sync Again", (done) => {
    const channelId = "test-update-sync";
    const commitData = {
      additions: [
        {
          author: "did:test-update-sync1",
          timestamp: Date.now(),
          data: {
            source: "test-update-sync",
            predicate: "test-update-sync",
            target: "test-update-sync",
          },
        },
      ],
      removals: [],
      linkLanguageUUID: channelId,
      did: "did:test-update-sync1",
    };

    // User 1 commits a message
    clientSocket.emit("commit", commitData, (err, res) => {
      expect(res.status).toBe("Ok");

      // After the commit, another user connects and calls sync
      const clientSocket2 = ioc(`http://localhost:3000`);

      clientSocket2.on("connect", () => {
        clientSocket2.emit("join-room", channelId);

        clientSocket2.emit(
          "sync",
          {
            linkLanguageUUID: channelId,
            did: "did:test-update-sync2",
          },
          (err, data) => {
            expect(data.payload.additions).toEqual([commitData.additions[0]]);
            let serverRecordTimestamp = data.serverRecordTimestamp;

            // Update sync state
            clientSocket2.emit(
              "update-sync-state",
              {
                did: "did:test-update-sync2",
                date: serverRecordTimestamp,
                linkLanguageUUID: channelId,
              },
              (error, updateRes) => {
                expect(updateRes.status).toBe("Ok");

                // Call sync again
                clientSocket2.emit(
                  "sync",
                  {
                    linkLanguageUUID: channelId,
                    did: "did:test-update-sync2",
                  },
                  (error, syncRes) => {
                    // Expecting that we don't receive any new additions
                    expect(syncRes.payload.additions).toHaveLength(1);
                    clientSocket2.disconnect();
                    done();
                  }
                );
              }
            );
          }
        );
      });
    });
  });

  test("Agent can get their timestamp after updating", (done) => {
    const channelId = "test-fetch-sync-state";

    // After the commit, another user connects and calls sync
    const clientSocket2 = ioc(`http://localhost:3000`);

    let date1 = new Date();
    let date2 = new Date();
    const did = "did:sync-update";

    clientSocket2.emit(
      "update-sync-state",
      {
        did: did,
        date: date1,
        linkLanguageUUID: channelId,
      },
      (error, updateStatus) => {
        expect(updateStatus.status).toBe("Ok");
        postData("http://localhost:3000/currentRevision", {
          did: did,
          linkLanguageUUID: "test-fetch-sync-state",
        })
          .then((data) => {
            expect(data.currentRevision).toEqual(date1.toISOString());
            done();
          })
          .catch((error) => {
            console.error("Error:", error);
          });
      }
    );
  });
});

function postData(url = "", data = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .catch((error) => {
      console.error("Error:", error);
      throw error;
    });
}
