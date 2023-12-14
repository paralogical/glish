import { promises as fs } from "fs";
import { respellIPA } from "./respellIPA";
import {
  createSonorityGraph,
  getRandomSyllableFromPallete,
} from "./sonorityGraph";
import { oneSigFig, progress } from "./util";

async function main() {
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

  // TODO; we could cache this graph instead of remaking it here
  console.log("Generating sonority graph...");
  const graph = createSonorityGraph(syllablizedPronuncations);
  console.log();

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
  type Method =
    | "direct"
    | "graph"
    | "choice"
    | "random"
    | "failed"
    | "alreadyOneSyllable";
  const assignMethod: { [key in Method]: number } = {
    direct: 0,
    graph: 0,
    choice: 0,
    random: 0,
    failed: 0,
    alreadyOneSyllable: 0,
  };

  const seen = new Set<string>();
  type Assignment = {
    mono: string;
    respelled: string;
    method: Method;
    numSyllables: number;
  };
  const assignments = new Map<string, Assignment>();

  const assign = (
    word: string,
    value: Array<string>,
    method: Method,
    previousNumSylls: number
  ) => {
    const joined = value.join("");
    seen.add(joined);
    assignments.set(word, {
      mono: joined,
      respelled: respellIPA(joined),
      method,
      numSyllables: previousNumSylls,
    });
    assignMethod[method]++;
    if (method !== "alreadyOneSyllable") {
      method != "failed" ? assignSuccesses++ : assignFails++;
    }
    assignResults.push(method != "failed");
    randomSyllables.delete(joined);
  };

  for (const [word, syll] of oneSyllable) {
    assign(word, syll[0], "alreadyOneSyllable", 1);
  }
  console.log(
    `${assignMethod.alreadyOneSyllable} / ${syllablizedPronuncations.length} words already one syllable ` +
      `(${oneSigFig(
        (100 * assignMethod.alreadyOneSyllable) /
          syllablizedPronuncations.length
      )}%)`
  );

  console.log("Assigning monosyllabic values...");
  let i = 0;
  for (const [word, sylls] of multiSyllable) {
    // print progress
    // no need to print after every word
    if (i % 100 === 0) {
      progress(
        i,
        multiSyllable.length,
        `${i}/${multiSyllable.length}.    ${assignMethod.direct} direct, ${assignMethod.graph} graph, ${assignMethod.choice} choice, ${assignMethod.random} random, ${assignMethod.failed} fails`
      );
    }
    i += 1;

    // try to use any syllable directly
    {
      const firstunused = sylls.find((syll) => !seen.has(syll.join("")));
      if (firstunused != null) {
        assign(word, firstunused, "direct", sylls.length);
        continue;
      }
    }

    // TODO: We might get even nicer results in the mid-common range by
    // trying to look for random syllables which are in-order subsets of the original,
    // e.g. farming -> frɪŋ, since random graph tends to discard ordering (mɪrf) .

    // try using graph with random palette
    {
      let assinedWithRandom = false;
      for (let i = 0; i < 1000; i++) {
        const generatedSyl = getRandomSyllableFromPallete(graph, sylls.flat());
        if (generatedSyl && !seen.has(generatedSyl.join(""))) {
          assign(word, generatedSyl, "graph", sylls.length);
          assinedWithRandom = true;
          break;
        }
      }
      if (assinedWithRandom) {
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

        assign(word, best[0]!, "choice", sylls.length);
        continue;
      }

      // if we didn't find a decent match, just use the first available
      if (randomSyllables.size > 0) {
        const [rand] = randomSyllables;
        assign(word, rand[1], "random", sylls.length);

        continue;
      }
    }

    // fallback -> we failed to assign anything
    assign(word, ["[", ...word, "]"], "failed", sylls.length);
  }
  console.log(); // last progress bar printed `\r`, newline to leave it

  console.log(
    `Assigned ${assignResults.filter(Boolean).length} words out of ${
      multiSyllable.length
    }`
  );
  const [totalSyllables, newTotalSyllables] = [...assignments.values()]
    .filter((a) => a.method !== "failed")
    .reduce((prev, a) => [prev[0] + a.numSyllables, prev[1] + 1], [0, 0]);
  console.log(
    `Removed ${totalSyllables - newTotalSyllables} syllables (${oneSigFig(
      (100 * (totalSyllables - newTotalSyllables)) / totalSyllables
    )}%)`
  );

  // sanity check that there's no duplicates
  {
    const seenIpa = new Set();
    let duplicates: Array<[string, Assignment]> = [];
    console.log("Testing if there are duplicates...");
    for (const [word, entry] of assignments.entries()) {
      // don't warn about duplicates for words that were already one syllable.
      // such duplicates are expected: "There" / "their"
      if (entry.method !== "alreadyOneSyllable" && seenIpa.has(entry.mono)) {
        duplicates.push([word, entry]);
      }
      seenIpa.add(entry.mono);
    }
    if (duplicates.length > 0) {
      console.log(
        `${duplicates.length} Duplicates detected: ${duplicates
          .slice(0, 5)
          .map((d) => `${d[0]} -> ${d[1].mono} (${d[1].method})`)}`
      );
    }
  }

  // write out main result: JSON mapping of words (+metadata)
  {
    const resultWithSingleSyllFilename = "outputs/monosyllabic.json";
    console.log(
      "Writing monosyllabic result to ",
      resultWithSingleSyllFilename
    );
    await fs.writeFile(
      resultWithSingleSyllFilename,
      JSON.stringify([...assignments.entries()], undefined, 2)
    );
  }

  // write out front-end optimized consumable json to power translator tool
  {
    const resultFilename = "ui/public/monosyllabic.json";
    console.log(
      "Writing ui-consumable monosyllabic result to ",
      resultFilename
    );
    await fs.writeFile(
      resultFilename,
      JSON.stringify(
        [...assignments.entries()].map(([word, result]) => {
          return [word, result.mono, result.respelled, result.numSyllables];
        })
      )
    );
  }

  return;
}

main();
