import { promises as fs } from "fs";
import {
  createSonorityGraph,
  getRandomSyllable,
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
 * Construct ordered list of syllablized pronunciations
 * map of word -> IPA split into syllables by |
 * ordered by usage of the word (common words first)
 * ['business', [ ["b", "ɪ", "z"], ["n", "ʌ", "s"] ]]
 * words not in frequency list are appended to the end
 */
export async function loadSyllabalizedPronuncations(): Promise<
  Array<[string, Array<Array<string>>]>
> {
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

  const orderedResult: Array<[string, Array<Array<string>>]> = [];
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
    "outputs/syllablizedIPA.json",
    JSON.stringify(orderedResult, undefined, 2)
  );

  console.log("creating sonority graph");
  const graph = createSonorityGraph(orderedResult);
  console.log();

  const stringGraphPart = (part: SonorityGraphPart) => {
    return Object.fromEntries(
      [...part.entries()].map(([k, v]) => [k == undefined ? null : k, v])
    );
  };
  await fs.writeFile(
    "outputs/syllableGraph.json",
    JSON.stringify(
      {
        onset: stringGraphPart(graph.parts[0]),
        vowel: stringGraphPart(graph.parts[1]),
        coda: stringGraphPart(graph.parts[2]),
      },
      undefined,
      2
    )
  );
  console.log("wrote syllable graph");

  await fs.writeFile(
    "ui/public/syllableGraphDisplayData.json",
    printGraph(graph)
  );
  console.log("wrote graphviz");

  // Uncomment this to generate random syllables (takes a few minutes)
  // console.log("creating lots of random syllables");
  // await bulkGenerateSyllables(graph);

  console.log("-----------");

  return orderedResult;
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
