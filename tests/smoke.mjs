import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.options = [];
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.options = this.options.filter(option => !children.includes(option));
    this.options.push(...children);
  }

  querySelector(selector) {
    const match = selector.match(/^option\[value="(.+)"\]$/);
    if (!match) return null;
    return this.options.find(option => option.value === match[1]) || null;
  }
}

const html = fs.readFileSync("src/index.html", "utf8");
const script = fs.readFileSync("src/app.js", "utf8");

const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));

for (const [id, values] of Object.entries({
  place: ["47.58,18.88,Nagykovacsi", "custom"],
  language: ["en-GB", "hu-HU"],
  crop: ["rapeseed", "wheat", "barley", "corn", "sunflower"],
  work: ["seeding", "harvesting", "spraying"]
})) {
  elements[id].options = values.map(value => ({ value, textContent: "" }));
  elements[id].value = values[0];
}

elements.lat.value = "47.58";
elements.lon.value = "18.88";

const document = {
  documentElement: Object.assign(new Element("html"), { dataset: {} }),
  title: "",
  querySelector(selector) {
    return elements[selector.replace("#", "")] || null;
  }
};

const localStorage = {
  getItem() {
    return null;
  },
  setItem() {}
};

function providerPayload(url) {
  if (url.includes("api.met.no")) {
    return { properties: { timeseries: [] } };
  }
  return { hourly: { time: [] } };
}

const context = {
  console,
  document,
  Intl,
  Date,
  JSON,
  Number,
  Math,
  AbortController,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  localStorage,
  navigator: { language: "en-GB", languages: ["en-GB"] },
  fetch: async url => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(providerPayload(url))
  })
};

vm.runInNewContext(script, context);
await new Promise(resolve => setTimeout(resolve, 0));

assert.equal(document.title, "Hungary Weather Median");
assert.equal(elements.title.textContent, "Hungary Weather Median");
assert.match(elements.sources.innerHTML, /ECMWF IFS/);
assert.match(elements.today.innerHTML, /n\/a/);

console.log("smoke test passed");
