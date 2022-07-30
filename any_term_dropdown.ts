#!/bin/sh
// 2>/dev/null;DENO_VERSION_RANGE="^1.24";DENO_RUN_ARGS="-q --allow-run --allow-env=VERBOSE";set -e;V="$DENO_VERSION_RANGE";A="$DENO_RUN_ARGS";U="$(expr "$(echo "$V"|curl -Gso/dev/null -w%{url_effective} --data-urlencode @- "")" : '..\(.*\)...')";D="$(command -v deno||true)";t(){ d="$(mktemp)";rm "${d}";dirname "${d}";};a(){ [ -n $D ];};s(){ a&&[ -x "$R/deno" ]&&[ "$R/deno" = "$D" ]&&return;deno eval "import{satisfies as e}from'https://deno.land/x/semver@v1.4.0/mod.ts';Deno.exit(e(Deno.version.deno,'$V')?0:1);">/dev/null 2>&1;};g(){ curl -sSfL "https://semver-version.deno.dev/api/github/denoland/deno/$U";};e(){ R="$(t)/deno-range-$V/bin";mkdir -p "$R";export PATH="$R:$PATH";[ -x "$R/deno" ]&&return;a&&s&&([ -L "$R/deno" ]||ln -s "$D" "$R/deno")&&return;v="$(g)";i="$(t)/deno-$v";[ -L "$R/deno" ]||ln -s "$i/bin/deno" "$R/deno";s && return;([ "${A#*-q}" != "$A" ]&&exec 2>/dev/null;curl -fsSL https://deno.land/install.sh|DENO_INSTALL="$i" sh -s $DENO_INSTALL_ARGS "$v">&2);};e;exec "$R/deno" run $A "$0" "$@"

import { run } from "https://deno.land/x/run_simple@1.1.0/mod.ts";
import { aFind } from "https://deno.land/x/async_ray@3.2.1/methods/a_find.ts";

const terminals = [
  "gnome-terminal",
  "urxvt",
  "xterm",
  "uxterm",
  "alacritty",
  "kitty",
  "termite",
  "sakura",
  "lxterminal",
  "terminator",
  "mate-terminal",
  "pantheon-terminal",
  "konsole",
  "xfce4-terminal",
];

const terminalsRegex = terminals.join("|");

const waitForWindowDelaysMs = [100, 200, 500, 1000];

const rootWindow = await run("lsw -r");
const [screenWidth, screenHeight] = await Promise.all(
  ["w", "h"].map(
    (dimension) => run([`wattr`, dimension, rootWindow]),
  ),
);

async function focusTerminal(windowId: string): Promise<void> {
  await Promise.all(
    [
      ["wtf"],
      ["chwso", "-r"],
      ["wrs", screenWidth, screenHeight],
    ].map(
      (command) => run([...command, windowId]),
    ),
  );
}

function parsePidLines(commandOutput: string): number[] {
  return commandOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseInt(line, 10));
}

async function getTerminalPids(): Promise<number[]> {
  const firstResult: string = await run([
    "bash",
    "-c",
    `comm -12 <(xdotool search --name "${terminalsRegex}" | sort) <(xdotool search --class "${terminalsRegex}" | sort)`,
  ]);
  if (firstResult) {
    return parsePidLines(firstResult);
  }
  return parsePidLines(
    await run(["xdotool", "search", "--class", terminalsRegex]).catch(() => ""),
  );
}

async function ensureTerminalPids(): Promise<number[]> {
  const pids = await getTerminalPids();
  if (pids.length > 0) {
    return pids;
  }

  const terminal: string | undefined = await aFind(
    terminals,
    (terminalCandidate) =>
      run(["sh", "-c", `command -v "${terminalCandidate}"`]).then(
        () => true,
        () => false,
      ),
  );
  if (!terminal) {
    throw new Error(`Could not find any terminal to run: ${terminals}`);
  }
  const newTerminalOutput = await run([
    "bash",
    "-c",
    `
          ${terminal} 2>/dev/null >/dev/null &
          disown 2>/dev/null >/dev/null
          echo "$!"
        `,
  ]);
  pids.push(...parsePidLines(newTerminalOutput));
  if (pids.length === 0) {
    throw new Error(
      `Could not find pid of terminal "${terminal}". Output was:\n${newTerminalOutput}`,
    );
  }
  return pids;
}

async function main(): Promise<void> {
  const pids = await ensureTerminalPids();
  const windowIdPromises = pids.map(async (pid) => {
    return await run(["printf", "0x%x", pid]);
  });
  windowIdPromises.map(async (windowIdPromise) => {
    const windowId = await windowIdPromise;
    await run(["mapw", "-t", windowId]);
    waitForWindowDelaysMs.forEach((delay) =>
      setTimeout(() => focusTerminal(windowId), delay)
    );
  });
}

if (import.meta.main) {
  await main();
}
