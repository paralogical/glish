import { promises as fs } from "fs";
import {
  createSonorityGraph,
  getRandomSyllable,
  loadSonorityGraph,
  printGraph,
  SonorityGraph,
  SonorityGraphPart,
} from "./sonorityGraph";
import { oneSigFig, pad, progress } from "./util";
import * as util from "util";

async function getWordsByFrequency(): Promise<Array<string>> {
  const content = await fs.readFile("./inputs/word_frequency.txt", {
    encoding: "utf-8",
  });
  const lines = content.split("\n");
  const words = lines.map((line) => line.split("\t")[0]);
  // judging where we should stop counting things as worth including:
  //   for (const i of [
  //     0, 1000, 10000, 30000, 60000, 80000, 100000, 200000, 300000,
  //   ]) {
  //     console.log(`${i}:\t${words.slice(i, i + 15).join("  ")}`);
  //   }
  return words.slice(0, 60000);
}

const APRABET_TO_IPA: { [key: string]: string } = {
  AA: "ɑ", // ɑ or ɒ
  AE: "æ",
  AH: "ʌ",
  AO: "ɔ",
  AW: "aʊ",
  AX: "əɹ", // ɚ
  AXR: "ə",
  AY: "aɪ",
  EH: "ɛ",
  ER: "ɛɹ", // ɝ
  EY: "eɪ",
  IH: "ɪ",
  IX: "ɨ",
  IY: "i",
  OW: "oʊ",
  OY: "ɔɪ",
  UH: "ʊ",
  UW: "u",
  UX: "ʉ",
  //
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  DX: "ɾ",
  EL: "l̩",
  EM: "m̩",
  EN: "n̩",
  F: "f",
  G: "ɡ",
  HH: "h",
  H: "h",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  NX: "ɾ̃",
  P: "p",
  Q: "ʔ",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  V: "v",
  W: "w",
  WH: "ʍ",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};

/**
 * Ordered word ->  syllable arrays
 * very -> [ [v, ɛ], [ɹ, i] ]
 * */
export type SyllablizedIPA = Array<[string, Array<Array<string>>]>;

const syllabilizedIpaFile = "outputs/syllablizedIPA.json";

/**
 * Load previously written syllabized IPA from disk.
 * If it doesn't exist, generate anew.
 */
export async function loadSyllabilizedIpa(): Promise<SyllablizedIPA> {
  try {
    const ipa = await fs.readFile(syllabilizedIpaFile, "utf8");
    const result = JSON.parse(ipa) as SyllablizedIPA;
    console.log("Loaded cached syllabilized IPA");
    return result;
  } catch (err) {
    return generatedSyllabilizedIpa();
  }
}

async function generatedSyllabilizedIpa(): Promise<SyllablizedIPA> {
  const wordsByFrequency = await getWordsByFrequency();
  const wordSet = new Set(wordsByFrequency);

  console.log("loaded %d frequencies", wordSet.size);

  const cmu_file = await fs.readFile("inputs/cmudict.0.6-syl.txt", "utf-8");
  const lines = cmu_file.split("\n");
  console.log(`converting ${lines.length} CMU words into IPA`);
  let i = 0;
  const ipaSyllables: { [key: string]: Array<Array<string>> } = {};
  for (const line of lines) {
    if (line.startsWith("#")) {
      continue;
    }
    i += 1;
    progress(i, lines.length, "");
    if (line.trim() === "") continue;
    const [wordUpper, sounds] = line.split("  ", 2);
    if (/.*\(\d\)$/.test(wordUpper)) continue;
    const syllables = sounds.split(".").map((syll) =>
      syll
        .trim()
        .split(" ")
        .map(
          (phone) =>
            APRABET_TO_IPA[/^([A-Z]+)\d*$/.exec(phone)![1]] ??
            console.log("couldn't find phone ", phone)
        )
    );
    const word = wordUpper.toLowerCase();
    // console.log(" > ", word, "=", syllables);
    ipaSyllables[word] = syllables;
  }

  console.log();

  console.log("sorting by frequency...");

  const orderedResult: SyllablizedIPA = [];
  // insert syllablized one by one
  for (const word of wordsByFrequency) {
    const found = ipaSyllables[word];
    if (found) {
      orderedResult.push([word, found]);
      delete ipaSyllables[word];
    }
  }
  // anything left in ipaSyllables we don't have a frequency for, but we still want to use
  orderedResult.push(...Object.entries(ipaSyllables));

  console.log("writing syllabized ipa result...");

  await fs.writeFile(
    syllabilizedIpaFile,
    JSON.stringify(orderedResult, undefined, 2)
  );

  return orderedResult;
}

/**
 * Construct ordered list of syllablized pronunciations
 * map of word -> IPA split into syllables by |
 * ordered by usage of the word (common words first)
 * ['business', [ ["b", "ɪ", "z"], ["n", "ʌ", "s"] ]]
 * words not in frequency list are appended to the end
 */
export async function loadSyllabalizedPronuncations(): Promise<
  Array<[string, Array<Array<string>>]>
> {
  const syllabilizedIpa = await loadSyllabilizedIpa();
  const graph = await loadSonorityGraph(syllabilizedIpa);

  // const cases = [["b", "l", "u", "l", "b"]];
  // for (const word of cases) {
  //   const result = generateSyllableAlternatives(
  //     word,
  //     graph,
  //     new Map(),
  //     new Set()
  //   );
  //   console.log(">> ", word, result);
  // }
  // return;

  await fs.writeFile(
    "ui/public/syllableGraphDisplayData.json",
    printGraph(graph)
  );
  console.log("wrote graphviz");

  // Uncomment this to generate random syllables (takes a few minutes)
  // await bulkGenerateSyllables(graph);
  console.log("creating lots of random syllables");
  await bulkGenerateSyllablesWithVariations(graph);

  console.log("-----------");

  return syllabilizedIpa;
}

async function bulkGenerateSyllables(graph: SonorityGraph) {
  const syllables = new Map<string, Array<string>>();

  // many attempts with be repeats; 100 million typically generates ~190,000 syllables
  // which is enough to cover our dictionary
  let N = 100000000;
  for (let j = 0; j < N; j++) {
    const s = getRandomSyllable(graph);
    const joined = s.join("");
    if (syllables.has(joined)) {
      continue;
    }
    syllables.set(joined, s);
    if (j % 100 === 0) {
      process.stdout.write("\u001b[2K");
      progress(j, N, oneSigFig((100 * j) / N) + "% " + joined);
    }
  }
  console.log();
  console.log(`created ${syllables.size} unique syllables`);
  console.log("writing random syllables");

  await fs.writeFile(
    "outputs/random_generated_syllables.json",
    JSON.stringify([...syllables.entries()], undefined, 2)
  );
}

// Tests / standalone
if (require.main === module) {
  loadSyllabalizedPronuncations();
}

export type AlternativeCategory = "plural" | "gerund" | "past" | "actor";
export type AlternativesForSylalble = {
  [key in AlternativeCategory]?: Array<string>;
};
export const alternants: { [key in AlternativeCategory]: string } = {
  plural: "z", // bubblez
  gerund: "ŋ", //bubbing
  past: "d", // bubbled
  actor: "ɹ", // bubbler
};

async function bulkGenerateSyllablesWithVariations(graph: SonorityGraph) {
  const syllables = new Map<
    string,
    { syllable: Array<string>; variations?: AlternativesForSylalble }
  >();
  const variations = new Set<string>();

  let numWithVariations = 0;
  let numWithoutVariations = 0;

  // many attempts with be repeats; 100 million typically generates ~150,000 syllables
  // which is enough to cover our dictionary.
  // we get slightly less using variations
  let N = 100_000_000;
  for (let j = 0; j < N; j++) {
    const s = getRandomSyllable(graph);
    const joined = s.join("");
    if (syllables.has(joined) || variations.has(joined)) {
      continue;
    }

    const result: {
      syllable: Array<string>;
      variations?: AlternativesForSylalble;
    } = { syllable: s };
    // try to generate variations

    {
      const foundVariations = generateSyllableAlternatives(
        s,
        graph,
        syllables,
        variations
      );

      if (foundVariations) {
        result.variations = foundVariations;
        for (const variation of Object.values(foundVariations)) {
          variations.add(variation.join(""));
        }
        numWithVariations++;
      } else {
        numWithoutVariations++;
      }
    }

    syllables.set(joined, result);
    if (j % 100 === 0) {
      process.stdout.write("\u001b[2K");
      progress(j, N, oneSigFig((100 * j) / N) + "% " + joined);
    }
  }
  console.log();
  console.log(`created ${syllables.size} unique syllables`);
  console.log(`${numWithVariations} with variations,`);
  console.log(`${numWithoutVariations} without.`);
  console.log("writing random syllables");

  await fs.writeFile(
    "outputs/random_generated_syllables_with_variations.json",
    JSON.stringify([...syllables.entries()], undefined, 2)
  );
}

const vowelRegex = /(ʌ|æ|u|ɔ|ɪ|ɑ|aɪ|i|oʊ|aʊ|eɪ|ɛɹ|ɛ|ʊ|ɔɪ)/;

/**
 * Given a randomly generated syllable,
 * Consider all alternants (plural: add z, past: add d, ...)
 * Find where the alternant could be inserted to make a valid variation.
 * Only tries to insert into the coda (so it's like a suffix)
 *  e.g. "blulb"
 *   extract coda "lb"
 *   for each alternant (z, d, ŋ, ɹ)
 *   find possible insertion points (*lb, l*b, lb*)
 *   compute probability of putting alternant in that place
 *   pick variant with highest
 *   if all 0, that variant is not allowed to exist
 *
 * This function also takes the set of existing variants/syllables so it won't
 * duplicate existing already-generated syllables
 */
function generateSyllableAlternatives(
  syllable: Array<string>,
  graph: SonorityGraph,
  syllables: Map<string, unknown>,
  variations: Set<string>
): AlternativesForSylalble | undefined {
  let alternatives: AlternativesForSylalble | undefined = undefined;

  // const log: typeof console.log = console.log;
  const log: typeof console.log = () => undefined;

  let codaStartIndex = 0;
  let state = "onset";
  for (const letter of syllable) {
    if (state === "onset") {
      if (vowelRegex.exec(letter)) {
        state = "vowel";
      }
    } else if (state === "vowel") {
      if (!vowelRegex.exec(letter)) {
        state = "coda";
        break;
      }
    }
    codaStartIndex++;
  }
  const coda = syllable.slice(codaStartIndex);
  const onsetAndVowel = syllable.slice(0, codaStartIndex);

  log(syllable.join(""), "parts", onsetAndVowel.join(""), coda.join(""));

  const codaGraph = graph.parts[2];

  // probability counts should be at least this to consider it valid
  // this helps avoid `zz` and other weird insertions
  const MIN_SCORE = 2;

  for (const [kind, alternant] of Object.entries(alternants) as Array<
    [AlternativeCategory, string]
  >) {
    // one extra spot at the end
    // blulb -> lb ->  l b
    //                0 1 2
    // e.g.: try to insert 'z'
    const scores: Array<[number, Array<string>]> = Array(coda.length + 1).fill([
      0,
      [],
    ]);

    log(syllable.join(""), "+", alternant);
    for (let spot = 0; spot < coda.length + 1; spot++) {
      if (spot === 0) {
        // beginning: zlb

        const realization = [...onsetAndVowel, alternant, ...coda];
        const joinedRealization = realization.join("");

        log("  considering", joinedRealization);
        if (
          syllables.has(joinedRealization) ||
          variations.has(joinedRealization)
        ) {
          log("  already realized");
          // this variant has been used before
          continue;
        }

        // possible next steps after starting with the alternant: z->t, z->d, ...
        const starting = codaGraph.get(alternant);
        if (starting == null) {
          log("  not a possible start");
          continue;
        }

        // find which next step actually applies
        const result = starting.find(([next, value]) => next === coda[0]);
        if (result == null || result[1] <= MIN_SCORE) {
          log("  not possible to insert continuation");
          continue;
        }

        // if it's possible, take this score
        scores[spot] = [result[1], realization];
      } else {
        // between letters: lzb
        // or end: lbz

        const realization = [
          ...onsetAndVowel,
          ...coda.slice(0, spot),
          alternant,
          ...coda.slice(spot),
        ];
        const joinedRealization = realization.join("");

        log("  considering", joinedRealization);
        if (
          syllables.has(joinedRealization) ||
          variations.has(joinedRealization)
        ) {
          log("  already realized");
          // this variant has been used before
          continue;
        }

        const previous = coda[spot - 1];
        const after = coda[spot]; // undefined at end

        // possible next steps after starting with the previous: l->z, ...
        const starting = codaGraph.get(previous);
        if (starting == null) {
          // should never happen, since we're here now...
          log("  not a possible start (uh oh)", previous);
          continue;
        }

        // find which next step actually applies the alternant
        // l->z
        const result = starting?.find(([next, value]) => next === alternant);
        if (result == null || result[1] <= MIN_SCORE) {
          log(
            `  alternant is not possible continuation (${previous} -> ${alternant})`
          );
          continue;
        }

        // additionally, after the alternant we must be able to resume the word
        let continued = null;
        if (after != null) {
          // this is the end

          const continuations = codaGraph.get(alternant);
          const continued = continuations?.find(
            ([next, value]) => next === after
          );
          if (continued == null || continued[1] <= MIN_SCORE) {
            log(
              `  alternant could not be continued by next (${alternant} -> ${after})`
            );
            continue;
          }
        }

        // if it's possible, take the average score (or just the predecessor on the last letter)
        scores[spot] = [
          continued == null ? result[1] : (result[1] + continued[1]) / 2,
          realization,
        ];

        log("  score: ", scores[spot][0], scores[spot][1].join(""));
      }
    }

    // pick the highest scoring alternant location
    let max: [number, Array<string>] = [0, []];
    for (const [score, realization] of scores) {
      if (score > max[0]) {
        max = [score, realization];
      }
    }

    const [bestScore, realization] = max;

    if (bestScore > 0) {
      if (alternatives == null) {
        alternatives = {};
      }
      alternatives[kind] = realization;
    }
  }
  return alternatives;
}
