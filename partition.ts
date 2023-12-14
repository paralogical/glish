export function* iteratePartitions(
  word: Array<string>,
  num: number
): Generator<Array<Array<string>>> {
  if (num === 1) {
    yield [word];
    return;
  }
  for (let i = 1; i < word.length - num + 2; i++) {
    const prefix = word.slice(0, i);
    const suffix = word.slice(i);
    const rest = iteratePartitions(suffix, num - 1);
    for (const partition of rest) {
      yield [prefix, ...partition];
    }
  }

  //  policy
  //  ^^^^^ (1 fewer positions for partitions than letters)
  //  p|o|licy
  //  p|ol|icy
}

const IPASymbolGroups = [
  "dʒ",
  "eɪ",
  "t͡s",
  "l̥",
  "ɑː",
  "kʰ",
  "ʌ̃",
  "ɔː",
  "d͡ʒ",
  "ɜː",
  "uː",
  "aɪ",
  "tʰ",
  "iː",
  "əʊ",
  "(ɹ)",
  "(ː)",
  "(n)",
  "(j)",
  "(ʊ)",
  "(ə)",
  "(t)",
  "(s)",
  // "",
  // "",
  /////

  "ɪ",
  "ə",
  "æd",
  "ʊ",
  "ð",
  "z",
  "ˈ",
  "ˌ",
  ".",
  "ʃ",
  "ɹ",
  "θ",
  "ɔ",
  "æ",
  "ɡ",
  "ɑ",
  "ɜ",
  "ʊ",
  "ɒ",
  "ɛ",
  "ʌ",
  "ʒ",
  "ɝ",
  "ŋ",
  "ɚ",
  "ʍ",
  "ɨ",
  "ʉ",
  "ɫ",
  "˨",
  "ɐ",
  "x",
  "ʔ",
  "ɘ",
  "ɾ",
  "ɵ",
  "˥",
  "ɯ",
  "ä",
  "q",
  "w",
  "e",
  "r",
  "t",
  "y",
  "u",
  "i",
  "o",
  "p",
  "a",
  "s",
  "d",
  "f",
  "g",
  "h",
  "j",
  "k",
  "l",
  "z",
  "x",
  "c",
  "v",
  "b",
  "n",
  "m",
];

console.log(groupIPASymbols("sɒsɪd͡ʒ").join("  "));

/** split this string into letters, except keep IPA symbols together
 * when they form multi-letter sequences or dipthongs, like [dʒ] or [eɪ]
 */
export function groupIPASymbols(s: string): Array<string> {
  const parts = [];
  let i = 0;
  try {
    while (i < s.length) {
      let found = false;
      for (const check of IPASymbolGroups) {
        if (s.slice(i).startsWith(check)) {
          parts.push(check);
          i += check.length;
          found = true;
          break;
        }
      }
      if (found) {
        continue;
      }
      // we didn't find any matches, just take one char
      // console.log(`Unknown IPA symbol:   ${s[i]}   (context:  ${s} )`);
      parts.push(s[i]);
      i++;
    }
  } catch (err) {
    console.error("error!!!", err);
  }
  return parts;
}

function test(expect: Array<string>, str: string, num: number) {
  console.log(`----- ${str}, ${num} -----`);
  const result = [...iteratePartitions(groupIPASymbols(str), num)];
  console.log("1", result);
  //   const found = [...result].map((part) => part.map((p) => p.join("")));
  const found = result;
  console.log("2", found);

  if (found.length < expect.length) {
    console.log(
      "Expected more results! Got %d instead of %d",
      found.length,
      expect.length
    );
  } else if (found.length > expect.length) {
    console.log(
      "Expected less results! Got %d instead of %d",
      found.length,
      expect.length
    );
  }
  let anyFailed = false;
  let i = 0;
  for (const exp of expect) {
    const value = found[i];
    i += 1;
    if (!value) {
      anyFailed = true;
      break;
    }
    const s2 = value.map((p) => p.join("")).join("|");
    let ok = exp === s2;
    if (!ok) {
      anyFailed = true;
    }
    console.log(`${exp} =?= ${s2}   (${ok ? "OK" : "FAIL"})`);
  }
  if (anyFailed) {
    console.log("FAILED!!!!!");
  }
}

test(["abcd"], "abcd", 1);
test(["a|bcd", "ab|cd", "abc|d"], "abcd", 2);
test(["a|b|cd", "a|bc|d", "ab|c|d"], "abcd", 3);
test(
  ["a|b|cde", "a|bc|de", "a|bcd|e", "ab|c|de", "ab|cd|e", "abc|d|e"],
  "abcde",
  3
);

// dipthongs are interpreted as single units
test(["a|bɑːd", "ab|ɑːd", "abɑː|d"], "abɑːd", 2);
