const WebSocketClient = require("../client/websocket");

const ws = new WebSocketClient("ws://127.0.0.1:8080/", ["chat"]);

ws.onopen = () => {
  console.log("wwoooo22!");
};
ws.on("open", () => {
  console.log("woooo!");
  ws.send("nice work");
  ws.close(1002, "idk man");
});

ws.on("error", (res) => {
  console.log("errorrrr: ", res);
});

ws.onmessage = (msg) => {
  console.log("message: ", msg);
};
ws.onerror = (msg) => {
  console.log("client: ", msg);
};
ws.onclose = (code, reason) => {
  console.log("closed: ", code, " reason: ", reason);
};
