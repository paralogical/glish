import * as util from "util";
import { progress } from "./util";

/**
 * A graph with three connected subgraphs, corresponding to the parts of a syllable.
 * letters in the onset correspond to consants before the vowel.
 * letters in the vowel part are vowels
 * letters in the coda are consonants after the vowel
 *
 * Within each part, letters may have edges pointing to each other in that part, or to
 * a letter in the next part.
 * Letters may never point backward to previous parts (e.g. vowels cannot point into the onset)
 * There will be duplicate letters in the onset and the coda, because they
 * represent different parts of the syllable.
 */
export type SonorityGraph = {
  // onset, nucleus, coda
  parts: [SonorityGraphPart, SonorityGraphPart, SonorityGraphPart];
};

const STOP = null;
const START = null;
// letter -> [nextLetter | STOP, count]
// note: letter may not be in this graph part. if not, look at next graph part.
// null as next letter means stop
// null as letter (key in map) means start. (only for onset)
// null -> [null, count] means how often this graph part is skipped (no onset)
export type SonorityGraphPart = Map<
  string | typeof START,
  Array<[string | typeof STOP, number]>
>;

// onset -> pre-vowel consonants
// nucleus -> vowel (or syllabic consonants like m in rhythm)
// coda -> post-vowel consonants

export function createSonorityGraph(
  syllablizedPronuncations: Array<[string, Array<Array<string>>]>
): SonorityGraph {
  const graph: SonorityGraph = {
    parts: [new Map(), new Map(), new Map()],
  };

  let i = 0;
  for (const [word, syllables] of syllablizedPronuncations) {
    progress(i, syllablizedPronuncations.length, "");
    i += 1;
    for (const syllable of syllables) {
      //   console.log("syllable: ", syllable);
      const [onsetPart, nucleusPart, codaPart] = splitIntoChunks(syllable);
      //   console.log(" > chunks: ", [onsetPart, nucleusPart, codaPart]);
      updateGraphPart("onset", graph.parts[0], onsetPart, nucleusPart?.[0]);
      updateGraphPart("nucleus", graph.parts[1], nucleusPart, codaPart?.[0]);
      updateGraphPart("coda", graph.parts[2], codaPart, STOP);
    }
  }

  return graph;
}

// go through letters and update graph part
function updateGraphPart(
  which: "onset" | "nucleus" | "coda",
  graphPart: SonorityGraphPart,
  letters: Array<string>,
  // first phone of next part
  nextPart: string | null
) {
  // initial part of graph
  if (which === "onset") {
    incGraphPart(graphPart, null, letters?.[0] ?? nextPart);
  }
  if (letters == null) {
    return;
  }

  let letter: string | null = letters[0] ?? null;
  for (const next of [...letters.slice(1), nextPart]) {
    incGraphPart(graphPart, letter, next);
    letter = next;
  }
}

function incGraphPart(
  graphPart: SonorityGraphPart,
  letter: string | null,
  next: string | null
) {
  const existing = graphPart.get(letter);
  if (existing) {
    const existingNext = existing.find((e) => e[0] === next);
    let updated: Array<[string | null, number]>;
    if (existingNext) {
      existingNext[1] += 1;
    } else {
      updated = [...existing, [next, 1]];
      graphPart.set(letter, updated);
    }
  } else {
    graphPart.set(letter, [[next, 1]]);
  }
}

export function printGraph(graph: SonorityGraph) {
  let next = 1;
  const assignedIds: { [key: string]: number } = {};
  const idForNode = (nodeName: string): number => {
    if (assignedIds[nodeName] == null) {
      assignedIds[nodeName] = next++;
    }
    return assignedIds[nodeName];
  };

  const nodes: Array<{ id: number; label: string; group: number }> = [];
  const edges: Array<{ from: number; to: number; value: number }> = [];

  const nodeName = (letter: string | null, atOrAfter: number) => {
    let pref;
    if (atOrAfter === 0 && graph.parts[0].has(letter)) {
      pref = "onset";
    } else if (atOrAfter <= 1 && graph.parts[1].has(letter)) {
      pref = "vowel";
    } else if (atOrAfter > 0 && graph.parts[2].has(letter)) {
      pref = "coda";
    }
    if (letter == null) {
      return "end";
    }

    return `${pref}_${letter}`;
  };

  const starts = graph.parts[0].get(null);
  edges.push(
    ...starts!.map(([letter, value]) => ({
      from: idForNode("st"),
      to: idForNode(nodeName(letter, 0)),
      value: value,
    }))
  );
  let i = 0;
  for (const part of graph.parts) {
    edges.push(
      ...[...part.entries()]
        .filter(([letter]) => letter != null)
        .map(([letter, nexts]) =>
          nexts.map(([next, value]) => ({
            from: idForNode(nodeName(letter, i)),
            to: idForNode(nodeName(next, i)),
            value: value,
          }))
        )
        .flat()
    );
    i += 1;
  }

  nodes.push({ id: idForNode("st"), label: "Start", group: 1 });
  nodes.push({ id: idForNode("end"), label: "End", group: 5 });

  nodes.push(
    ...graph.parts
      .map((part, i) =>
        [...part.keys()]
          .filter((letter) => letter != null)
          .map((letter) => ({
            id: idForNode(`${["onset", "vowel", "coda"][i]}_${letter}`),
            label: letter ?? "null",
            group: i + 1,
          }))
      )
      .flat()
  );

  return JSON.stringify({ nodes, edges }, undefined, 2);
}

function randomChoice<T>(a: Array<T>): T {
  return a[Math.floor(Math.random() * a.length)];
}

function weightedRandomChoice<T>(a: Array<[T, number]>): T {
  let i;
  let weights: Array<number> = [];

  for (i = 0; i < a.length; i++) weights[i] = a[i][1] + (weights[i - 1] || 0);

  var random = Math.random() * weights[weights.length - 1];

  for (i = 0; i < weights.length; i++) if (weights[i] > random) break;

  return a[i][0];
}

export function getRandomSyllable(graph: SonorityGraph): Array<string> {
  let word = [];
  let next = weightedRandomChoice(graph.parts[0].get(null)!);

  // track how often we use each phone, so we don't keep repeating stststs
  let phoneCounts = new Map<string, number>();

  let currentPart = 0;
  while (next && currentPart < 3) {
    const existing = phoneCounts.get(next);
    phoneCounts.set(next, existing ? existing + 1 : 1);

    word.push(next);

    let graphPart;
    if (graph.parts[currentPart].has(next)) {
      graphPart = graph.parts[currentPart];
    } else {
      currentPart++;
      phoneCounts = new Map(); // reset so we only count within a syllable part
      graphPart = graph.parts[currentPart];
    }
    next = weightedRandomChoice(
      graphPart.get(next)!.filter(([p]) => {
        if (p == null) {
          return true;
        }
        const count = phoneCounts.get(p) ?? 0;
        // allow the same letter up to twice, so asks is ok but iststs is not
        return count < 2;
      })
    );
  }

  return word;
}

export function getRandomSyllableFromPallete(
  graph: SonorityGraph,
  pallete: Array<string>
): Array<string> | null {
  let word = [];
  // TODO: remove from palette as you usefrom a graph,
  // so kstrtruhr is not possible (repeated t and r in onset)
  const randomTilInPalete = (from: Array<[string | null, number]>) => {
    const filteredFrom = from.filter(
      ([l]) => l == null || pallete.includes(l!)
    );
    if (filteredFrom.length === 0) {
      return null;
    }
    return weightedRandomChoice(filteredFrom);
  };
  let next = randomTilInPalete(graph.parts[0].get(null)!);
  if (next == null) {
    return null;
  }

  let currentPart = 0;
  while (next && currentPart < 3) {
    word.push(next);
    let graphPart;
    if (graph.parts[currentPart].has(next)) {
      graphPart = graph.parts[currentPart];
    } else {
      currentPart++;
      graphPart = graph.parts[currentPart];
    }
    next = randomTilInPalete(graphPart.get(next)!);
  }

  return word;
}

const vowels = new Set([
  "a",
  "ɑ", // ɑ or ɒ
  "æ",
  "ʌ",
  "ɔ",
  "aʊ",
  "əɹ", // ɚ
  "ə",
  "aɪ",
  "ɛ",
  "ɛɹ", // ɝ
  "eɪ",
  "ɪ",
  "ɨ",
  "i",
  "oʊ",
  "ɔɪ",
  "ʊ",
  "u",
  "ʉ",
]);

const consonantsOrExtra = new Set([
  "b",
  "tʃ",
  "d",
  "ð",
  "ɾ",
  "l̩",
  "m̩",
  "n̩",
  "f",
  "ɡ",
  "h",
  "h",
  "dʒ",
  "k",
  "l",
  "m",
  "n",
  "ŋ",
  "ɾ̃",
  "p",
  "ʔ",
  "ɹ",
  "s",
  "ʃ",
  "t",
  "θ",
  "v",
  "w",
  "ʍ",
  "j",
  "z",
  "ʒ",
]);

function splitIntoChunks(
  syll: Array<string>
): [Array<string>, Array<string>, Array<string>] {
  let onset = [];
  let vowel = [];
  let coda = [];
  let state: "onset" | "vowel" | "coda" = "onset";
  for (const p of syll) {
    if (state == "onset") {
      if (consonantsOrExtra.has(p)) {
        onset.push(p);
      } else if (vowels.has(p)) {
        vowel.push(p);
        state = "vowel";
        continue;
      } else {
        // no vowel at all...
        return [[], [], []];
      }
    } else if ((state = "vowel")) {
      // actually, we don't expect multiple vowels in the same syllable...
      // but might as well tolerate it in case of bad data.
      if (vowels.has(p)) {
        vowel.push(p);
      } else {
        coda.push(p);
        state = "coda";
      }
    } else if ((state = "coda")) {
      if (consonantsOrExtra.has(p)) {
        coda.push(p);
      } else {
        // vowels again in coda...
        return [[], [], []];
      }
    }
  }
  return [onset, vowel, coda];
}

if (require.main === module) {
  const graph = createSonorityGraph([
    ["cat", [["c", "a", "t"]]],
    ["hat", [["h", "a", "t"]]],
    ["at", [["a", "t"]]],
    ["ant", [["a", "n", "t"]]],
    ["it", [["i", "t"]]],
    ["hut", [["h", "u", "t"]]],
    ["but", [["b", "u", "t"]]],
    ["booth", [["b", "oʊ", "θ"]]],
    ["boo", [["b", "oʊ"]]],
    ["truth", [["t", "r", "u", "θ"]]],
    ["bun", [["b", "u", "n"]]],
    ["bund", [["b", "u", "n", "d"]]],
    ["bundt", [["b", "u", "n", "d", "t"]]],
    ["bring", [["b", "r", "i", "n", "g"]]],
    ["thing", [["t", "h", "i", "n", "g"]]],
    ["shin", [["s", "h", "i", "n"]]],
    ["sing", [["s", "i", "n", "g"]]],
    ["wing", [["w", "i", "n", "g"]]],
    ["win", [["w", "i", "n"]]],
    [
      "singing",
      [
        ["s", "i", "n", "g"],
        ["i", "n", "g"],
      ],
    ],
  ]);

  console.log("graph:", util.inspect(graph, undefined, 8));
  console.log(printGraph(graph));

  for (var i = 0; i < 10; i++) {
    console.log("random syllable: ", getRandomSyllable(graph).join(""));
  }

  for (var i = 0; i < 3; i++) {
    const palette = ["b", "u", "n", "i", "d", "t", "a", "s", "w"];
    console.log(
      "random syllable in palette: ",
      palette.join(""),
      getRandomSyllableFromPallete(graph, palette)?.join("")
    );
  }
}
