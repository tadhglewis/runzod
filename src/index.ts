#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { run } from "jscodeshift/src/Runner";
import transformer from "./transform";

// Main function to run the transform
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Please provide a path to transform.");
    console.error("Usage: runzod <path> [options]");
    console.error("Options:");
    console.error("  --dry         Dry run (no changes are made to files)");
    console.error("  --print       Print transformed files to stdout");
    console.error(
      "  --verbose=n   Show more information about the transform process"
    );
    process.exit(1);
  }

  // Parse path and options
  const paths = [args[0]];
  const cmdArgs = args.slice(1);

  // Default options
  const options = {
    dry: cmdArgs.includes("--dry"),
    print: cmdArgs.includes("--print"),
    babel: true,
    parser: "ts",
    extensions: "ts,tsx,js,jsx",
    ignorePattern: "**/node_modules/**",
    verbose: 2,
  };

  // Get path to the transform
  const transformPath = path.join(__dirname, "transform.js");

  console.log("Running runzod transform...");

  // For testing, support direct transformation if it's a single file and --direct flag is passed
  if (paths.length === 1 && cmdArgs.includes("--direct")) {
    const filePath = paths[0];

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const source = fs.readFileSync(filePath, "utf8");

      // Standard transformation
      const jscodeshift = require("jscodeshift");
      const api = {
        jscodeshift,
        stats: () => {},
        j: jscodeshift,
        report: () => {},
      };

      const transformed = transformer({ path: filePath, source }, api, {
        parser: "ts",
      });

      if (options.print) {
        console.log(transformed);
      }

      if (!options.dry) {
        fs.writeFileSync(filePath, transformed);
        console.log(`Successfully transformed ${filePath}`);
      } else {
        console.log(`Dry run - no changes made to ${filePath}`);
      }

      return;
    } catch (err) {
      console.error("Error during transformation:", err);
      process.exit(1);
    }
  }

  // Use jscodeshift runner
  const result = await run(transformPath, paths, options);

  if (result.error) {
    console.error("Error:", result.error);
    process.exit(1);
  }

  console.log(`
Transform complete:
  - Files processed: ${result.stats?.filesRead || 0}
  - Files changed: ${result.stats?.filesChanged || 0}
  - Errors: ${result.stats?.errors || 0}
`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
