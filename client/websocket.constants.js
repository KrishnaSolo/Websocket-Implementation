"use strict";
// Websocket Client Constants

const WS = "ws";
const WSS = "wss";
const ABORT_ERR = new Error(
  "Websocket Connection Failed - request was aborted"
);
const PROTOCOL_FAILED = new Error(
  "Websocket Connection was aborted due to server response failing validation."
);
const MESSAGE_CONSTRAINT_ERR = new Error(
  "Websocket could not send data due to byte size of data being over 127 Bytes."
);
const CLIENT_HEADERS = {
  Connection: "Upgrade",
  Upgrade: "Websocket",
  "Sec-Websocket-Version": 13,
  "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
};
const PROTOCOL_MAP = {
  "ws:": "http:",
  "wss:": "https:",
};

module.exports = {
  WS,
  WSS,
  ABORT_ERR,
  PROTOCOL_FAILED,
  MESSAGE_CONSTRAINT_ERR,
  CLIENT_HEADERS,
  PROTOCOL_MAP,
};
