"use strict";
const http = require("http");
const EventEmitter = require("events");

/* Based of WHATWG living standard */
class WebSocketServer extends EventEmitter {}
