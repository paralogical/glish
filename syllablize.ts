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
  let log = shouldLog ? console.log : () => {};
  log("Evaluating ", value);
  const pronunciationParts = groupIPASymbols(pronunciation);
  for (const partition of iteratePartitions(
    pronunciationParts,
    syllables.length
  )) {
    // To debug a certain word syllabification:
    // if (
    //   word === "unscathed" &&
    //   ["ən|skeɪðd", "ə|nskeɪðd"].includes(
    //     partition.map((p) => p.join("")).join("|")
    //   )
    // ) {
    //   log = console.log;
    // } else {
    //   log = () => {};
    // }
    log(
      "\n%s: evaluating %s against %s",
      word,
      partition.map((p) => p.join("")),
      syllables
    );
    let score = 0;
    // compare each potential syllable against the real syllable
    for (let i = 0; i < partition.length; i++) {
      const letters = partition[i];
      const goal = syllables[i];
      log(`> ${letters.join("")} to ${goal}`);
      if (letters[0] === ".") {
        score += 15; // if there is a `'`, it should be at the start
        // except sometimes the pronunciation or syllables are weird, so it's not that important
        log("\t+15 . at start");
      }
      if (letters.every((l) => consonantsOrExtra.has(l))) {
        score -= 5; // consonants shouldn't be by themselves as a syllable
        log("\t-5 all consonants");
      }

      // length heuristic, ignoring some characters like .
      const filteredLetters = letters.filter((l) => l !== ".");
      const lengthDiff = Math.abs(filteredLetters.length - goal.length);
      log(`\t-${lengthDiff * lengthDiff} length heuristic`);
      score -= lengthDiff * lengthDiff; // square to punish very big differences

      // vowel forms, discourage e.g. vowel-consonant-vowel
      const form = vowelFormForLetters(letters);
      if (["CVC", "CV", "VC", "V", "C"].includes(form)) {
        log(`\t+15 ${form} form`);
        score += 15;
      }

      // letters like 'r' by itself is not usually a correct syllable
      if (
        letters.length === 1 &&
        disourcedByItself.has(letters[0]) &&
        // unless one of the recommended syllables is just an r...
        !syllables.find((s) => disourcedByItself.has(s))
      ) {
        log(`\t-40 ${letters[0]} by itself`);
        score -= 40;
      }

      // exact correlation: if every letter correlates 1:1 with other letters exactly matching the length,
      // that's a really strong signal
      let remaining = goal;
      let allMatch = true;
      log("   -> correlation check", filteredLetters.join(""), "to", goal);
      //  pɹɪv  pri
      for (const letter of filteredLetters) {
        const correlate = correlates.get(letter);
        if (correlate == null) {
          log("   -> no correlate for ", letter);
          allMatch = false;
          break;
        }
        let found = false;
        for (const corr of correlate) {
          if (remaining.startsWith(corr)) {
            log(`   -> ${remaining} starts with ${corr}`);
            found = true;
            remaining = remaining.slice(corr.length);
            break;
          }
        }
        if (found) {
          continue;
        } else {
          log(
            `   -> None match for ${correlate} within ${remaining} of ${goal}`
          );
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        if (lengthDiff === 0) {
          log(`\t+10 length match AND all match ${filteredLetters} to ${goal}`);
          score += 10;
        } else {
          log(`\t+5 all match ${filteredLetters} to ${goal}`);
          score += 5;
        }
      }

      // consonant matching
      // if there's only one 'k', and the pronunciation has only one correlate of k,
      // then it should appear in the same syllable

      log("    > consonant matching");
      for (const consonant of letters.filter((l) => consonantsOrExtra.has(l))) {
        if (word.indexOf(consonant) != word.lastIndexOf(consonant)) {
          // there's more than one of this consonant, can't use for this
          log(`    > more thant one ${consonant}, skipping`);
          continue;
        }
        const potentials = correlates.get(consonant);
        if (!potentials) {
          continue;
        }
        let foundAny = false;
        for (const potential of potentials) {
          if (goal.includes(potential)) {
            log(`    > found ${potential} matching ${consonant}`);
            foundAny = true;
            break;
          }
        }
        if (foundAny) {
          log(`\t+5 consonant correlation ${consonant}`);
          score += 1;
        }
      }

      // correlation of all letters in syllable
      for (const letter of letters) {
        const potentials = correlates.get(letter);
        log("\tpotentials for %s: %s", letter, potentials);
        if (potentials && potentials.length > 0) {
          for (const potential of potentials) {
            // log("    looking for %s in %s", potential, goal);
            if (goal.includes(potential)) {
              log(`\t+1 correlation ${letter} as ${potential} in ${goal}`);
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
  let best: typeof scores[0] = { score: -100000, partition: [] };
  for (const result of scores) {
    if (result.score > best.score) {
      best = result;
    }
  }
  return [word, best.partition.join("|")];
}

const disourcedByItself = new Set(["r", "ɹ", "g", "w", "ɡ", "t"]);

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
  ["dʒɛ", ["je", "ge", "dre"]],
  ["dʒ", ["j", "g", "dr"]],
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
  ["ɪ", ["i", "y", "e", "o"]],
  ["ə", ["er", "e", "i", "a", "u"]],
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
  ["post", "poʊst"], // post
  // ["message", "mɛs|ədʒ"], // mes|sage
  ["available", "ə|veɪɫ|ə|bəɫ"], // a|vail|a|ble
  ["software", "sɔf|wɛr"], // soft|ware
  ["information", "ɪn|fər|meɪ|ʃən"], // in|for|ma|tion
  ["service", "sərv|əs"], // serv|ice
  ["data", "dæ|tə"], // da|ta
  ["order", "ɔr|dər"], // or|der
  ["privacy", "praɪ|və|si"], // pri|va|cy
  ["music", "mju|zɪk"], // mu|sic
  ["policy", "pɑɫ|ə|si"], // pol|i|cy
  ["number", "nəm|bər"], // num|ber
  ["after", "æf|tər"], // af|ter
  ["video", "vɪd|i|oʊ"], // vid|e|o
  ["other", "əð|ər"], // oth|er
  ["any", "ɛn|i"], // an|y
  ["only", "oʊn|ɫi"], // on|ly
  ["business", "bɪz|nəs"], // busi|ness
  ["also", "ɔɫ|soʊ"], // al|so
  ["services", "sər|vəs|əz"], // ser|vic|es
  ["people", "pi|pəɫ"], // peo|ple
  ["into", "ɪn|tu"], // in|to
  ["product", "prɑd|əkt"], // prod|uct
  ["policy", "pɑɫ|ə|si"], // pol|i|cy
  ["number", "nəm|bər"], // num|ber
  ["info", "ɪn|foʊ"], // in|fo
  ["public", "pəb|ɫɪk"], // pub|lic
  ["review", "ri|vju"], // re|view
  ["company", "kəm|pə|ni"], // com|pa|ny
  // ["user", "ju|zər"], // us|er
  ["under", "ən|dər"], // un|der
  ["university", "ju|nə|vər|sə|ti"], // u|ni|ver|si|ty
  ["program", "proʊ|ɡræm"], // pro|gram
  ["management", "mæn|ədʒ|mənt"], // man|age|ment
  ["hotel", "hoʊ|tɛɫ"], // ho|tel
  ["center", "sɛn|ər"], // cen|ter
  ["travel", "træv|əɫ"], // trav|el
  ["report", "ri|pɔrt"], // re|port
  ["member", "mɛm|bər"], // mem|ber
  ["before", "bi|fɔr"], // be|fore
  ["because", "bɪ|kɑz"], // be|cause
  // ["education", "ɛdʒ|ə|keɪ|ʃən"], // ed|u|ca|tion
  ["area", "ɛ|ri|ə"], // a|re|a
  ["security", "sɪ|kjʊ|rə|ti"], // se|cu|ri|ty
  ["profile", "proʊ|faɪɫ"], // pro|file
  ["local", "ɫoʊ|kəɫ"], // lo|cal
  // ["using", "ju|zɪŋ"], // us|ing
  // ["office", "ɔf|ɪs"], // of|fice
  ["national", "næ|ʃən|əɫ"], // na|tion|al
  ["address", "æd|rɛs"], // ad|dress
  ["community", "kəm|ju|nə|ti"], // com|mu|ni|ty
  ["subject", "səb|dʒɪkt"], // sub|ject
  ["between", "bi|twin"], // be|tween
  ["forum", "fɔ|rəm"], // fo|rum
  ["family", "fæm|ə|ɫi"], // fam|i|ly
  ["even", "i|vɪn"], // e|ven
  ["special", "spɛ|ʃəɫ"], // spe|cial
  ["being", "bi|ɪŋ"], // be|ing
  ["women", "wɪm|ən"], // wom|en
  ["open", "oʊ|pən"], // o|pen
  ["technology", "tɛk|nɑɫ|ə|dʒi"], // tech|nol|o|gy
  ["project", "prɑdʒ|ɛkt"], // proj|ect
  ["related", "ri|ɫeɪt|ɪd"], // re|lat|ed
  ["county", "kaʊn|i"], // coun|ty
  ["photo", "foʊ|toʊ"], // pho|to
  ["network", "nɛt|wərk"], // net|work
  // ["computer", "kəm|pju|tər"], // com|put|er
  ["total", "toʊ|təɫ"], // to|tal
  ["following", "fɑ|ɫo|ʊɪŋ"], // fol|low|ing
  ["without", "wɪð|aʊt"], // with|out
  ["current", "kɑ|rənt"], // cur|rent
  ["media", "mi|di|ə"], // me|di|a
  ["control", "kən|troʊɫ"], // con|trol
  // ["history", "hɪs|t|əri"], // his|to|ry
  ["including", "ɪn|kɫud|ɪŋ"], // in|clud|ing
  ["location", "ɫoʊ|keɪ|ʃən"], // lo|ca|tion
  ["children", "tʃɪɫ|drən"], // chil|dren
  ["during", "dər|ɪŋ"], // dur|ing
  ["account", "ək|aʊnt"], // ac|count
  ["level", "ɫɛv|əɫ"], // lev|el
  ["digital", "dɪdʒ|ət|əɫ"], // dig|it|al
  ["image", "ɪm|ədʒ"], // im|age
  ["department", "dɪ|pɑrt|mənt"], // de|part|ment
  ["title", "taɪ|təɫ"], // ti|tle
  ["another", "ən|əð|ər"], // an|oth|er
  ["article", "ɑr|tə|kəɫ"], // ar|ti|cle
  ["advanced", "əd|vænst"], // ad|vanced
  ["market", "mɑr|kət"], // mar|ket
  ["library", "ɫaɪ|brɛr|i"], // li|brar|y
  ["series", "sɪ|riz"], // se|ries
  ["against", "ə|ɡeɪnst"], // a|gainst
  ["standard", "stænd|ərd"], // stand|ard
  ["status", "stæ|təs"], // sta|tus
  ["property", "prɑp|ər|ti"], // prop|er|ty
  ["money", "mən|i"], // mon|ey
  ["quality", "kwɑɫ|ə|ti"], // qual|i|ty
  ["listing", "ɫɪst|ɪŋ"], // list|ing
  ["content", "kɑn|tɛnt"], // con|tent
  ["country", "kən|tri"], // coun|try
  ["private", "praɪ|vət"], // pri|vate
  ["little", "ɫɪt|əɫ"], // lit|tle
  ["reply", "ri|pɫaɪ"], // re|ply
  ["customer", "kəs|təm|ər"], // cus|tom|er
  ["compare", "kəm|pɛr"], // com|pare
  ["include", "ɪn|kɫud"], // in|clude
  ["college", "kɑ|ɫɪdʒ"], // col|lege
  ["value", "væɫ|ju"], // val|ue
  ["author", "ɔ|θər"], // au|thor
  // ["process", "prɑ|sɛs"], // proc|ess
  ["credit", "krɛd|ət"], // cred|it
  ["english", "ɪŋɡ|ɫɪʃ"], // eng|lish
  ["select", "sə|ɫɛkt"], // se|lect
  ["table", "teɪ|bəɫ"], // ta|ble
  ["register", "rɛdʒ|ɪs|tər"], // reg|is|ter
  ["however", "haʊ|ɛv|ər"], // how|ev|er
  ["model", "mɑd|əɫ"], // mod|el
  ["human", "hju|mən"], // hu|man
  ["required", "ri|kwaɪərd"], // re|quired
  ["second", "sɛk|ənd"], // sec|ond
  ["movie", "muv|i"], // mov|ie
  // ["better", "bɛt|ər"], // bet|ter
  ["yahoo", "jɑ|hu"], // ya|hoo
  ["going", "ɡo|ʊɪn"], // go|ing
  ["medical", "mɛd|ə|kəɫ"], // med|i|cal
  ["server", "sərv|ər"], // serv|er
  ["study", "stəd|i"], // stud|y
  ["application", "æ|pɫə|keɪ|ʃən"], // ap|pli|ca|tion
  ["feedback", "fid|bæk"], // feed|back
  ["again", "ə|ɡeɪn"], // a|gain
  ["never", "nɛv|ər"], // nev|er
  ["complete", "kəm|pɫit"], // com|plete
  ["topic", "tɑp|ɪk"], // top|ic
  ["comment", "kɑ|mɛnt"], // com|ment
  ["financial", "faɪ|næn|ʃəɫ"], // fi|nan|cial
  ["working", "wərk|ɪŋ"], // work|ing
  ["below", "bi|ɫoʊ"], // be|low
  ["mobile", "moʊ|bəɫ"], // mo|bile
  ["student", "stu|dənt"], // stu|dent
  ["legal", "ɫi|ɡəɫ"], // le|gal
  ["above", "ə|bəv"], // a|bove
  ["recent", "ri|sənt"], // re|cent
  ["problem", "prɑb|ɫəm"], // prob|lem
  ["performance", "pər|fɔr|məns"], // per|for|mance
  ["social", "soʊ|ʃəɫ"], // so|cial
  ["august", "ɑ|ɡəst"], // au|gust
  ["language", "ɫæŋ|ɡwədʒ"], // lan|guage
  ["create", "kri|eɪt"], // cre|ate
  ["body", "bɑd|i"], // bod|y
  ["paper", "peɪ|pər"], // pa|per
  ["single", "sɪŋ|ɡəɫ"], // sin|gle
  ["example", "ɪɡz|æm|pəɫ"], // ex|am|ple
  ["additional", "ə|dɪ|ʃən|əɫ"], // ad|di|tion|al
  ["password", "pæs|wərd"], // pass|word
  ["latest", "ɫeɪt|əst"], // lat|est
  ["something", "səm|θɪŋ"], // some|thing
  ["question", "kwɛs|tʃən"], // ques|tion
  ["issue", "ɪ|ʃu"], // is|sue
  ["building", "bɪɫd|ɪŋ"], // build|ing
  ["seller", "sɛɫ|ər"], // sell|er
  ["always", "ɔɫ|weɪz"], // al|ways
  ["result", "ri|zəɫt"], // re|sult
  ["audio", "ɑ|di|oʊ"], // au|di|o
  ["easy", "iz|i"], // eas|y
  ["event", "i|vɛnt"], // e|vent
  ["release", "ri|ɫis"], // re|lease
  ["analysis", "ə|næɫ|ə|səs"], // a|nal|y|sis
  ["request", "ri|kwɛst"], // re|quest
  ["picture", "pɪk|tʃər"], // pic|ture
  ["possible", "pɑ|sə|bəɫ"], // pos|si|ble
  ["professional", "prə|fɛ|ʃən|əɫ"], // pro|fes|sion|al
  ["major", "meɪ|dʒər"], // ma|jor
  /////

  ["really", "ri|ɫ|i"], // re|al|ly
  ["return", "ri|tərn"], // re|turn
  ["government", "ɡəv|ər|mənt"], // gov|ern|ment
  // ["directory", "daɪ|rɛk|tɛ|ri"], // di|rec|to|ry
  ["general", "dʒɛn|ər|əɫ"], // gen|er|al
  ["research", "ri|sərtʃ"], // re|search
  ["united", "ju|naɪt|ɪd"], // u|nit|ed
  ["real", "ri|ɫ"], // re|al
  ["reserved", "ri|zərvd"], // re|served
  ["water", "wɔ|tər"], // wa|ter
  ["message", "mɛ|sədʒ"], // mes|sage
  ["using", "juz|ɪŋ"], // us|ing
  ["office", "ɔ|fɪs"], // of|fice
  ["computer", "kəm|pjut|ər"], // com|put|er
  ["process", "prɑs|ɛs"], // proc|ess
  //////////////
  ["about", "ə|baʊt"],
  ["over", "oʊ|vər"], // o|ver
  ["power", "paʊ|ər"], // pow|er
  ["every", "ɛvə|ri"], // eve|ry
  ["history", "hɪs|tə|ri"], // his|to|ry
  ["better", "bɛt|ər"], // bet|ter
  ["offer", "ɔf|ər"], // of|fer
  ["directory", "daɪ|rɛk|tə|ri"], // di|rec|to|ry
  ["around", "ə|raʊn"], // a|round
  ["memory", "mɛm|ə|ri"], // mem|o|ry
  ["user", "ju|zər"], // us|er
  ["different", "dɪf|ər|ənt"], // dif|fer|ent
  //////////////
  ["unscathed", "ən|skeɪðd"],
  ["personal", "pər|sɪn|əɫ"], // per|son|al
  ["poker", "poʊ|kər"], // pok|er
  ["gallery", "ɡæɫ|ər|i"], // gal|ler|y
  ["education", "ɛdʒ|ə|keɪ|ʃən"], // ed|u|ca|tion
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
      const JSON_OUTPUT = false; // useful to fill in test cases
      if (!JSON_OUTPUT) {
        console.log(
          `❌ ${pad(test, 15)}  Expect ${pad(answer, 20)}  got ${pad(
            found ?? "",
            20
          )}   Reference: ${syllablizized.get(test)?.join("|")}`
        );
      } else {
        console.log(
          `["${test}", "${found ?? ""}"], // ${syllablizized
            .get(test)
            ?.join("|")}`
        );
      }
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
  const content = await fs.readFile("./inputs/Syllables.txt", {
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
  // const content = await fs.readFile("./inputs/pronunciations.json", {
  //   encoding: "utf-8",
  // });
  // const data: { [key: string]: Array<string> } = JSON.parse(content);
  const content = await fs.readFile("./inputs/en_US_IPA.txt", {
    encoding: "utf-8",
  });
  let data: { [key: string]: Array<string> } = {};
  for (const line of content.split("\n")) {
    if (line) {
      const [word, ipas] = line.split("\t");
      const [firstIpa] = ipas.split(",");
      if (firstIpa) {
        data[word] = [firstIpa.replace(/\//g, "")];
      }
    }
  }

  let numUKPronunciationsAltered = 0;

  const pronunciations = new Map<string, string>();
  for (const [key, value] of Object.entries(data)) {
    let which = value[0];

    /*
    We no longer use potentially UK IPA, no need to remove UK patterns

    // seems like many of the first pronnciations are UK, replacing `-er` with `ə`
    // we prefer US because I'm biased, so just use a different pronunciation in those cases.
    // note: we don't just take the last in the list because they tend to get more obscure IMO
    for (const [inWord, inIPA] of UKPatterns) {
      if (inWord.exec(key)) {
        if (inIPA.test(which)) {
          const better = value.find((v) => !inIPA.test(v));
          if (better) {
            // console.log(
            //   "Replacing UK pronunciation %s  %s  %s.  (Rule: %s -> %s)",
            //   pad(key, 15),
            //   pad(which, 15),
            //   pad(better, 15),
            //   inWord,
            //   inIPA
            // );
            numUKPronunciationsAltered++;
            which = better;
            break;
          }
        }
      }
    }
    */
    // take first given pronunciation....hopefully its the one we want
    const filtered = (which as string)
      .replace(/['ˈˌˈ]/g, "") // remove stress from IPA
      // replace r-colored vowels with digraph forms
      .replace(/ɝ/g, "ər") // TODO should this be ɛr? no I don't think so
      // normalize 'r's because they're hard to distinguish
      .replace(/ɹ/g, "r");
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
    .map((word): [string, Array<string>, string] | null => {
      const syllable = syllables.get(word) ?? [word];

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
    "outputs/syllablizedIPA.json",
    JSON.stringify(Object.fromEntries(syllablizedPronuncations), undefined, 2)
  );
  console.log(
    "wrote syllablization file with %d syllablized pronunciations",
    syllablizedPronuncations.length
  );
  evaluateSyllablization(syllablizedPronuncations, syllables);

  createLetterOrderedGraph(syllablizedPronuncations);

  return syllablizedPronuncations;
}

let nextNum = 1;
function createLetterOrderedGraph(
  syllablizedPronuncations: Array<[string, string]>
) {
  const graph: SonorityGraph = {
    letter: undefined,
    next: [],
    count: 0,
    id: nextNum++,
  };
  for (const [word, syllabification] of syllablizedPronuncations.slice(
    0
    // 100
  )) {
    for (const syllable of syllabification.split("|")) {
      console.log(syllable);
      let last = graph;
      for (const letter of syllable) {
        const existing = last.next.find((g) => g?.letter === letter);
        if (existing) {
          existing.count += 1;
          last = existing;
        } else {
          const next = { letter, next: [], count: 1, id: nextNum++ };
          last.next.push(next);
          last = next;
        }
      }

      // handle end of syllable
      const existing = last.next.find((g) => g?.letter === undefined);
      if (existing) {
        existing.count += 1;
      } else {
        const next = { letter: undefined, next: [], count: 1, id: nextNum++ };
        last.next.push(next);
      }
    }
  }

  for (var i = 0; i < 10; i++) {
    console.log("random syllable: ", getRandomSyllable(graph));
  }

  console.log("-----------");

  printGraph(graph);
}

function randomChoice<T>(a: Array<T>): T {
  return a[Math.floor(Math.random() * a.length)];
}

function getRandomSyllable(graph: SonorityGraph) {
  let word = "";
  let next = graph.next;
  while (true) {
    // TODO: weight by count sum
    const choice = randomChoice(next);
    if (choice?.letter) {
      word += choice.letter;
    } else {
      break;
    }
    next = choice.next;
  }
  return word;
}

// b -> r -> o -> n
//   -> l -> o
//   -> o ----->

// (pre-consonants)

type SonorityGraph = {
  id: number;
  letter?: string;
  next: Array<SonorityGraph | undefined>;
  count: number;
};

async function printGraph(graph: SonorityGraph) {
  const toPrint = [...graph.next];
  let output = 'graph "" {';
  const printed = new Set<SonorityGraph>();
  while (toPrint.length) {
    const g = toPrint.pop();
    if (!g) continue;
    if (printed.has(g)) continue;
    printed.add(g);

    output += `n${g.id};\n`;
    output += `n${g.id} [label="${g?.letter ?? "END"}"];\n`;
    for (const child of g.next) {
      if (child) {
        output += `n${g.id} -> n${child.id}\n`;
        toPrint.push(child);
      } else {
        // end, TODO
      }
    }
  }
  output += "}";
  await fs.writeFile("outputs/syllableGraph.graphviz", output);
  console.log("wrote syllable graph");
}

// Tests / standalone
if (require.main === module) {
  const test = (word: string, expect: string) => {
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
