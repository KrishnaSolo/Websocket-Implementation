"use strict";
const http = require("http");
const net = require("net");
const buffer = require("buffer");
const crypto = require("crypto");

// TODO: move into constants file
const WS = "ws";
const WSS = "wss";
const ABORT_ERR = new Error(
  "Websocket Connection Failed - request was aborted"
);
const PROTOCOL_FAILED = new Error(
  "Websocket Connection was aborted due to server response failing validation."
);
const CLIENT_HEADERS = {
  Connection: "Upgrade",
  Upgrade: "Websocket",
  "Sec-Websocket-Version": 13,
  "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
};
const schemePortMap = {
  http: 80,
  https: 443,
};
const protocolMap = {
  "ws:": "http:",
  "wss:": "https:",
};

// TODO: move into utils file
function hasDuplicates(arr) {
  const set = new Set();
  for (let val in arr) {
    if (set.has(val)) return true;
    set.add(val);
  }
  return false;
}

/* Based of WHATWG living standard */
class WebsocketClient {
  /* private variables */
  // TODO: needs a getter which serializes value using algo definied in spec - but we can use .toString() on URL object
  #urlRecord;
  #protocols;
  #socket;

  // TODO: Missing a check to see if protocol(s) is(are) defined as per RFC 2616
  constructor(url, protocols = []) {
    const urlRecord = new URL(url); // specs say to use a url parser algo, but this is out of scope
    const hasWS = urlRecord.protocol.includes(WS);
    const hasWSS = urlRecord.protocol.includes(WSS);
    //console.log(urlRecord);
    const hasFragment = urlRecord.hash;
    if (!hasWS && !hasWSS)
      throw new SyntaxError(
        "URL scheme provided is not valid - must use WS or WSS"
      );
    if (hasFragment)
      throw new SyntaxError(
        "URL should not have any fragments - e.g. '...website.com/#someFragment'"
      );

    if (typeof protocols === "string") protocols = [protocols];
    if (hasDuplicates(protocols))
      throw new SyntaxError(
        "Protocols provided has one or more duplicate values"
      );
    this.#urlRecord = urlRecord;
    this.#protocols = protocols;
    this.beginConnection();
  }

  // This is a lower abstraction - should be moved somewhere else
  async beginConnection() {
    const fetchCompatibleURL = new URL(this.#urlRecord);

    //change protocol to http/https to play nice with fetch
    const oldProtocol = fetchCompatibleURL.protocol;
    fetchCompatibleURL.protocol = protocolMap[oldProtocol];

    const requestURL = fetchCompatibleURL.toString();
    const protocols = this.#protocols.join(", ");

    const randomBytes = crypto.randomBytes(16);
    const buf = Buffer.alloc(16, randomBytes);

    const headers = {
      "Sec-Websocket-Key": buf.toString("base64"),
      "Sec-WebSocket-Protocol": protocols,
      ...CLIENT_HEADERS,
    };

    console.log(headers);
    const req = http.get(requestURL, {
      // createConnection: (options) => {
      //   options.path = options.socketPath;
      //   return net.connect(options);
      // },
      timeout: 200,
      headers: headers,
    });

    req.on("upgrade", (res, socket, head) => {
      const { statusCode, statusMessage, aborted, headers } = res;
      console.log(
        "Upgrade complete. response: ",
        statusMessage,
        " statuscode: ",
        statusCode
      );
      if (aborted) req.destroy(ABORT_ERR);

      this.#socket = socket;
    });

    req.on("error", (res) => {
      console.log("error:", res);
    });
  }
}

const ws = new WebsocketClient("ws://127.0.0.1:8080/", ["chat"]);
