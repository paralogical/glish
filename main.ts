import { promises as fs } from "fs";
import { stringify } from "querystring";
import { isBooleanObject } from "util/types";

async function getWordsByFrequency(): Promise<Array<string>> {
  const content = await fs.readFile("./word_frequency.txt", {
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

type WiktionaryEntry = {
  word: string;
  sounds: Array<{
    ipa?: string;
    enPR?: string;
  }>;
};

async function getPronuncationsMap(
  wordSet: Set<string>
): Promise<Map<string, Array<IPA>>> {
  // TODO: just write this to disk to have a known set of these instaed of recreating it each time

  const pronunciationsForWord = new Map<string, Array<IPA>>();

  let numIn = 0;
  let numOut = 0;

  const file = await fs.readFile("./en_data2.json", { encoding: "utf-8" });
  for (const line of file.split("\n")) {
    try {
      const obj: WiktionaryEntry = JSON.parse(line);
      //   console.log(obj.word);
      if (wordSet.has(obj.word)) {
        numIn++;
      } else {
        numOut++;
      }
      // TODO: convert  "enPR" format to IPA and use that preferrably, since some given IPA pronuncations don't include all syllables
      const pronunciations = [];
      for (const entry of obj.sounds) {
        if (entry.enPR) {
          // put converted enPR to the front
          pronunciations.unshift(enPrToIPA(entry.enPR));
        } else if (entry.ipa) {
          // remove leading/trailing [] or //
          pronunciations.push(entry.ipa.replace(/(^[\[\/]|[\]\/]$)/g, ""));
        }
      }
      pronunciationsForWord.set(obj.word, pronunciations);
      // TODO: we might need to use "forms" to fill in plurals and such
    } catch (err) {}
  }

  let s = "{\n";
  let num = 0;
  for (const [word, pronounciations] of pronunciationsForWord.entries()) {
    if (wordSet.has(word) && pronounciations.length > 0) {
      s += `"${word}": ${JSON.stringify(pronounciations)},\n`;
      num++;
    }
  }
  s += "}\n";

  await fs.writeFile("./pronunciations.json", s, { encoding: "utf-8" });

  console.log("num included:", numIn);
  console.log("num NOT incuded:", numOut);

  return pronunciationsForWord;
}

type IPA = string;

type Context = {
  monosyllabizedWordsList: Array<
    [
      /* original word in english */ string,
      /* original pronunciation */ IPA,
      /* monosyllabic pronunciation */ IPA
    ]
  >; // words in IPA so far in order
  monosyllabizedWordsSet: Set<IPA>; // words so far, to check for inclusion / already exists
};

type StategyFn = (syllables: Array<IPA>, ctx: Context) => string | null;
const strategies: Array<StategyFn> = [eachSyllable(notUsedYet)];

type StategyForSyllableFn = (
  syllable: IPA,
  syllables: Array<IPA>,
  ctx: Context
) => string | undefined;

/**
 * If the syllable is no already in our list of monosyllablized words, we can use it directly
 * e.g. business -> bɪz
 */
function notUsedYet(syllable: IPA, _syllables: Array<IPA>, ctx: Context) {
  return ctx.monosyllabizedWordsSet.has(syllable) ? undefined : syllable;
}

/**
 * Given a strategy that is centered on an existing syllable,
 * try it for each syllable in the word in order from left to right.
 * e.g. business would try `strat` on /bɪz/ then /nɪs/
 */
function eachSyllable(strat: StategyForSyllableFn): StategyFn {
  return (syllables: Array<IPA>, ctx: Context) =>
    syllables.find((syllable) => strat(syllable, syllables, ctx));
}

async function main() {
  const wordsByFrequency = await getWordsByFrequency();
  const wordSet = new Set(wordsByFrequency);

  const pronunciationsForWord = await getPronuncationsMap(wordSet);

  return;

  const orderedWordsWithPronunciations = wordsByFrequency.filter((word) =>
    pronunciationsForWord.has(word)
  );

  const ctx: Context = {
    monosyllabizedWordsList: [],
    monosyllabizedWordsSet: new Set(),
  };

  // create monosyllabic forms of all words using our strategy

  for (const word of orderedWordsWithPronunciations) {
    const pronunciations = pronunciationsForWord.get(word);
    const pronunciation = pronunciations[0]; // TODO: pick best of options somehow

    const syllables = pronunciation
      .split(/['.]/)
      .filter((syl) => syl.length > 0);

    if (syllables.length === 0) {
      console.error(
        `"${word}" has no syllables...? ${pronunciations.join(", ")}`
      );
      continue;
    } else if (syllables.length === 1) {
      ctx.monosyllabizedWordsList.push([word, pronunciation, pronunciation]);
      ctx.monosyllabizedWordsSet.add(pronunciation);
    } else {
      // we need to convert this word to be one syllable

      for (const strategy of strategies) {
        const result = strategy(syllables, ctx);
        if (result != null) {
          ctx.monosyllabizedWordsList.push([word, pronunciation, result]);
          ctx.monosyllabizedWordsSet.add(result);
        } else {
          console.error(
            `No strategy produced a monosyllabized verison of "${word}"`
          );
          // TODO: just construct a random IPA for it instead...? Or, just make our strategies good
        }
      }
    }
  }

  // evaluate the monosyllabic forms

  // save word pronunciation mapping to disk

  // update
}

main();

const knownEvaluations: {
  [origWord: string]: Array<{ score: 1 | 2 | 3 | 4 | 5; monosyllabized: IPA }>;
} = {};

const wordsToEvaluate = [];

function evaluate(context: Context) {}

// Note: substitute with longest prefix, so this list should be ordered by length: 'th' before 't'
const mapping = {
  // consonants
  b: "b",
  ch: "t͡ʃ",
  d: "d",
  f: "f",
  g: "ɡ",
  hw: "ʍ",
  h: "h",
  j: "d͡ʒ",
  ᴋʜ: "x",
  k: "k",
  l: "l",
  m: "m",
  ng: "ŋ",
  n: "n",
  p: "p",
  r: "ɹ",
  sh: "ʃ",
  s: "s",
  th: "θ",
  t: "t",
  "''th''": "ð",
  v: "v",
  w: "w",
  y: "j",
  zh: "ʒ",
  z: "z",

  // vowels
  är: "ɑɹ",
  ăr: "æɹ, ɛɹ",
  âr: "eɹ, ɛɚ",
  ä: "ɑ",
  ă: "æ",
  ā: "eɪ",
  "(ē)": "i",
  ĕr: "ɛɹ",
  ĕ: "ɛ",
  ē: "i",
  "(ĭ)": "ɪ",
  ĭr: "ɪɹ",
  îr: "ɪɚ, ɪɹ",
  ĭ: "ɪ",
  ī: "aɪ",
  o͝o: "ʊ",
  ŏŏ: "ʊ",
  o͝or: "ʊɹ",
  ŏŏr: "ʊɹ",
  o͞o: "u",
  ōō: "u",
  ŏr: "ɑɹ",
  ôr: "ɔɹ",
  oi: "ɔɪ",
  ou: "aʊ",
  ŏ: "ɑ",
  ō: "oʊ",
  ô: "ɔ",
  ûr: "ɝ",
  ŭ: "ʌ",
  ər: "ɚ",
  ə: "ə",
  "-": ".",
  ʹ: "ˈ",
  "'": "ˌ",
};

function enPrToIPA(enPr: string): string {
  const parts = [];
  let remaining = enPr;
  while (remaining.length > 0) {
    let foundAny = false;
    for (const [prefix, replacement] of Object.entries(mapping)) {
      if (remaining.startsWith(prefix)) {
        parts.push(replacement);
        remaining = remaining.slice(prefix.length);
        foundAny = true;
      }
    }
    if (!foundAny) {
      console.error(
        `error converting enPR to IPA for '${enPr}', stuck at '${remaining}'`
      );
      remaining = remaining.slice(1);
    }
  }
  return parts.join("");
}

console.log(enPrToIPA(`sĭt-yo͞o-ā'shən`));

/////---------------------------------------

function createSyllabalizedPhonetics() {
  const syllables = new Map<string, string>();
  const pronunciations = new Map<string, string>();

  for (const [word, syllable] of syllables.entries()) {
    const parts = syllable.split("�");
    const pronounce = "";
  }
}

/**
 * read lines like 'dictionary=dic�tion�ar�y' from syllables file,
 * return map like 'dictionary' => ['dic', 'tion', 'ar', 'y']
 */
async function loadSyllables(): Promise<Map<string, Array<string>>> {
  const content = await fs.readFile("./Syllables.txt", {
    encoding: "utf-8",
  });

  const syllables = new Map<string, Array<string>>();

  for (const rawline of content.split("\n")) {
    const line = rawline.trim();
    const [word, syllablesString] = line.split("=");
    if (word == null || syllablesString == null) {
      continue;
    }
    const wordSyllables = syllablesString.split("�");
    syllables.set(word, wordSyllables);
  }
  return syllables;
}
