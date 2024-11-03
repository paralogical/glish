import { promises as fs } from "fs";
import { respellIPA } from "./respellIPA";
import {
  createSonorityGraph,
  getRandomSyllableFromPallete,
  loadSonorityGraph,
} from "./sonorityGraph";
import {
  alternants,
  AlternativeCategory,
  generateSyllableAlternatives,
  loadSyllabilizedIpa,
  RandomSyllableInfo,
  SyllablizedIPA,
} from "./syllablize";
import { oneSigFig, progress } from "./util";
import { parse } from "ts-command-line-args";

const all_features = ['homonyms'] as const
type Feature = typeof all_features[number]

interface IMainArgs {
  features?: string[]; // this `string` rather than `Feature` so that `parse`'s `ParseOptions` can compute over it.
  help?: boolean;
}

const args = parse<IMainArgs>(
  {
    'features': { 'type': String, 'multiple': true, 'optional': true, 'description': `Which features to enable. Available features: ${all_features.join(", ")}` },
    'help': { 'type': Boolean, 'optional': true }
  },
  {
    'helpArg': 'help',
  }
)

// Ensure that the `features` in `args` are known features.
const features = new Set(args.features?.map((s) => {
  const f = s as Feature;
  if (!all_features.includes(f)) throw new Error(`Unknown feature: "${s}". Available features: ${all_features.join(", ")}`)
  return f
}) ?? []);

console.log(features);
process.exit()

async function main() {
  const syllabilizedIpa = await loadSyllabilizedIpa();
  const graph = await loadSonorityGraph(syllabilizedIpa);

  // map of joined IPA -> original english,
  // used by computed variants to lookup originals
  const reverseLookup = new Map<string, string>();
  for (const [key, value] of syllabilizedIpa) {
    reverseLookup.set(value.flatMap((s) => s.join("")).join(""), key);
  }

  const oneSyllable = syllabilizedIpa.filter(
    ([word, syllalbles]) => syllalbles.length === 1
  );
  const multiSyllable = syllabilizedIpa.filter(
    ([word, syllalbles]) => syllalbles.length > 1
  );

  const wordSet = new Map<string /*IPA*/, Array<Array<string>>>();

  for (const [_orig, parts] of syllabilizedIpa) {
    wordSet.set(parts.flatMap((p) => p.join("")).join(""), parts);
  }

  const randomSyllablesWithVariations = new Map(
    JSON.parse(
      await fs.readFile(
        "./outputs/random_generated_syllables_with_variations.json",
        {
          encoding: "utf-8",
        }
      )
    ) as Array<
      [
        string,
        {
          syllable: Array<string>;
          variations: { [key in AlternativeCategory]: Array<string> };
        }
      ]
    >
  );

  const variantSubsets: { [key: string]: Array<RandomSyllableInfo | null> } =
    {};
  // init all variant subsets: 0000, 0001, 0010, ...
  for (let i = 0; i < 2 ** 4; i++) {
    const bin = i.toString(2);
    variantSubsets[("0000" + bin).slice(-4)] = [];
  }

  for (const data of randomSyllablesWithVariations.values()) {
    if (data.variations == null) {
      continue;
    }
    const variantHash = hashForVariants(data.variations);
    variantSubsets[variantHash].push(data);
  }

  let assignResults: Array<boolean> = [];
  let assignSuccesses = 0;
  let assignFails = 0;
  type Method =
    | "direct"
    | "variant"
    | "singleSyllableVariant"
    | "graph"
    | "choice"
    | "random"
    | "failed"
    | "alreadyOneSyllable";
  const assignMethod: { [key in Method]: number } = {
    direct: 0,
    variant: 0,
    singleSyllableVariant: 0,
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
    // console.log("assign", word, value.join(""), method);
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
    randomSyllablesWithVariations.delete(joined);
    wordSet.delete(joined); // probably not necessary since we've already used this word
  };

  const oneSyllableWordSet = new Set(
    oneSyllable.map((s) => s[1].flatMap((s) => s.join("")).join(""))
  );

  for (const [word, syll] of oneSyllable) {
    assign(word, syll[0], "alreadyOneSyllable", 1);
    // a one-syllable word may also have multi-syllable variants,
    // eg. jump + jumping
    // we should try to assign these variants to be related to the original one-syllable word.
    const variants = findVariants(wordSet, syll);
    const alternatives = generateSyllableAlternatives(
      syll[0],
      graph,
      new Map(),
      oneSyllableWordSet
    );

    const maybeAssignVariant = (alternant: AlternativeCategory) => {
      const variant = variants[alternant];
      if (variant && variant.length > 1) {
        const alt = alternatives?.[alternant];
        if (alt) {
          // newly made single-syllable alternate
          const newJoined = alt.join("");
          oneSyllableWordSet.add(newJoined);
          // original variant's split IPA
          const joined = variant.flatMap((s) => s.join("")).join("");
          // english form for original variant
          const originalVariant = reverseLookup.get(joined)!;
          assign(
            originalVariant,
            alt,
            "singleSyllableVariant",
            variant!.length
          );
        }
      }
    };
    maybeAssignVariant("plural");
    maybeAssignVariant("past");
    maybeAssignVariant("actor");
    maybeAssignVariant("gerund");
  }
  console.log(
    `${assignMethod.alreadyOneSyllable} / ${syllabilizedIpa.length} words already one syllable ` +
    `(${oneSigFig(
      (100 * assignMethod.alreadyOneSyllable) / syllabilizedIpa.length
    )}%)`
  );
  console.log(
    `${assignMethod.singleSyllableVariant} additional variants from single-syllable words`
  );
  console.log("Assigning monosyllabic values...");

  // Variants is an attempt to improve similar words that get assigned very different syllables.
  // This comes at the cost of less common syllables being assigned along with common ones,
  // which then leaves fewer good syllables for common words.
  // It's not clear that variants is totally better, but it does at least help some cases.
  const USE_VARIANTS = true;
  if (USE_VARIANTS) {
    // this is the subset of multiSyllable which are base words with variants.
    const multiSyllableWithVariants: typeof multiSyllable = [];
    for (const entry of multiSyllable) {
      const variants = findVariants(wordSet, entry[1]);
      const variantHash = hashForVariants(variants);

      if (variantHash !== "0000") {
        multiSyllableWithVariants.push(entry);
      }
    }

    // since we don't necessarily encounter variants with the base first,
    // we need to prepass to find all variants and try to assign them first.
    {
      console.log(
        `Assigning words with variants... (${oneSigFig(
          (100 * multiSyllableWithVariants.length) / multiSyllable.length
        )}%)`
      );

      let i = 0;
      let numVariantsSkipped = 0;
      for (const [word, sylls] of multiSyllableWithVariants) {
        // print progress
        // no need to print after every word
        if (i % 100 === 0) {
          progress(
            i,
            multiSyllableWithVariants.length,
            `${i}/${multiSyllableWithVariants.length}.    ${assignMethod.variant} variant, ${numVariantsSkipped} skipped`
          );
        }
        i += 1;

        const variants = findVariants(wordSet, sylls);
        const variantHash = hashForVariants(variants);
        if (variantHash !== "0000") {
          const candidates: Array<[RandomSyllableInfo, number, number]> = [];
          // TODO: we could also try other variant subsets,
          // if this one doesn't work well enough
          for (const [variantSyllableIndex, randomSyll] of variantSubsets[
            variantHash
          ].entries()) {
            if (randomSyll == null) {
              continue;
            }
            if (!features.has('homonyms')) {
              if (seen.has(randomSyll.syllable.join(""))) {
                continue;
              }
              // if any variant is already being used, try a new random syllable.
              // this makes it less likely we'll use the variant,
              // but we'd rather have it match and not cause duplicates.
              if (
                (randomSyll.variations?.actor != null &&
                  seen.has(randomSyll.variations?.actor?.join(""))) ||
                (randomSyll.variations?.past != null &&
                  seen.has(randomSyll.variations?.past?.join(""))) ||
                (randomSyll.variations?.plural != null &&
                  seen.has(randomSyll.variations?.plural?.join(""))) ||
                (randomSyll.variations?.gerund != null &&
                  seen.has(randomSyll.variations?.gerund?.join("")))
              ) {
                continue;
              }
            }
            const score = scoreForRandomSyllable(sylls, randomSyll);
            if (score > 0) {
              candidates.push([randomSyll, score, variantSyllableIndex]);
              if (score === 10 * randomSyll.syllable.length) {
                // early exit: we found a syllable that got the highest possible score! go for it!
                break;
              }
            }
          }
          if (candidates.length > 0) {
            let best: [RandomSyllableInfo | undefined, number, number] = [
              undefined,
              -Infinity,
              -1,
            ];
            for (const cand of candidates) {
              if (cand[1] > best[1]) {
                best = cand;
              }
            }

            const bestInfo = best[0]!;
            assign(word, bestInfo.syllable, "variant", sylls.length);
            const assignVariant = (which: AlternativeCategory) => {
              if (bestInfo.variations?.[which]) {
                const variantIpa = variants[which]!.flatMap((s) =>
                  s.join("")
                ).join("");
                const original = reverseLookup.get(variantIpa);
                if (original == null) {
                  console.log("Uh oh couldnt reverse lookup", variantIpa);
                }
                assign(
                  original!,
                  bestInfo.variations[which]!,
                  "variant",
                  variants[which]!.length
                );
              }
            };
            assignVariant("past");
            assignVariant("plural");
            assignVariant("gerund");
            assignVariant("actor");

            // remove this variant from teh list of possiblities so we don't re-use it
            variantSubsets[variantHash][best[2]] = null;

            continue;
          } else {
            numVariantsSkipped++;
          }
        }
      }
      console.log();
    }
  }

  console.log("Assigning words without variants...");
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

    // We tried to assign words with variants first. But if that process failed,
    // we may have left it unassigned. We should assign it like normal.
    // But any words that are already assigned we can safely skip (we know it's because they're from variants)
    // TODO
    if (assignments.has(word)) {
      continue;
    }

    // try to use any syllable directly
    {
      const firstunused = sylls.find((syll) => features.has('homonyms') || !seen.has(syll.join("")));
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
        if (generatedSyl && (features.has('homonyms') || !seen.has(generatedSyl.join("")))) {
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

      for (const [
        _joined,
        randomSyll,
      ] of randomSyllablesWithVariations.entries()) {
        const score = scoreForRandomSyllable(sylls, randomSyll);
        if (score > 0) {
          candidates.push([randomSyll.syllable, score]);
          if (score === 10 * randomSyll.syllable.length) {
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
      if (randomSyllablesWithVariations.size > 0) {
        const [rand] = randomSyllablesWithVariations;
        assign(word, rand[1].syllable, "random", sylls.length);

        continue;
      }
    }

    // fallback -> we failed to assign anything
    assign(word, ["[", ...word, "]"], "failed", sylls.length);
  }
  console.log(); // last progress bar printed `\r`, newline to leave it

  console.log(
    `Assigned ${assignResults.filter(Boolean).length} words out of ${multiSyllable.length
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
  if (!features.has('homonyms')) {
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
          .map((d) => `${d[0]} -> ${d[1].mono} (${d[1].method})`)
          .join("\n")}`
      );
      const duplicatesFileName = "outputs/duplicates.json";
      console.log("Writing duplicates for debugging to ", duplicatesFileName);
      await fs.writeFile(
        duplicatesFileName,
        JSON.stringify(duplicates, null, 2)
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

function scoreForRandomSyllable(
  sylls: Array<Array<string>>,
  randomSyll: RandomSyllableInfo
): number {
  const phones = new Set(sylls.flat());
  let score = 0;
  for (const p of randomSyll.syllable) {
    if (phones.has(p)) {
      score += 10;
    } else {
      score -= 5;
    }
  }
  return score;
}

type VariantHash = string; // 0010
/** Encode a set of variants as a string to look up in a table
 *  e.g. {plural: true, gerund: true} -> '1010'
 */
function hashForVariants(variants: {
  [key in AlternativeCategory]?: unknown;
}): VariantHash {
  return (
    (variants.plural ? "1" : "0") +
    (variants.past ? "1" : "0") +
    (variants.gerund ? "1" : "0") +
    (variants.actor ? "1" : "0")
  );
}

/**
 * Given a split IPA word, find all variants in original english, in split IPA
 */
function findVariants(
  wordSet: Map<string, Array<Array<string>>>,
  word: Array<Array<string>>
): { [key in AlternativeCategory]?: Array<Array<string>> } {
  const result: { [key in AlternativeCategory]?: Array<Array<string>> } = {};
  const checkAndSet = (which: AlternativeCategory, end: string) => {
    const combined = JSON.parse(JSON.stringify(word)) as typeof word;
    combined[combined.length - 1].push(end);
    const flat = combined.flatMap((w) => w.join("")).join("");

    if (wordSet.has(flat)) {
      result[which] = wordSet.get(flat); // use the actual word, since syllabilization is unpredictable
    }
  };
  checkAndSet("plural", "z");
  checkAndSet("plural", "s");
  checkAndSet("past", "d");
  checkAndSet("past", "t");
  checkAndSet("gerund", "ŋ");
  checkAndSet("gerund", "ɪŋ");
  checkAndSet("actor", "ɹ");
  checkAndSet("actor", "ɛɹ");
  return result;
}
