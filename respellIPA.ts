export function respellIPA(ipa: string): string {
  let accum = "";
  let remain = ipa;
  while (remain.length > 0) {
    let foundAny = false;
    for (const [replace, check] of respellKey) {
      if (remain.startsWith(check)) {
        accum += replace;
        remain = remain.slice(check.length);
        foundAny = true;
        break;
      }
    }
    if (!foundAny) {
      console.log('could not replace "%s"', remain[0]);
      accum += remain[0];
      remain = remain.slice(1);
    }
  }
  return accum;
}

// If these IPA symbols are the end of a syllable, they add 'h'
const specialEnders = [
  ["ih", "ɪ"], // ɪ at the end of a syllable is 'ih' not 'i'
  ["uh", "ʌ"], // ʌ at the end of a syllable is 'uh' not 'u'
  ["eh", "ɛ"], // ɛ at the end of a syllable is 'eh' not 'e'
];

// based on wikipedia's pronunciation respelling key
// with adjustments
// https://en.wikipedia.org/wiki/Help:Pronunciation_respelling_key
// Not all rules are followed since this focuses on monosyllabic words,
// for example checked vowels.
const respellKey = [
  ["ire", "aɪər"],
  ["oir", "ɔɪər"],
  ["our", "aʊər"],
  ["eer", "ɪər"],
  ["air", "ɛər"],
  ["ure", "jʊər"],
  ["ur", "ɜːr"],
  ["ew", "juː"],
  ["eye", "aɪ"],
  ["err", "ɛr"],
  ["irr", "ɪr"],
  ["urr", "ʌr"],
  ["uurr", "ʊr"],
  ["uhr", "ər"],
  ["oor", "ʊər"],
  ["or", "ɔːr"],
  ["orr", "ɒr"],
  ["oh", "oʊ"],
  ["oo", "uː"],
  ["ar", "ɑːr"],
  ["arr", "ær"],
  ["y", "aɪ"],
  ["ay", "eɪ"],
  ["ee", "iː"],
  ["aw", "ɔː"],
  ["ow", "aʊ"],
  ["oy", "ɔɪ"],
  ["ah", "ɑː"],
  ["ah", "ɑ"],
  ["ee", "i"],
  ["oo", "u"],
  ["aw", "ɔ"],
  //   ["ə", "ə"],
  //   ["ər", "ər"],
  ["uh", "ə"], // use `uh` instead of ə
  //
  ["a", "æ"],
  ["o", "ɒ"],
  ["uu", "ʊ"],
  //
  ["i", "ɪ"],
  ["u", "ʌ"],
  ["e", "ɛ"],
  //   ["ih", "ɪ$"], // ɪ at the end of a syllable is 'ih' not 'i'
  //   ["uh", "ʌ$"], // ʌ at the end of a syllable is 'uh' not 'u'
  //   ["eh", "ɛ$"], // ɛ at the end of a syllable is 'eh' not 'e'
  //
  ["j", "dʒ"],
  ["nk", "ŋk"],
  ["wh", "hw"],
  ["b", "b"],
  ["ch", "tʃ"],
  ["d", "d"],
  ["dh", "ð"],
  ["f", "f"],
  ["g", "ɡ"],
  //   ["gh", "ɡ"], //  IGNORED: /ɡ/ may be respelled gh instead of g when otherwise it may be misinterpreted as /dʒ/.
  //   ["tch", "tʃ"], // IGNORED: /tʃ/ after a vowel in the same syllable is respelled tch instead of ch to better distinguish it from /k, x/.
  ["h", "h"],
  ["k", "k"],
  ["kh", "x"],
  ["l", "l"],
  ["l", "ɫ"],
  ["m", "m"],
  ["n", "n"],
  ["ng", "ŋ"],
  ["p", "p"],
  ["r", "r"],
  ["s", "s"],
  //   ["ss", "s"], // /s/ may be respelled ss instead of s when otherwise it may be misinterpreted as /z/: "ice" EYESS, "tense" TENSS (compare eyes, tens).
  ["sh", "ʃ"],
  ["t", "t"],
  ["th", "θ"],
  ["v", "v"],
  ["w", "w"],
  ["y", "j"],
  ["z", "z"],
  ["zh", "ʒ"],
];

// Tests / standalone
if (require.main === module) {
  const test = (word: string, expect: string) => {
    const found = respellIPA(word);
    console.log(found === expect ? "✅" : "❌", word, found, expect);
  };

  test("ɑːrkənsɔː", "arkuhnsaw");
  test("tʃip", "cheep");
  test("nud", "nood");
  test("kɪdz", "kidz");
  test("faɪnæns", "feyenans");
  test("tru", "troo");
  test("əts", "uhts");
  test("ɛɫs", "els");
  test("mɑrk", "mahrk");
  test("θərd", "thuhrd");
  test("rɑk", "rahk");
  test("ɡɪfs", "gifs");
  test("jʊrəp", "yuurruhp");
  test("tɑpɪks", "tahpiks");
  test("bæd", "bad");
  test("vɪ", "vi");
  test("tɪps", "tips");
  test("pɫəs", "pluhs");
  test("ɔtoʊ", "awtoh");
  test("kəv", "kuhv");
  test("ɛdət", "eduht");
  test("ɡɛð", "gedh");
  test("vɪdioʊz", "videeohz");
  test("fæst", "fast");
  test("fækt", "fakt");
  test("junət", "yoonuht");
  test("ɡɛ", "ge");
  test("tɛk", "tek");
  test("mit", "meet");
  test("fɑr", "fahr");
  test("ɛn", "en");
  test("prɑdʒɛks", "prahjeks");
}
