import { promises as fs } from "fs";
import { groupIPASymbols, iteratePartitions } from "./partition";
import { pad } from "./util";

/*
Given a word, plus its syllablization plus its IPA pronunciation,
produce the IPA syllablization
// [business, [busi, ness], bɪznɪs] -> [bɪz, nɪs]
*/
export function constuctSyllablizedPronunciations(
  words: Array<[string, Array<string>, string]>
): Array<[string, string]> {
  return words.map((values, i) => {
    return constuctSyllablizedPronunciation(values);
  });
}

export function constuctSyllablizedPronunciation(
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
      //   if (letters[0] === "ˈ") {
      //     score += 1; // if there is a `'`, it should be at the start
      //   }
      if (letters[0] === ".") {
        score += 15; // if there is a `'`, it should be at the start
        // except sometimes the pronunciation or syllables are weird, so it's not that important
      }
      if (letters.every((l) => consonantsOrExtra.has(l))) {
        score -= 5; // consonants shouldn't be by themselves as a syllable
      }

      // length heuristic, ignoring some characters like .
      const filteredLetters = letters.filter((l) => l !== ".");
      const lengthDiff = Math.abs(filteredLetters.length - goal.length);
      score -= lengthDiff * lengthDiff; // square to punish very big differences

      // vowel forms, discourage e.g. vowel-consonant-vowel
      const form = vowelFormForLetters(letters);
      if (["CVC", "CV", "VC", "V", "C"].includes(form)) {
        score += 15;
      }

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
    scores.push({
      score,
      partition: partition.map((p) => p.join("").replace(/\./g, "")),
    });
    // TODO: encourage vowel + consonant
    // TODO: check word vowel form: VCV not ok but CVC is fine
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
    // "ɚ" + // ???
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
  ["'", []],
  //
  ["ɪ", ["i", "y", "e"]],
  ["ə", ["er", "e", "i", "a"]],
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
  ["add", "æd"],
  // tricky cases
  ["message", "mɛs|ɪd͡ʒ"], // honestly, both this and mɛ|sɪd͡ʒ are OK
  ["available", "ə|veɪl|ə|b(ə)l"],
  ["software", "sɔft|wɛɹ"],
  ["copyright", "kɑp|i|ɹaɪt"],
  ["information", "ɪn|fə|meɪ|ʃən"],
  ["service", "sɝv|ɪs"],
  ["data", "deɪ|tə"],
  ["order", "ɔɹ|dɚ"],
  ["privacy", "pɹɪ|və|si"],
  ["music", "mjuː|zɪk"],
  // validated good cases
  ["system", "sɪs|təm"],
  ["city", "sɪt|i"],
  ["policy", "pɒl|ə|si"],
  ["number", "nʌm|bɚ"],
  ["support", "sə|pɔɹt"],
  ["after", "ɑːf|tə(ɹ)"],
  ["video", "vɪd|i|əʊ"],
  ["about", "ə|baʊt"],
  ["other", "ʌð|ə(ɹ)"],
  ["any", "ɛn|ɪ"],
  ["only", "əʊn|li"],
  ["contact", "kɑn|tækt"],
  ["business", "bɪz|nɪs"],
  ["also", "ɔːl|səʊ"],
  ["services", "sɝ|vɪs|ɪz"],
  ["people", "piː|pəl"],
  ["over", "əʊ|və(ɹ)"],
  ["into", "ɪn|tuː"],
  ["product", "pɹɒd|əkt"],
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
  ["user", "ju|zɚ"],
  ["under", "ʌn|də(ɹ)"],
  ["research", "ɹɪ|sɜːtʃ"],
  ["university", "ju|nɪ|vɝ|sə|ti"],
  ["program", "pɹəʊ|ɡɹæm"],
  ["management", "mæn|ɪdʒ|mənt"],
  ["united", "juː|naɪt|ɪd"],
  ["hotel", "(h)əʊ|tɛl"],
  ["real", "ɹeɪ|ɑːl"],
  ["item", "aɪ|təm"],
  ["center", "sɛn|tɚ"],
  ["travel", "tɹæv|əl"],
  ["report", "ɹɪ|pɔɹt"],
  ["member", "mɛm|bɚ"],
  ["before", "bə|fɔɹ"],
  ["because", "bɪ|kɒz"],

  ["education", "ɛd͡ʒ|ʊ|keɪ|ʃən"],
  ["area", "ɛɚ|i|ə"],
  ["reserved", "ɹɪ|zɝvd"],
  ["security", "sɪ|kjʊə|ɹə|ti"],
  ["water", "wɔ|tər"],
  ["profile", "pɹoʊ|faɪl"],
  ["insurance", "ɪn|ʃʊɹ|əns"],

  ["local", "ləʊ|kl̩"],
  ["using", "juː|zɪŋ"],
  ["office", "ɒf|ɪs"],
  ["national", "na|ʃn̩|(ə)l"],
  ["design", "dɪ|zaɪn"],
  ["address", "əd|ɹɛs"],
  ["community", "kəm|juː|nɪ|ti"],
  ["within", "wɪð|ɪn"],
  ["shipping", "ʃɪ|pɪŋ"],
  ["subject", "səb|dʒɛkt"],
  ["between", "bɪ|twiːn"],
  ["forum", "fɔː|ɹəm"],
  ["family", "fæm|(ɪ)|li"],
  ["even", "iː|vən"],
  ["special", "spɛʃ|əl"],
  ["index", "ɪn|dɛks"],
  ["being", "biː|ɪŋ"],
  ["women", "wɪm|ɪn"],
  ["open", "əʊ|pən"],
  ["today", "tə|deɪ"],
  ["technology", "tɛk|nɒl|ə|dʒi"],
  ["project", "pɹɒdʒ|ɛkt"],
  ["version", "vɝ|ʒən"],
  ["section", "sɛk|ʃən"],
  ["related", "ɹɪ|leɪt|ɪd"],
  ["county", "kaʊn|ti"],
  ["photo", "fəʊ|təʊ"],
  ["power", "paʊ|ə(ɹ)"],
  ["network", "nɛt|wɜːk"],
  ["computer", "kəm|pju|tɚ"],
  ["total", "təʊ|təl"],
  ["following", "fɒl|əʊ|ɪŋ"],
  ["without", "wɪθ|aʊt"],
  ["access", "æk|sɛs"],
  ["current", "kʌ|ɹənt"],
  ["media", "miː|dɪ|ə"],
  ["control", "kən|tɹəʊl"],
  ["history", "hɪs|t(ə)|ɹi"],
  ["personal", "pɜɹ|sən|əl"],
  ["including", "ɪn|kluːd|ɪŋ"],
  ["directory", "dɪ|ɹɛk|tə|ɹi"],
  ["location", "loʊ|keɪ|ʃən"],
  ["rating", "ɹeɪt|ɪŋ"],
  ["government", "ɡʌv|ə(n)|mənt"],
  ["children", "t͡ʃɪl|dɹən"],
  ["during", "djʊə|ɹɪŋ"],
  ["return", "ɹɪ|tɜːn"],
  ["shopping", "ʃɑ|pɪŋ"],
  ["account", "ə|kaʊnt"],
  ["level", "lɛv|əl"],
  ["digital", "dɪd͡ʒ|ɪt|l̩"],
  ["previous", "pɹi|vi|əs"],
  ["image", "ɪm|ɪd͡ʒ"],
  ["department", "də|pɑɹt|mənt"],
  ["title", "taɪ|tl̩"],
  ["description", "dɪ|skɹɪp|ʃən"],
  ["another", "ən|ʌð|ə(ɹ)"],
  //
  ["every", "ɛv(ə)|ɹi"], // eve|ry
  ["article", "ɑɹ|tɪ|kəl"], // ar|ti|cle
  ["advanced", "əd|vɑːnst"], // ad|vanced
  ["market", "mɑɹ|kɪt"], // mar|ket
  ["library", "laɪ|bɹɛɹ|i"], // li|brar|y
  ["series", "sɪə|ɹiːz"], // se|ries
  ["against", "ə|ɡɛ(ɪ)nst"], // a|gainst
  ["standard", "stænd|əd"], // stand|ard
  ["person", "pɝ|sən"], // per|son
  ["party", "pɑɹ|ti"], // par|ty
  ["experience", "ɪks|pɪ|ɹi|əns"], // ex|pe|ri|ence
  ["important", "ɪm|pɔɹ|tənt"], // im|por|tant
  ["poker", "poʊ|kɚ"], // pok|er
  ["status", "stæt|əs"], // sta|tus
  //
  ["property", "pɹɑ|pɚ|ti"], // prop|er|ty
  ["money", "mʌn|i"], // mon|ey
  ["quality", "kwɒl|ɪ|ti"], // qual|i|ty
  ["listing", "lɪst|ɪŋ"], // list|ing
  ["content", "kɔn|tɛnt"], // con|tent
  ["country", "kʌn|tɹi"], // coun|try
  ["private", "pɹaɪ|vɪt"], // pri|vate
  ["little", "lɪt|əl"], // lit|tle
  ["visit", "vɪz|ɪt"], // vis|it
  ["reply", "ɹɪ|plaɪ"], // re|ply
  ["customer", "kʌs|təm|ɚ"], // cus|tom|er
  ["compare", "kəm|pɛɚ"], // com|pare
  ["include", "ɪn|kluːd"], // in|clude
  ["college", "kɒl|ɪd͡ʒ"], // col|lege
  ["value", "væl|juː"], // val|ue
  ["provide", "pɹə|vaɪd"], // pro|vide
  ["author", "ɔ|θɚ"], // au|thor
  ["different", "dɪf|əɹ|ənt"], // dif|fer|ent
  ["around", "ə|ɹaʊnd"], // a|round
  ["process", "pɹə|sɛs"], // proc|ess
  ["training", "tɹeɪn|ɪŋ"], // train|ing
  ["credit", "kɹɛd|ɪt"], // cred|it
  ["science", "saɪ|əns"], // sci|ence
  ["english", "ɪŋ|ɡlɪʃ"], // eng|lish
  ["estate", "ɪs|teɪt"], // es|tate
  ["select", "sɪ|lɛkt"], // se|lect
  ["category", "kæt|ə|ɡɔ|ɹi"], // cat|e|go|ry
  ["gallery", "ɡæl|əɹ|i"], // gal|ler|y
  ["table", "teɪ|bəl"], // ta|ble
  ["register", "ɹɛdʒ|ɪs|tɚ"], // reg|is|ter
  ["however", "haʊ|ɛv|ɚ"], // how|ev|er
  ["really", "ɹɪ|ə|lɪ"], // re|al|ly
  ["action", "æk|ʃən"], // ac|tion
  ["model", "mɒd|l̩"], // mod|el
  ["industry", "ɪn|dəs|tɹi"], // in|dus|try
  ["human", "(h)juː|mən"], // hu|man
  ["provided", "pɹə|vaɪd|ɪd"], // pro|vid|ed
  ["required", "ɹɪ|kwaɪɹd"], // re|quired
  ["second", "sək|ɒnd"], // sec|ond
  ["movie", "muːv|i"], // mov|ie
  ["better", "bɛt|əɹ"], // bet|ter
  ["yahoo", "jə|huː"], // ya|hoo
  ["going", "ɡəʊ|ɪŋ"], // go|ing
  ["medical", "mɛd|ɪ|kl̩"], // med|i|cal
  ["server", "sɝv|ɚ"], // serv|er
  ["study", "stʌd|i"], // stud|y
  ["application", "æ|plɪ|keɪ|ʃən"], // ap|pli|ca|tion
  ["feedback", "fiːd|bæk"], // feed|back
  ["again", "ə|ɡɛn"], // a|gain
  ["never", "nɛv|ə(ɹ)"], // nev|er
  ["complete", "kəm|pliːt"], // com|plete
  ["topic", "tɒp|ɪk"], // top|ic
  ["comment", "kɒm|ɛnt"], // com|ment
  ["financial", "faɪ|næn|ʃəl"], // fi|nan|cial
  ["working", "wɜːk|ɪŋ"], // work|ing
  ["below", "bɪ|ləʊ"], // be|low
  ["mobile", "məʊ|baɪl"], // mo|bile
  ["payment", "peɪ|mənt"], // pay|ment
  ["equipment", "ɪ|kwɪp|mənt"], // e|quip|ment
  ["student", "stjuː|dənt"], // stu|dent
  ["legal", "liː|ɡəl"], // le|gal
  ["above", "ə|bʌv"], // a|bove
  ["recent", "ɹiː|sənt"], // re|cent
  ["problem", "pɹɒb|ləm"], // prob|lem
  ["memory", "mɛm|(ə)|ɹi"], // mem|o|ry
  ["performance", "pəɹ|fɔɹ|məns"], // per|for|mance
  ["social", "səʊ|ʃəl"], // so|cial
  ["august", "ɔː|ɡʌst"], // au|gust
  ["language", "læŋ|ɡwɪd͡ʒ"], // lan|guage
  ["story", "stɔ|ɹi"], // sto|ry
  ["create", "kɹiː|eɪt"], // cre|ate
  ["body", "bɒd|i"], // bod|y
  ["paper", "peɪ|pɚ"], // pa|per
  ["single", "sɪŋ|ɡəl"], // sin|gle
  ["example", "ɪɡz|ɑːm|pl̩"], // ex|am|ple
  ["additional", "ə|dɪ|ʃən|əl"], // ad|di|tion|al
  ["password", "pæs|wɜːɹd"], // pass|word
  ["latest", "leɪt|ɪst"], // lat|est
  ["something", "sʌm|θɪŋ"], // some|thing
  ["question", "kwɛs|t͡ʃən"], // ques|tion
  ["issue", "ɪs|juː"], // is|sue
  ["building", "bɪl|dɪŋ"], // build|ing
  ["seller", "sɛl|ɚ"], // sell|er
  ["always", "ɔː(l)|weɪz"], // al|ways
  ["result", "ɹɪ|zʌlt"], // re|sult
  ["audio", "ɔː|di|əʊ"], // au|di|o
  ["offer", "ɒf|ə(ɹ)"], // of|fer
  ["easy", "iːz|i"], // eas|y
  ["given", "ɡɪv|ən"], // giv|en
  ["event", "ɪ|vɛnt"], // e|vent
  ["release", "ɹiː|liːs"], // re|lease
  ["analysis", "ə|næl|ɪ|sɪs"], // a|nal|y|sis
  ["request", "ɹɪ|kwɛst"], // re|quest
  ["china", "tʃaɪ|nə"], // chi|na
  ["making", "meɪk|ɪŋ"], // mak|ing
  ["picture", "pɪk|tʃə"], // pic|ture
  ["possible", "pɒ|sɪ|bl̩"], // pos|si|ble
  ["professional", "pɹə|fɛ|ʃən|əl"], // pro|fes|sion|al
  ["major", "meɪ|dʒə(ɹ)"], // ma|jor
];

function vowelFormForLetters(letters: Array<string>): string {
  let result = [];
  let current = null;
  for (let i = 0; i < letters.length; i++) {
    if (!current) {
      current = consonantsOrExtra.has(letters[i]) ? "C" : "V";
      result.push(current);
    }
    const now = consonantsOrExtra.has(letters[i]) ? "C" : "V";
    if (current === now) {
      continue;
    } else {
      current = now;
      result.push(now);
    }
  }

  return result.join("");
}

export function evaluateSyllablization(
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
  console.log("evaluating syllablization:");
  console.log("✅".repeat(WIDTH * score) + "❌".repeat(WIDTH * (1 - score)));
  console.log(
    `Score: ${Math.floor(10 * 100 * score) / 10}%   (${right}/${right + wrong})`
  );
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

  const data: { [key: string]: Array<string> } = JSON.parse(content);

  let numUKPronunciationsAltered = 0;

  const pronunciations = new Map<string, string>();
  for (const [key, value] of Object.entries(data)) {
    let which = value[0];

    // seems like many of the first pronnciations are UK, replacing `-er` with `ə`
    // we prefer US because I'm biased, so just use a different pronunciation in those cases.
    // note: we don't just take the last in the list because they tend to get more obscure IMO
    for (const [inWord, inIPA] of UKPatterns) {
      if (inWord.exec(key)) {
        if (inIPA.test(which)) {
          const better = value.find((v) => !inIPA.test(v));
          if (better) {
            /*
            console.log(
              "Replacing UK pronunciation %s  %s  %s.  (Rule: %s -> %s)",
              pad(key, 15),
              pad(which, 15),
              pad(better, 15),
              inWord,
              inIPA
            );
            */
            numUKPronunciationsAltered++;
            which = better;
            break;
          }
        }
      }
    }
    const filtered = (which as string) // take first given pronunciation....hopefully its the one we want
      .replace(/['ˈˌˈ]/g, ""); // remove stress from IPA
    pronunciations.set(key, filtered);
  }

  console.log("%d UK pronunciation replaced", numUKPronunciationsAltered);

  return pronunciations;
}

// If we see [0] in the word, and [1] in the IPA, it likely means it's an UK pronunciation
// take any other pronunciation if there are multiple.
// generally this is for 'r' sounds
const UKPatterns: Array<[RegExp, RegExp]> = [
  [/.*are$/, /.*ə$/],
  [/.*er$/, /.*ə$/],
  [/.*ar.*/, /.*ɑː[^r\(].*/],
  [/.*ar.*/, /.*ə[^r\(].*/],
  [/.*er.*/, /.*ɜː.*/],
  [/.*or.*/, /.*ɔː.*/],
];

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

/**
 * Construct ordered list of syllablized pronunciations
 * map of word -> IPA split into syllables by |
 * ordered by usage of the word (common words first)
 */
export async function loadSyllabalizedPronuncations(): Promise<
  Array<[string, string]>
> {
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
  const t1 = new Date().valueOf();
  const syllablizedPronuncations = constuctSyllablizedPronunciations(
    orderedWordsWithPronunciations
    // orderedWordsWithPronunciations.slice(0, 500)
  );
  console.log("completed in %dms", new Date().valueOf() - t1);

  await fs.writeFile(
    "syllablizedIPA.json",
    JSON.stringify(Object.fromEntries(syllablizedPronuncations), undefined, 2)
  );
  console.log("wrote syllablization file");
  evaluateSyllablization(syllablizedPronuncations, syllables);

  return syllablizedPronuncations;
}

// Tests / standalone
if (require.main === module) {
  const test = (word, expect) => {
    const found = vowelFormForLetters(word.split(""));
    console.log(found === expect ? "✅" : "❌", word, found, expect);
  };
  test("aba", "VCV");
  test("aaabbbaaa", "VCV");
  test("abz", "VC");
  test("boz", "CVC");
  test("ʊfaɪl", "VCVC");

  loadSyllabalizedPronuncations();
}
