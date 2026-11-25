// Babel's parser for the source checks. The package does not depend on it:
// scripts/build-lib.ts writes dist/cli/parse.js with the parser bundled in.
export { parse } from "@babel/parser";
