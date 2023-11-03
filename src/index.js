// @ts-check
import { listen } from "listhen";
import {
  createApp,
  toNodeListener,
  eventHandler,
  fromNodeMiddleware,
  getQuery,
} from "h3";
import {
  createIPX,
  ipxFSStorage,
  ipxHttpStorage,
  createIPXWebServer,
} from "ipx";
import { createReadStream } from "node:fs";
import { parse } from "@iarna/toml";
import { URLPattern } from "urlpattern-polyfill";
import serveStatic from "serve-static";

/**
 * TODO: get the actual config rather than just reading the netlify.toml
 * @type {any}
 * */
const config = await parse.stream(
  createReadStream("./netlify.toml", { encoding: "utf-8" })
);

// TODO: properly verify the full pattern in the handler
const domains = config?.images?.remote_images?.map((patternString) => {
  const pattern = new URLPattern(patternString);
  return pattern.hostname;
});

const ipx = createIPX({
  storage: ipxFSStorage({ dir: config?.build?.publish ?? "./public" }),
  httpStorage: ipxHttpStorage({ domains }),
});

/**
 * Create a fetch-type server
 */
const handler = createIPXWebServer(ipx);

/**
 * Transforms imgix to ipx params
 * @param {Record<string, string>} query
 */
function transformParams({ w, h, crop, fit, fm, q }) {
  return {
    w,
    h,
    q,
    format: fm,
    // TODO: map the crop and fit params
    fit: "cover",
  };
}

/**
 * Formats the params for ipx
 * @param {Record<string, string | null>} params
 * @returns string
 */

function formatParams(params) {
  return Object.entries(params)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}_${value}`)
    .join(",");
}

const app = createApp()
  .use(
    "/.netlify/images",
    eventHandler(async (event) => {
      /** @type {Record<string,string>} */
      const { url, ...query } = getQuery(event);
      const params = transformParams(query);
      const modifiers = formatParams(params);
      const path = `/${modifiers}/${encodeURIComponent(url)}`;
      return handler(new Request(new URL(path, "http://n/"), event));
    })
  )
  .use(fromNodeMiddleware(serveStatic(config?.build?.publish ?? "./public")));

listen(toNodeListener(app));
