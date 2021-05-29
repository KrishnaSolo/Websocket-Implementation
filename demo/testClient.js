const WebSocketClient = require("../client/websocket");

const ws = new WebSocketClient("ws://127.0.0.1:8080/", ["chat"]);

ws.on("open", () => {
  console.log("woooo!");
  ws.sendData("nice work");
});

ws.on("message", (res) => {
  console.log(res);
});
