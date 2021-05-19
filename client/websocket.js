"use strict";
const http = require("http");
const net = require("net");
// const URL = require("url");

// TODO: move into constants file
const WS = "ws";
const WSS = "wss";
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

    const headers = {
      Connection: "Upgrade",
      Upgrade: "Websocket",
      "Sec-Websocket-Version": 13,
      "Sec-Websocket-Key": "x3JJHMbDL1EzLkh9GBhXDw==", // hard coded for now
      "Sec-WebSocket-Protocol": "chat",
      "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
    };
    // const requestOptions = {
    //   referrer: "no-referrer",
    //   mode: "websocket",
    //   redirect: "error",
    //   credentials: "include",
    //   "service-workers": "none",
    //   cache: "no-store",
    //   headers: headers,
    // };
    //console.log(headers);
    //const request = new Request(requestURL, requestOptions);
    const req = http.get(
      {
        port: 8080,
        createConnection: (options) => {
          options.path = options.socketPath;
          return net.connect(options);
        },
        timeout: 200,
        headers: headers,
      },
      (res) => {
        // Do stuff with response
        console.log(res);
        const body = "hello world";
        res
          .writeHead(200, {
            "Content-Length": Buffer.byteLength(body),
            "Content-Type": "text/plain",
          })
          .end(body);
      }
    );
    //console.log("res", req);
    req.on("response", (res) => {
      console.log("done", res);
    });
    req.on("upgrade", (res, socket, head) => {
      console.log("hello");
    });
    req.on("error", (res) => {
      console.log("error:", res);
    });
  }
}

const ws = new WebsocketClient("ws://127.0.0.1:8080/", ["chat"]);
