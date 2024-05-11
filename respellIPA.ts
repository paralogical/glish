import { parameters } from './parameters';
import { IPA } from './types';

export function respellIPA(ipa: IPA): string {
  let accum = "";
  let remain = ipa;
  while (remain.length > 0) {
    let foundAny = false;
    for (const [replace, check] of parameters.IPA.respellKey) {
      const ender = parameters.IPA.specialEnders.find(([, end]) => end === remain);
      if (ender) {
        accum += ender[0];
        remain = "";
        foundAny = true;
        break;
      }
      if (remain.startsWith(check)) {
        accum += replace;
        remain = remain.slice(check.length);
        foundAny = true;
        break;
      }
    }
    if (!foundAny) {
      //   console.log('could not replace "%s"', remain[0]);
      accum += remain[0];
      remain = remain.slice(1);
    }
  }
  return accum;
}

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
  test("vɪ", "vih");
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
  test("ɡɛ", "geh");
  test("tɛk", "tek");
  test("mit", "meet");
  test("fɑr", "fahr");
  test("ɛn", "en");
  test("prɑdʒɛks", "prahjeks");
  // special enders
  test("ɪnɪ", "inih");
  test("ʌnʌ", "unuh");
  test("ɛnɛ", "eneh");
}
