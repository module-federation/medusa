/* eslint-disable global-require */

"use strict";

const express = require("express");
const cookieParser = require("cookie-parser");
const ipfilter = require("express-ipfilter").IpFilter;
const createNextRouteHandler = require("./lib/create-next-route-handler");
const ip = require("ip");
const requestIp = require("request-ip");
var randtoken = require("rand-token");
module.exports = ({ nextRoutesHandler }) => {
  const app = express();
  const routesHandler = nextRoutesHandler || createNextRouteHandler({ log });
  app.use(cookieParser());
  app.use(requestIp.mw());

  global.INTERNAL_TOKEN = randtoken.generate(16);

  if (process.env.IP_WHITELIST) {
    const ips = process.env.IP_WHITELIST.split(" ");

    ips.push(ip.address());

    app.use((req, res, next) => {
      const parsedIP = ips.reduce((acc, add) => {
        if (req.clientIp.includes(add)) {
          acc.push(req.clientIp);
          return acc;
        }
        acc.push(add);
        return acc;
      }, []);

      ipfilter(parsedIP, { mode: "allow" })(req, res, next);
    });
  }
  app.use(routesHandler);

  return app;
};
