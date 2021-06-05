const WebSocketClient = require("../client/websocket");

const ws = new WebSocketClient("ws://127.0.0.1:8080/", ["chat"]);

ws.on("open", () => {
  console.log("woooo!");
  ws.send("nice work");
  ws.close(1000, "idk man");
});

// ws.on("message", (res) => {
//   console.log(res);
// });

ws.onmessage = (msg) => {
  console.log("message: ", msg);
};
ws.onerror = (msg) => {
  console.log("client: ", msg);
};
ws.onclose = (code, reason) => {
  console.log("closed: ", code, " reason: ", reason);
};
