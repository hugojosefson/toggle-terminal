#!/bin/sh
// 2>/dev/null;DENO_VERSION_RANGE="^1.24";DENO_RUN_ARGS="-q --allow-run --allow-env=VERBOSE";set -e;V="$DENO_VERSION_RANGE";A="$DENO_RUN_ARGS";U="$(expr "$(echo "$V"|curl -Gso/dev/null -w%{url_effective} --data-urlencode @- "")" : '..\(.*\)...')";D="$(command -v deno||true)";t(){ d="$(mktemp)";rm "${d}";dirname "${d}";};a(){ [ -n $D ];};s(){ a&&[ -x "$R/deno" ]&&[ "$R/deno" = "$D" ]&&return;deno eval "import{satisfies as e}from'https://deno.land/x/semver@v1.4.0/mod.ts';Deno.exit(e(Deno.version.deno,'$V')?0:1);">/dev/null 2>&1;};g(){ curl -sSfL "https://semver-version.deno.dev/api/github/denoland/deno/$U";};e(){ R="$(t)/deno-range-$V/bin";mkdir -p "$R";export PATH="$R:$PATH";[ -x "$R/deno" ]&&return;a&&s&&([ -L "$R/deno" ]||ln -s "$D" "$R/deno")&&return;v="$(g)";i="$(t)/deno-$v";[ -L "$R/deno" ]||ln -s "$i/bin/deno" "$R/deno";s && return;([ "${A#*-q}" != "$A" ]&&exec 2>/dev/null;curl -fsSL https://deno.land/install.sh|DENO_INSTALL="$i" sh -s $DENO_INSTALL_ARGS "$v">&2);};e;exec "$R/deno" run $A "$0" "$@"

import { run } from "https://deno.land/x/run_simple@1.1.0/mod.ts";
import { aFind } from "https://deno.land/x/async_ray@3.2.1/methods/a_find.ts";

const TERMINALS = [
  "alacritty",
  "urxvt",
  "xterm",
  "uxterm",
  "kitty",
  "termite",
  "sakura",
  "lxterminal",
  "terminator",
  "mate-terminal",
  "pantheon-terminal",
  "konsole",
  "gnome-console",
  "kgx",
  "gnome-terminal",
  "xfce4-terminal",
];

const TERMINALS_REGEX = TERMINALS.join("|");

const WAIT_FOR_WINDOW_DELAYS_MS = [0, 1, 10, 100, 200, 300, 500, 1000];
const MAX_WAIT_FOR_NEW_TERMINAL_MS = 5000;

const rootWindow = await run("lsw -r");
const [screenWidth, screenHeight] = await Promise.all(
  ["w", "h"].map(
    (dimension) => run(["wattr", dimension, rootWindow]),
  ),
);

function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

async function focusTerminal(windowId: number): Promise<void> {
  const windowIdHex = hex(windowId);
  await Promise.all(
    [
      ["wrs", screenWidth, screenHeight, windowIdHex],
      ["wtf", windowIdHex],
      ["chwso", "-r", windowIdHex],
    ]
      .map((command) => run(command).catch(() => Promise.resolve())),
  );
}

async function hideWindow(windowId: number): Promise<void> {
  const windowIdHex = hex(windowId);
  await run(["mapw", "-u", windowIdHex]).catch(() => Promise.resolve());
}

async function showWindow(windowId: number): Promise<void> {
  const windowIdHex = hex(windowId);
  await run(["mapw", "-m", windowIdHex]).catch(() => Promise.resolve());
}

function parseIntegerLines(commandOutput: string | null | undefined): number[] {
  return (commandOutput ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseInt(line, 10))
    .filter((n) => !Number.isNaN(n));
}

async function getTerminalWindowIds(): Promise<number[]> {
  const firstResult: number[] = parseIntegerLines(
    await run([
      "bash",
      "-c",
      `comm -12 <(xdotool search --name "${TERMINALS_REGEX}" | sort) <(xdotool search --class "${TERMINALS_REGEX}" | sort)`,
    ]),
  );
  if (firstResult.length) {
    return firstResult;
  }
  return parseIntegerLines(
    await run(["xdotool", "search", "--class", TERMINALS_REGEX]).catch(() =>
      ""
    ),
  );
}

async function waitForTerminalWindowIds(maxWaitMs: number): Promise<number[]> {
  const startTime = Date.now();
  const expireTime = startTime + maxWaitMs;
  while (Date.now() < expireTime) {
    const windowIds = await getTerminalWindowIds();
    if (windowIds.length > 0) {
      return windowIds;
    }
    await sleep(10);
  }
  throw new Error(
    `Could not find Window Id(s) of new terminal within ${maxWaitMs} ms.`,
  );
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function ensureTerminalWindowIds(): Promise<number[]> {
  const windowIds = await getTerminalWindowIds();
  if (windowIds.length > 0) {
    return windowIds;
  }

  const terminal: string | undefined = await aFind(
    TERMINALS,
    (terminalCandidate) =>
      run(["sh", "-c", `command -v "${terminalCandidate}"`]).then(
        () => true,
        () => false,
      ),
  );
  if (!terminal) {
    throw new Error(`Could not find any terminal to run: ${TERMINALS}`);
  }
  await run([
    "bash",
    "-c",
    `"${terminal}" & disown`,
  ]);
  return await waitForTerminalWindowIds(MAX_WAIT_FOR_NEW_TERMINAL_MS);
}

async function getActiveWindowId(): Promise<number | undefined> {
  return parseIntegerLines(
    await run(["xdotool", "getactivewindow"]),
  )[0];
}

function getStoredWindowIds(): number[] {
  return parseIntegerLines(globalThis.localStorage.getItem("windowIds"));
}

function storeWindowIds(windowIds: number[]): void {
  globalThis.localStorage.setItem(
    "windowIds",
    windowIds
      .map((windowId) => `${windowId}`)
      .join("\n"),
  );
}

async function main(): Promise<void> {
  const activeWindowPromise = getActiveWindowId();
  const storedWindowIds = getStoredWindowIds();
  const activeWindow = await activeWindowPromise;
  console.log({ activeWindow, storedWindowIds });
  if (activeWindow && storedWindowIds.includes(activeWindow)) {
    await hideWindow(activeWindow);
    if (storedWindowIds.length !== 1) {
      storeWindowIds([activeWindow]);
    }
    return;
  }

  const windowIds = await ensureTerminalWindowIds();
  console.log({ activeWindow, windowIds });
  if (activeWindow && windowIds.includes(activeWindow)) {
    await hideWindow(activeWindow);
    storeWindowIds([activeWindow]);
    return;
  }
  // we now know it wasn't the active window
  // bring them forward!
  const unmappedStoredWindowIds = storedWindowIds.filter((storedWindowId) =>
    windowIds.includes(storedWindowId)
  );
  const windowsToShow = unmappedStoredWindowIds.length > 0
    ? unmappedStoredWindowIds
    : windowIds;
  console.log({ windowsToShow });

  const broughtForwardAllWindows = windowsToShow.map(async function (windowId) {
    await showWindow(windowId);
    for (const delay of WAIT_FOR_WINDOW_DELAYS_MS) {
      await sleep(delay);
      await focusTerminal(windowId);
    }
  });
  storeWindowIds(windowsToShow);
  await Promise.all(broughtForwardAllWindows);
}

if (import.meta.main) {
  await main();
}
