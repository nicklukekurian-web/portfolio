// Build flag (Round 5 B7): true in the repo and the dev server; scripts/build.sh rewrites it to false in dist/,
// so debug readouts (?debug=fps) and offline experiment switches (?exp=, js/core/experiments.js) are inert in production.
export const DEV = true;
