import { promises as fs } from "fs";
import { respellIPA } from "./respellIPA";
import {
  createSonorityGraph,
  getRandomSyllableFromPallete,
} from "./sonorityGraph";

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

async function main() {
  // const syllablizedPronuncations = await loadSyllabalizedPronuncations();
  // just use cached version
  const syllablizedPronuncations = JSON.parse(
    await fs.readFile("./outputs/syllablizedIPA.json", {
      encoding: "utf-8",
    })
  ) as { [key: string]: string };

  const entries = Object.entries(syllablizedPronuncations);
  const oneSyllable = entries.filter(([word, value]) => !value.includes("|"));
  const multiSyllable = entries.filter(([word, value]) => value.includes("|"));

  const seen = new Set();
  const assignments = new Map<string, string>();

  for (const [word, syll] of oneSyllable) {
    seen.add(syll);
    // assignments.set(word, syll);
  }

  // TODO; we could cache this graph instead of remaking it here
  const graph = createSonorityGraph(entries);

  let assignSuccesses = [];

  for (const [word, syllsStr] of multiSyllable) {
    const sylls = syllsStr.split("|");
    const firstunused = sylls.find((syll) => !seen.has(syll));
    if (firstunused == null) {
      // try random palette
      let assiendWithRandom = false;
      for (let i = 0; i < 1000; i++) {
        const generatedSyl = getRandomSyllableFromPallete(
          graph,
          sylls.join("")
        );
        if (generatedSyl && !seen.has(generatedSyl)) {
          seen.add(generatedSyl);
          assignments.set(word, generatedSyl);
          assignSuccesses.push(true);
          console.log("✅ assigned %s -> %s", word, generatedSyl);
          assiendWithRandom = true;
        }
      }
      if (assiendWithRandom) {
        continue;
      }

      console.log("❌ couldnt assign %s, theyre all taken", word);
      assignments.set(word, `#${word}#`);
      assignSuccesses.push(false);
    } else {
      seen.add(firstunused);
      assignments.set(word, firstunused);
      console.log("✅ assigned %s -> %s", word, firstunused);
      assignSuccesses.push(true);
    }
  }

  console.log(assignments);
  const first500Success =
    (100 * assignSuccesses.slice(0, 500).filter(Boolean).length) / 500;
  const first5000Success =
    (100 * assignSuccesses.slice(0, 5000).filter(Boolean).length) / 5000;
  const first50000Success =
    (100 * assignSuccesses.slice(0, 50000).filter(Boolean).length) / 50000;
  const totalSuccess =
    (100 * assignSuccesses.filter(Boolean).length) / assignSuccesses.length;
  console.log("first 500 success rate:", first500Success);
  console.log("first 5000 success rate:", first5000Success);
  console.log("first 50000 success rate:", first50000Success);
  console.log("total success rate:", totalSuccess);

  const monosyllabicResult: { [key: string]: string } = {};

  for (const [word, syll] of entries) {
    const mono = syll.includes("|") ? assignments.get(word) : syll;
    if (mono) {
      monosyllabicResult[word] = mono;
    }
  }

  {
    const resultWithSingleSyllFilename = "outputs/monosyllabic.json";
    console.log(
      "writing monosyllabic result to ",
      resultWithSingleSyllFilename
    );
    await fs.writeFile(
      resultWithSingleSyllFilename,
      JSON.stringify(monosyllabicResult, undefined, 2)
    );
  }
  {
    const resultFilename = "outputs/monosyllabic_only_modified_words.json";
    console.log("writing monosyllabic result to ", resultFilename);
    await fs.writeFile(
      resultFilename,
      JSON.stringify(Object.fromEntries(assignments.entries()), undefined, 2)
    );
  }
  {
    const respelledResult = "outputs/respelled.json";
    console.log("writing respelled monosyllabic result to ", respelledResult);
    await fs.writeFile(
      respelledResult,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(monosyllabicResult).map(([word, mono]) => [
            word,
            respellIPA(mono),
          ])
        ),
        undefined,
        2
      )
    );
  }
  {
    const resultFilename = "monosyllable-ui/src/routes/monosyllabic.ts";
    console.log(
      "writing ui-consumable monosyllabic result to ",
      resultFilename
    );
    await fs.writeFile(
      resultFilename,
      "export const monosyllabic = new Map<string, {mono: string, respelled_mono: string, multiSyllable: boolean}>(" +
        JSON.stringify(
          Object.entries(monosyllabicResult).map(([word, mono]) => {
            return [
              word,
              {
                mono,
                multiSyllable: assignments.has(word),
                respelled_mono: respellIPA(mono),
              },
            ];
          }),
          undefined,
          2
        ) +
        ");"
    );
  }

  return;
}

main();
