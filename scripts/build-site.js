"use strict";

const { spawnSync } = require("child_process");

function run(scriptPath) {
  const res = spawnSync(process.execPath, [scriptPath], { stdio: "inherit" });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

run("scripts/build-library-json.js");
run("scripts/generate-legacy-redirects.js");
