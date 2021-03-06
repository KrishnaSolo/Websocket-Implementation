"use strict";
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
console.log(wss);
wss.on("connection", function connection(ws) {
  console.log("connected");

  // used to get mssages - OPCODE must be a textframe or non ping/pong/close fram
  ws.on("message", function incoming(message) {
    console.log("received: %s", message);
    // can send stuff
    ws.send("something");
  });

  // see when pings occur
  ws.on("ping", (data) => {
    console.log("ping:", data.toString());
    ws.pong("gotcah");
  });

  ws.on("pong", (data) => {
    console.log("pong:", data.toString());
  });

  // handle errors
  ws.on("error", (e) => console.log("server: ", e));

  // on close
  ws.on("close", (code, reason) => {
    console.log("closed connection: ", code, " , ", reason);
  });
});

wss.on("error", (e) => console.log("server: ", e));
wss.on("listening", (_ws, req) => console.log("server connecting: ", req));
