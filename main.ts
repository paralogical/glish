import { promises as fs } from "fs";
import { respellIPA } from "./respellIPA";
import {
  createSonorityGraph,
  getRandomSyllableFromPallete,
} from "./sonorityGraph";
import { oneSigFig, progress } from "./util";

async function main() {
  // const syllablizedPronuncations = await loadSyllabalizedPronuncations();
  // just use cached version
  const syllablizedPronuncations = JSON.parse(
    await fs.readFile("./outputs/syllablizedIPA.json", {
      encoding: "utf-8",
    })
  ) as Array<[string, Array<Array<string>>]>;

  const oneSyllable = syllablizedPronuncations.filter(
    ([word, syllalbles]) => syllalbles.length === 1
  );
  const multiSyllable = syllablizedPronuncations.filter(
    ([word, syllalbles]) => syllalbles.length > 1
  );

  const seen = new Set<string>();
  const assignments = new Map<string, Array<string>>();

  for (const [word, syll] of oneSyllable) {
    seen.add(syll.join(""));
    // assignments.set(word, syll);
  }

  // TODO; we could cache this graph instead of remaking it here
  console.log("generating sonority graph...");
  const graph = createSonorityGraph(syllablizedPronuncations);

  const randomSyllables = new Map(
    JSON.parse(
      await fs.readFile("./outputs/random_generated_syllables.json", {
        encoding: "utf-8",
      })
    ) as Array<[string, Array<string>]>
  );

  let assignResults: Array<boolean> = [];
  let assignSuccesses = 0;
  let assignFails = 0;
  let directAssigns = 0;
  let graphAssigns = 0;
  let randomFancyAssigns = 0;
  let randomDumbAssigns = 0;

  const assign = (word: string, value: Array<string>) => {
    const joined = value.join("");
    seen.add(joined);
    assignments.set(word, value);
    assignSuccesses++;
    assignResults.push(true);
    randomSyllables.delete(joined);
    // console.log("✅ assigned %s -> %s", word, generatedSyl);
  };

  console.log("assigning monosyllabic values...");
  let i = 0;
  for (const [word, sylls] of multiSyllable) {
    // print progress
    // no need to print after every word
    if (i % 100 === 0) {
      progress(
        i,
        multiSyllable.length,
        `${i}/${multiSyllable.length}.    ${directAssigns} direct, ${graphAssigns} graph, ${randomFancyAssigns} fancy, ${randomDumbAssigns} dumb, ${assignFails} fails`
      );
    }
    i += 1;

    // try to use any syllable directly
    {
      const firstunused = sylls.find((syll) => !seen.has(syll.join("")));
      if (firstunused != null) {
        directAssigns++;
        assign(word, firstunused);
        continue;
      }
    }

    // try random palette
    {
      let assiendWithRandom = false;
      for (let i = 0; i < 1000; i++) {
        const generatedSyl = getRandomSyllableFromPallete(graph, sylls.flat());
        if (generatedSyl && !seen.has(generatedSyl.join(""))) {
          graphAssigns++;
          assign(word, generatedSyl);
          assiendWithRandom = true;
          break;
        }
      }
      if (assiendWithRandom) {
        continue;
      }
    }

    // find a random syllable to use from pregenerated list
    {
      let candidates: Array<[Array<string>, number]> = [];
      const phones = new Set(sylls.flat());
      for (const [joined, randomSyll] of randomSyllables.entries()) {
        let score = 0;
        let hasAny = false;
        for (const p of randomSyll) {
          if (phones.has(p)) {
            hasAny = true;
            score += 10;
          } else {
            score -= 5;
          }
        }
        if (hasAny) {
          candidates.push([randomSyll, score]);
          if (score === 10 * randomSyll.length) {
            // early exit: we found a syllable that got the highest possible score! go for it!
            break;
          }
        }
      }
      if (candidates.length > 0) {
        let best: [Array<string> | undefined, number] = [undefined, -Infinity];
        for (const cand of candidates) {
          if (cand[1] > best[1]) {
            best = cand;
          }
        }

        randomFancyAssigns++;
        assign(word, best[0]!);
        continue;
      }

      // if we didn't find a decent match, just use the first available
      if (randomSyllables.size > 0) {
        const [rand] = randomSyllables;
        randomDumbAssigns++;
        assign(word, rand[1]);

        continue;
      }
    }

    // fallback -> we failed to assign anything
    // console.log("❌ couldnt assign %s, theyre all taken", word);
    assignments.set(word, ["#", ...word, "#"]);
    assignFails++;
    assignResults.push(false);
  }
  console.log(); // last progress bar printed `\r`, newline to leave it

  console.log(
    `Assigned ${assignResults.filter(Boolean).length} words out of ${
      multiSyllable.length
    }`
  );
  const firstNth = (n: number) =>
    (100 * assignResults.slice(0, n).filter(Boolean).length) / n;
  console.log("first 500 success rate:", oneSigFig(firstNth(500)));
  console.log("first 5000 success rate:", oneSigFig(firstNth(5000)));
  console.log("first 15000 success rate:", oneSigFig(firstNth(15000)));

  const monosyllabicResult: { [key: string]: string } = {};

  for (const [word, sylls] of syllablizedPronuncations) {
    const mono = sylls.length > 1 ? assignments.get(word) : sylls[0];
    if (mono) {
      monosyllabicResult[word] = mono.join("");
      // TODO: we should do the respell before joining
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
