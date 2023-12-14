import { promises as fs } from "fs";
import { stringify } from "querystring";
import { isBooleanObject } from "util/types";
import { groupIPASymbols, iteratePartitions } from "./partition";

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

  console.log("loaded %d frequencies", wordSet.size);

  const syllables = await loadSyllables();
  // console.log(syllables);

  console.log("loaded %d syllablizations", syllables.size);

  const pronunciations = await loadPronunciations();
  console.log("loaded %d pronunciations", pronunciations.size);

  // const pronunciationsForWord = await getPronuncationsMap(wordSet);

  // list of words in order of frequency, including their pronunciation and syllablization
  const orderedWordsWithPronunciations = wordsByFrequency
    .map((word): [string, Array<string>, string] => {
      const syllable = syllables.get(word);
      if (syllable == null) return null;

      const pronunciation = pronunciations.get(word);
      if (pronunciation == null) return null;

      return [word, syllable, pronunciation];
    })
    .filter(Boolean);

  // console.log(orderedWordsWithPronunciations);
  console.log(
    "found  %d words with syllables and pronunciations",
    orderedWordsWithPronunciations.length
  );

  console.log("constructing syllablized pronunciations...");
  const syllablizedPronuncations = constuctSyllablizedPronunciations(
    // orderedWordsWithPronunciations
    orderedWordsWithPronunciations.slice(0, 300)
  );

  // console.log(syllablizedPronuncations);
  for (const [word, ipasyllables] of syllablizedPronuncations) {
    if (ipasyllables.includes("|")) {
      const referenceSyllables = syllables.get(word);
      console.log(
        `${pad(word, 15)} ${pad(ipasyllables, 20)} ${referenceSyllables.join(
          "|"
        )}`
      );
    }
  }
  // console.log(syllablizedPronuncations.slice(100, 120));

  evaluateSyllablization(syllablizedPronuncations, syllables);

  // const allIPASymbols = new Set();
  // for (const word of pronunciations.values()) {
  //   for (const symbol of word) {
  //     allIPASymbols.add(symbol);
  //   }
  // }
  // console.log("all IPA: ");
  // console.log([...allIPASymbols].map((s) => `['${s}', []],`).join("\n"));

  return;

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
    if (!syllables.has(word)) {
      // if we already got it, just take the first one
      syllables.set(word, wordSyllables);
    }
  }
  return syllables;
}

/**
 * read json file with pronunciations like {"dictionary": ["ˈdɪkʃənəɹi","ˈdɪkʃənɹi","ˈdɪkʃnəɹi","ˈdɪkʃəˌnɛɹi"],}
 * take first given pronunciation,
 * return map like 'dictionary' => "ˈdɪkʃənəɹi"
 */
async function loadPronunciations(): Promise<Map<string, string>> {
  const content = await fs.readFile("./pronunciations.json", {
    encoding: "utf-8",
  });

  const data = JSON.parse(content);

  const pronunciations = new Map<string, string>();
  for (const [key, value] of Object.entries(data)) {
    const filtered = (value[0] as string) // take first given pronunciation....hopefully its the one we want
      .replace(/['ˈˌˈ]/g, ""); // remove stress from IPA
    pronunciations.set(key, filtered);
  }

  return pronunciations;
}

function constuctSyllablizedPronunciations(
  words: Array<[string, Array<string>, string]>
): Array<[string, string]> {
  return words.map((values, i) => {
    return constuctSyllablizedPronunciation(values);
  });
}

function constuctSyllablizedPronunciation(
  value: [string, Array<string>, string],
  shouldLog: boolean = false
): [string, string] {
  const [word, syllables, pronunciation] = value;
  const scores: Array<{ score: number; partition: Array<string> }> = [];
  const log = shouldLog ? console.log : () => {};
  log("Evaluating ", value);
  // console.log("Evaluating ", value);
  const pronunciationParts = groupIPASymbols(pronunciation);
  for (const partition of iteratePartitions(
    pronunciationParts,
    syllables.length
  )) {
    log("%s: evaluating %s against %s", word, partition, syllables);
    let score = 0;
    // compare each potential syllable against the real syllable
    for (let i = 0; i < partition.length; i++) {
      const letters = partition[i];
      const goal = syllables[i];
      if (letters[0] === "ˈ") {
        score += 1; // if there is a `'`, it should be at the start
      }
      if (letters[0] === ".") {
        score += 10; // if there is a `'`, it should be at the start
        // except sometimes the pronunciation or syllables are weird, so it's not that important
      }
      if (letters.every((l) => consonantsOrExtra.has(l))) {
        score -= 5; // consonants shouldn't be by themselves as a syllable
      }

      // length heuristic, ignoring some characters like .
      const filteredLetters = letters.filter((l) => l !== ".");
      const lengthDiff = Math.abs(filteredLetters.length - goal.length);
      score -= lengthDiff * lengthDiff; // square to punish very big differences

      // exact correlation: if every letter correlates 1:1 with other letters exactly matching the length,
      // that's a really strong signal
      if (lengthDiff == 0) {
        let remaining = goal;
        let allMatch = true;
        //  pɹɪv  pri
        for (const letter of filteredLetters) {
          const correlate = correlates.get(letter);
          if (correlate == null) {
            allMatch = false;
            break;
          }
          let found = false;
          for (const corr of correlate) {
            if (remaining.startsWith(corr)) {
              found = true;
              remaining = remaining.slice(corr.length);
              break;
            }
          }
          if (found) {
            continue;
          } else {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          // log("all match: ", goal, letters.join(""));
          score += 8;
        }
      }

      // correlation of all letters in syllable
      for (const letter of letters) {
        const potentials = correlates.get(letter);
        log("    potentials for %s: %s", letter, potentials);
        if (potentials && potentials.length > 0) {
          for (const potential of potentials) {
            // log("    looking for %s in %s", potential, goal);
            if (goal.includes(potential)) {
              score += 1;
            }
          }
        }
      }
    }
    log(" => ", score);
    scores.push({ score, partition: partition.map((p) => p.join("")) });
    // TODO: other heuristics like matching syllable length,
    // removing letters once they correlate...?
    // TODO: punish `'` by itself, encourage it at start of a syllable
    // TODO: discourage single letters
    // TODO: encourage vowel + consonant
    // TODO: check if letters in-order match exactly (consume as you read them)
  }
  let best = { score: -100000, partition: [] };
  for (const result of scores) {
    if (result.score > best.score) {
      best = result;
    }
  }
  return [word, best.partition.join("|")];
}

// used for preventing only-consonant syllables
const consonantsOrExtra = new Set(
  ".bcdfghjklmnpqrstvwxz" +
    "dʒ" +
    "l̥" +
    "kʰ" +
    "d͡ʒ" +
    "tʰ" +
    "(ɹ)" +
    "(n)" +
    "(j)" +
    "(t)" +
    "t͡s" +
    "ð" +
    "z" +
    "ʃ" +
    "ɹ" +
    "θ" +
    "ɡ" +
    "ʒ" +
    "ɝ" +
    "ŋ" +
    "ɚ" +
    "ʍ" +
    "ɫ" +
    "˨" +
    "x" +
    "ʔ" +
    "ɾ" +
    "ɵ" +
    "ɯ"
);

const correlates = new Map([
  ["dʒ", ["j", "ge", "dr"]],
  ["eɪ", ["a", "e"]],
  ["l̥", ["l"]],
  ["kʰ", ["c", "k"]],
  ["ʌ̃", ["u"]],
  ["ɔː", ["o"]],
  ["d͡ʒ", ["ge", "j", "dr"]],
  ["ɜː", ["e"]],
  ["aɪ", ["i", "igh"]],
  ["tʰ", ["th"]],
  ["əʊ", ["o"]],
  ["(ɹ)", ["r"]],
  ["ɔː", ["o"]],
  ["ɜː", ["er"]],
  ["ɑː", ["a"]],
  ["uː", ["u"]],
  ["iː", ["i"]],
  ["(ː)", []],
  ["(n)", ["n"]],
  ["(j)", ["y"]],
  ["(ʊ)", ["o"]],
  ["(ə)", ["j"]],
  ["(t)", ["t"]],
  ["(s)", ["s"]],
  ["t͡s", ["ze"]],
  //
  ["ˈ", []],
  ["ˌ", []],
  [".", []],
  //
  ["'", []],
  ["ɪ", ["i", "y", "e"]],
  ["ə", ["er", "e", "i"]],
  ["æd", ["a"]],
  ["ʊ", ["o"]],
  ["ð", ["th"]],
  ["z", ["s"]],
  ["ʃ", ["sh"]],
  ["ɹ", ["r"]],
  ["θ", ["th"]],
  ["ɔ", ["o"]],
  ["æ", ["ae", "a"]],
  ["ɡ", ["g"]],
  ["ɑ", ["a"]],
  ["ɜ", ["e"]],
  ["ʊ", ["u", "ou"]],
  ["ɒ", ["o"]],
  ["ɛ", ["e"]],
  ["ʌ", ["u"]],
  ["ʒ", ["j", "g"]],
  ["ɝ", ["er"]], //?
  ["ŋ", ["n", "ng"]],
  ["ɚ", ["er"]], //?
  ["ʍ", ["w"]],
  ["ɨ", ["i"]],
  ["ʉ", ["u"]],
  ["ɫ", ["l"]],
  ["˨", ["t"]],
  ["ɐ", ["a"]], //?
  ["x", ["x"]],
  ["ʔ", ["t"]],
  ["ɘ", ["e"]], //?
  ["ɾ", ["t"]],
  ["ɵ", ["th"]],
  ["ɯ", ["l"]],
  ["ä", ["a"]], //?

  // combiners
  // ["(", []],
  // [")", []],
  // ["͡", []],
  // [" ̩", []],
  // ["̯", []],
  // ["ʰ", []],
  // ["̥", []],
  // ["̃", []],
  // ["ʷ", []],
  // ["̚", []],
  // ["˦", []],
  // ["˧", []],
  // regular ascii
  ["a", ["a"]],
  ["b", ["b"]],
  ["c", ["c"]],
  ["d", ["d"]],
  ["e", ["e"]],
  ["f", ["f"]],
  ["g", ["g"]],
  ["h", ["h"]],
  ["i", ["i", "y"]],
  ["j", ["j", "y"]],
  ["k", ["k", "c"]],
  ["l", ["l"]],
  ["m", ["mb" /* b can be silent: lamb, number */, "m"]],
  ["n", ["n"]],
  ["o", ["o"]],
  ["p", ["p"]],
  ["q", ["q"]],
  ["r", ["r"]],
  ["s", ["s", "c"]],
  ["t", ["t"]],
  ["u", ["u"]],
  ["v", ["v"]],
  ["w", ["w"]],
  ["x", ["x"]],
  ["y", ["y"]],
  ["z", ["z"]],
]);

const tests = [
  // one-syllable sanity test
  ["post", "pəʊst"],
  ["her", "hɜː(ɹ)"],
  ["add", "æd"],
  // tricky cases
  ["message", "mɛs|ɪd͡ʒ"], // honestly, both this and mɛ|sɪd͡ʒ are OK
  ["available", "ə|veɪl|ə|b(ə)l"],
  ["software", "sɒf(t)|wɛə"],
  ["copyright", "kɑp|i|ɹaɪt"],
  ["information", "ɪn|.fə|meɪ|.ʃən"],
  ["service", "sɜːv|ɪs"],
  ["data", "deɪ|tə"],
  ["order", "ɔː|də"],
  ["privacy", "pɹɪ|v.ə|.si"],
  ["music", "mjuː|zɪk"],
  // validated good cases
  ["system", "sɪs|təm"],
  ["city", "sɪt|i"],
  ["policy", "pɒl|ə|si"],
  ["number", "nʌm|bɚ"],
  ["support", "sə|pɔːt"],
  ["after", "ɑːf|.tə(ɹ)"],
  ["video", "vɪd|.i|.əʊ"],
  ["about", "ə| baʊt"],
  ["other", "ʌð|ə(ɹ)"],
  ["any", "ɛn|ɪ"],
  ["only", "əʊn|.li"],
  ["contact", "kɑn|tækt"],
  ["here", "hɪə(ɹ)"],
  ["business", "bɪz|.nɪs"],
  ["also", "ɔːl|.səʊ"],
  ["am", "æm"],
  ["services", "sɜː|vɪs|ɪz"],
  ["people", "piː|pəl"],
  ["over", "əʊ|.və(ɹ)"],
  ["into", "ɪn|.tuː"],
  ["product", "pɹɒd|.əkt"],
  ["system", "sɪs|təm"],
  ["city", "sɪt|i"],
  ["policy", "pɒl|ə|si"],
  ["number", "nʌm|bɚ"],
  ["info", "ɪn|fəʊ"],
  ["public", "pʌb|lɪk"],
  ["review", "ɹɪ|vjuː"],
  ["very", "vɛɹ|i"],
  ["company", "kʌm|p(ə)|ni"],
  ["general", "d͡ʒɛn|əɹ|əl"],
  ["many", "mɛn|i"],
  ["user", "juː|zə"],
  ["under", "ʌn|də(ɹ)"],
  ["research", "ɹɪ|sɜːtʃ"],
  ["university", "juː|nɪ|vɜː|sə|ti"],
  ["program", "pɹəʊ|ɡɹæm"],
  ["management", "mæn|ɪdʒ|mənt"],
  ["united", "juː|naɪt|ɪd"],
  ["hotel", "(h)əʊ|tɛl"],
  ["real", "ɹeɪ|ɑːl"],
  ["item", "aɪ|təm"],
  ["center", "sɛn|.tɚ"],
  ["travel", "tɹæv|əl"],
  ["report", "ɹɪ|pɔɹt"],
  ["member", "mɛm|bə"],
  ["before", "bɪ|fɔː"],
  ["because", "bɪ|kɒz"],

  ["education", "ɛd͡ʒ|.ʊ|keɪ|.ʃən"],
  ["area", "ɛə|.ɹɪ|.ə"],
  ["reserved", "ɹɪ|zɝvd"],
  ["security", "sɪ|kjʊə|ɹə|ti"],
  ["water", "wɔ|tər"],
  ["profile", "pɹo|ʊfaɪl"],
  ["insurance", "ɪn|.ʃʊɹ|.əns"],

  ["local", "ləʊ|kl̩"],
  ["using", "juː|.zɪŋ"],
  ["office", "ɒf|ɪs"],
  ["national", "na|ʃn̩|(ə)l"],
  ["design", "dɪ|zaɪn"],
  ["address", "ə|dɹɛs"],
  ["community", "kəm|juː|nɪ|ti"],
  ["within", "wɪð|ɪn"],
  ["shipping", "ʃɪ|pɪŋ"],
  ["subject", "səb|dʒɛkt"],
  ["between", "bɪ|twiːn"],
  ["forum", "fɔː|ɹəm"],
  ["family", "fæm|(ɪ)|li"],
  ["even", "iː|vən"],
  ["special", "spɛ|ʃ.əl"],
  ["index", "ɪn|dɛks"],
  ["being", "biː|ɪŋ"],
  ["women", "wɪm|.ɪn"],
  ["open", "əʊ|.pən"],
  ["today", "tə|deɪ"],
  ["technology", "tɛk|nɒl|ə|dʒi"],
  ["project", "pɹɒdʒ|ɛkt"],
  ["version", "vɝ|ʒən"],
  ["section", "sɛk|ʃən"],
  ["related", "ɹɪ|leɪt|ɪd"],
  ["county", "kaʊn|ti"],
  ["photo", "fəʊ|.təʊ"],
  ["power", "paʊ|ə(ɹ)"],
  ["network", "nɛt|wɜːk"],
  ["computer", "kəm|pjuː|tə"],
  ["total", "təʊ|.təl"],
  ["following", "fɒl|əʊ|ɪŋ"],
  ["without", "wɪθ|aʊt"],
  ["access", "æk|sɛs"],
  ["current", "kʌ|ɹənt"],
  ["media", "miː|dɪ|ə"],
  ["control", "kən|tɹəʊl"],
  ["history", "hɪs|t(ə)|ɹi"],
  ["personal", "pɜː|.sən|.əl"],
  ["including", "ɪn|kluːd|ɪŋ"],
  ["directory", "dɪ|ɹɛk|tə|ɹi"],
  ["location", "lo|ʊk|eɪʃən"],
  ["rating", "ɹeɪt|ɪŋ"],
  ["government", "ɡʌv|ə(n)|mənt"],
  ["children", "t͡ʃɪl|dɹən"],
  ["during", "djʊə|.ɹɪŋ"],
  ["return", "ɹɪ|tɜːn"],
  ["shopping", "ʃɑ|pɪŋ"],
  ["account", "ə|.kaʊnt"],
  ["level", "lɛv|.əl"],
  ["digital", "dɪd͡ʒ|ɪt|l̩"],
  ["previous", "pɹi|vi|.əs"],
  ["image", "ɪm|ɪd͡ʒ"],
  ["department", "dɪ|pɑːt|m(ə)nt"],
  ["title", "taɪ|tl̩"],
  ["description", "dɪ|skɹɪp|ʃən"],
  ["another", "ən|ʌð|.ə(ɹ)"],
];

function evaluateSyllablization(
  syllablizedPronuncations: Array<[string, string]>,
  syllablizized: Map<string, Array<string>>
) {
  const syllablized = new Map(syllablizedPronuncations);
  let right = 0;
  let wrong = 0;
  for (const [test, answer] of tests) {
    const found = syllablized.get(test);
    if (found === answer) {
      // console.log(`✅ ${test} -> ${answer}`);
      right++;
    } else {
      console.log(
        `❌ ${pad(test, 15)}  Expect ${pad(answer, 20)}  got ${pad(
          found,
          20
        )}   Reference: ${syllablizized.get(test).join("|")}`
      );
      wrong++;
    }
  }
  const score = right / (right + wrong);
  const WIDTH = 50;
  console.log("");
  console.log("✅".repeat(WIDTH * score) + "❌".repeat(WIDTH * (1 - score)));
  console.log(
    `Score: ${Math.floor(10 * 100 * score) / 10}%   (${right}/${right + wrong})`
  );
}

function pad(s: string, l: number): string {
  return (s + " ".repeat(l)).slice(0, l);
}
