"use strict";
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
console.log(wss);
wss.on("connection", function connection(ws) {
  console.log("connection");
  console.log(ws);
  //wss.send('hello')
  ws.on("message", function incoming(message) {
    console.log("received: %s", message);
  });

  ws.send("something");
});

wss.on("error", (e) => console.log("server: ", e));
wss.on("listening", (_ws, req) => console.log("server connecting: ", req));
