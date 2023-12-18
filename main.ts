import { promises as fs } from 'fs';
import { parameters } from './parameters';
import { respellIPA } from './respellIPA';
import { getRandomSyllableFromPalette, loadSonorityGraph } from './sonorityGraph';
import { generateSyllableAlternatives, loadSyllabilizedIpa } from './syllablize';
import { registerTime } from './timing';
import { AlternativeCategory, AssignMethod, IPA, RandomSyllableInfo, VariantHash } from './types';
import { oneSigFig, progress } from './util';

async function main() {
    const syllabilizedIpa = await loadSyllabilizedIpa();
    const syllabilizedLookup = new Map<string, IPA[][]>(syllabilizedIpa);

    const graph = await loadSonorityGraph(syllabilizedIpa);

    // map of joined IPA -> original english,
    // used by computed variants to lookup originals
    const reverseLookup = new Map<IPA, string>();
    for (const [key, value] of syllabilizedIpa) {
        reverseLookup.set(value.flatMap((s) => s.join('')).join(''), key);
    }

    const oneSyllable = syllabilizedIpa.filter(
        ([word, syllables]) => syllables.length === 1,
    );
    const multiSyllable = syllabilizedIpa.filter(
        ([word, syllables]) => syllables.length > 1,
    );

    const ipaWordSet = new Map<IPA, Array<Array<IPA>>>();

    for (const [_orig, parts] of syllabilizedIpa) {
        ipaWordSet.set(parts.flatMap((p) => p.join('')).join(''), parts);
    }

    const randomSyllablesWithVariations = new Map(
        JSON.parse(
            await fs.readFile(
                parameters.filePaths.randomWithVariations,
                {
                    encoding: 'utf-8',
                },
            ),
        ) as Array<
            [
                IPA,
                {
                    syllable: Array<IPA>;
                    variations: { [key in AlternativeCategory]: Array<IPA> };
                }
            ]
        >,
    );

    const variantSubsets: { [key: string]: Array<RandomSyllableInfo | null> } = {};
    // init all variant subsets: 0000000, 0000001, 0000010, ...
    const variantTypeCount = parameters.alternatives.alternativeCategories.length;
    const baseVariantHash = '0'.repeat(variantTypeCount);
    for (let i = 0; i < 2 ** variantTypeCount; i++) {
        const bin = i.toString(2);
        variantSubsets[(baseVariantHash + bin).slice(-variantTypeCount)] = [];
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
    const assignMethod: { [key in AssignMethod]: number } = {
        direct: 0,
        variant: 0,
        singleSyllableVariant: 0,
        graph: 0,
        choice: 0,
        random: 0,
        failed: 0,
        graphOrdered: 0,
        alreadyOneSyllable: 0,
        graphRemoved: 0,
    };

    const seen = new Set<IPA>();
    type Assignment = {
        mono: IPA;
        respelled: string;
        method: AssignMethod;
        numSyllables: number;
    };
    const assignments = new Map<string, Assignment>();

    const assign = (
        word: string,
        value: Array<string>,
        method: AssignMethod,
        previousSyllableCount: number,
    ) => {
        // console.log("assign", word, value.join(""), method);
        const joined = value.join('');
        seen.add(joined);
        assignments.set(word, {
            mono: joined,
            respelled: respellIPA(joined),
            method,
            numSyllables: previousSyllableCount,
        });
        assignMethod[method]++;
        if (method !== 'alreadyOneSyllable') {
            method !== 'failed' ? assignSuccesses++ : assignFails++;
        }
        assignResults.push(method != 'failed');
        randomSyllablesWithVariations.delete(joined);
        ipaWordSet.delete(joined); // probably not necessary since we've already used this word
    };

    const oneSyllableWordSet = new Set(
        oneSyllable.map((s) => s[1].flatMap((s) => s.join('')).join('')),
    );

    for (const [word, syllables] of oneSyllable) {
        assign(word, syllables[0], 'alreadyOneSyllable', 1);
        // a one-syllable word may also have multi-syllable variants,
        // eg. jump + jumping
        // we should try to assign these variants to be related to the original one-syllable word.
        // const variants = findVariants(ipaWordSet, syllables);
        const variants = findEnglishVariants(syllabilizedLookup, word);
        const alternatives = generateSyllableAlternatives(
            syllables[0],
            graph,
            new Map(),
            oneSyllableWordSet,
        );

        const maybeAssignVariant = (alternant: AlternativeCategory) => {
            const variant = variants[alternant];
            if (variant && variant.length > 1) {
                const alt = alternatives?.[alternant];
                if (alt) {
                    // newly made single-syllable alternate
                    const newJoined = alt.join('');
                    oneSyllableWordSet.add(newJoined);
                    // original variant's split IPA
                    const joined = variant.flatMap((s) => s.join('')).join('');
                    // english form for original variant
                    const originalVariant = reverseLookup.get(joined)!;
                    assign(
                        originalVariant,
                        alt,
                        'singleSyllableVariant',
                        variant!.length,
                    );
                }
            }
        };
        maybeAssignVariant('plural');
        maybeAssignVariant('past');
        maybeAssignVariant('actor');
        maybeAssignVariant('gerund');
    }
    console.log(
        `${assignMethod.alreadyOneSyllable} / ${syllabilizedIpa.length} words already one syllable ` +
        `(${oneSigFig(
            (100 * assignMethod.alreadyOneSyllable) / syllabilizedIpa.length,
        )}%)`,
    );
    console.log(
        `${assignMethod.singleSyllableVariant} additional variants from single-syllable words`,
    );
    console.log('Assigning monosyllabic values...');

    // Variants is an attempt to improve similar words that get assigned very different syllables.
    // This comes at the cost of less common syllables being assigned along with common ones,
    // which then leaves fewer good syllables for common words.
    // It's not clear that variants is totally better, but it does at least help some cases.
    const USE_VARIANTS = true;
    if (USE_VARIANTS) {
        // this is the subset of multiSyllable which are base words with variants.
        const multiSyllableWithVariants: typeof multiSyllable = [];
        for (const entry of multiSyllable) {
            const variants = findEnglishVariants(syllabilizedLookup, entry[0]);
            const variantHash = hashForVariants(variants);

            if (variantHash !== baseVariantHash) {
                multiSyllableWithVariants.push(entry);
            }
        }

        // since we don't necessarily encounter variants with the base first,
        // we need to prepass to find all variants and try to assign them first.
        {
            console.log(
                `Assigning words with variants... (${oneSigFig(
                    (100 * multiSyllableWithVariants.length) / multiSyllable.length,
                )}%)`,
            );

            let i = 0;
            let numVariantsSkipped = 0;
            for (const [word, syllables] of multiSyllableWithVariants) {
                // print progress
                // no need to print after every word
                if (i % 100 === 0) {
                    progress(
                        i,
                        multiSyllableWithVariants.length,
                        `${i}/${multiSyllableWithVariants.length}.    ${assignMethod.variant} variant, ${numVariantsSkipped} skipped`,
                    );
                }
                i += 1;

                const variants = findEnglishVariants(syllabilizedLookup, word);
                const variantHash = hashForVariants(variants);
                if (variantHash !== baseVariantHash) {
                    const candidates: Array<[RandomSyllableInfo, number, number]> = [];
                    for (const [variantSyllableIndex, randomSyllable] of variantSubsets[variantHash].entries()) {
                        if (randomSyllable == null) {
                            continue;
                        }

                        if (seen.has(randomSyllable.syllable.join(''))) {
                            continue;
                        }
                        // if any variant is already being used, try a new random syllable.
                        // this makes it less likely we'll use the variant,
                        // but we'd rather have it match and not cause duplicates.
                        if (
                            parameters.alternatives.alternativeCategories.some(
                                c => randomSyllable.variations?.[c] !== null &&
                                    seen.has(randomSyllable.variations?.[c]?.join('') || '-'),
                            )
                        ) {
                            continue;
                        }
                        const score = scoreForRandomSyllable(syllables, randomSyllable);
                        if (score > 0) {
                            candidates.push([
                                randomSyllable,
                                score,
                                variantSyllableIndex,
                            ]);
                            if (score === 10 * randomSyllable.syllable.length) {
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
                        assign(word, bestInfo.syllable, 'variant', syllables.length);
                        const assignVariant = (which: AlternativeCategory) => {
                            if (bestInfo.variations?.[which]) {
                                const variantIpa = variants[which]!.flatMap((s) =>
                                    s.join(''),
                                ).join('');
                                const original = reverseLookup.get(variantIpa);
                                if (original == null) {
                                    console.log('Uh oh couldnt reverse lookup', variantIpa);
                                }
                                assign(
                                    original!,
                                    bestInfo.variations[which]!,
                                    'variant',
                                    variants[which]!.length,
                                );
                            }
                        };
                        parameters.alternatives.alternativeCategories.forEach(assignVariant);

                        // remove this variant from teh list of possibilities, so we don't re-use it
                        variantSubsets[variantHash][best[2]] = null;
                    } else {
                        numVariantsSkipped++;
                    }
                }
            }
            console.log();
        }
    }

    console.log('Assigning words without variants...');
    let i = 0;
    for (const [originalWord, originalSyllables] of multiSyllable) {
        // print progress
        // no need to print after every word
        if (i % 100 === 0) {
            progress(
                i,
                multiSyllable.length,
                `${i}/${multiSyllable.length}.    ${assignMethod.direct} direct, ${assignMethod.graph + assignMethod.graphRemoved + assignMethod.graphOrdered} graph (${assignMethod.graph} w/ replace /// ${assignMethod.graphRemoved} w/ remove /// ${assignMethod.graphOrdered} w/ strict order), ${assignMethod.choice} choice, ${assignMethod.random} random, ${assignMethod.failed} fails.`,
            );
        }

        i += 1;

        // We tried to assign words with variants first. But if that process failed,
        // we may have left it unassigned. We should assign it like normal.
        // But any words that are already assigned we can safely skip (we know it's because they're from variants)
        if (assignments.has(originalWord)) {
            continue;
        }

        // try to use any syllable directly
        {
            const firstUnused = originalSyllables.find((syllable) => !seen.has(syllable.join('')));
            if (firstUnused != null) {
                assign(originalWord, firstUnused, 'direct', originalSyllables.length);
                continue;
            }
        }

        // try using graph with random palette, but maintaining original order
        {
            let assignedWithOrdered = false;
            for (let i = 0; i < 1000; i++) {
                const generatedOrderedSyl = getRandomSyllableFromPalette(graph, originalSyllables.flat(), true);
                if (generatedOrderedSyl && !seen.has(generatedOrderedSyl.join(''))) {
                    assign(originalWord, generatedOrderedSyl, 'graphOrdered', originalSyllables.length);
                    assignedWithOrdered = true;
                    break;
                }
            }

            if (assignedWithOrdered) {
                continue;
            }
        }

        // try using graph with random palette, but not re-using sounds beyond the original count
        {
            let assignedWithRemoval = false;
            for (let i = 0; i < 1000; i++) {
                const generatedSyl = getRandomSyllableFromPalette(graph, originalSyllables.flat(), false, true);
                if (generatedSyl && !seen.has(generatedSyl.join(''))) {
                    assign(originalWord, generatedSyl, 'graphRemoved', originalSyllables.length);
                    assignedWithRemoval = true;
                    break;
                }
            }

            if (assignedWithRemoval) {
                continue;
            }
        }

        // try using graph with (completely) random palette
        {
            let assignedWithRandom = false;
            for (let i = 0; i < 1000; i++) {
                const generatedSyl = getRandomSyllableFromPalette(graph, originalSyllables.flat());
                if (generatedSyl && !seen.has(generatedSyl.join(''))) {
                    assign(originalWord, generatedSyl, 'graph', originalSyllables.length);
                    assignedWithRandom = true;
                    break;
                }
            }

            if (assignedWithRandom) {
                continue;
            }
        }

        // find a random syllable to use from pregenerated list
        {
            let candidates: Array<[Array<IPA>, number]> = [];

            let best: [Array<IPA> | undefined, number] = [
                undefined,
                -Infinity,
            ];

            for (const [
                _joined,
                randomSyllable,
            ] of randomSyllablesWithVariations.entries()) {
                const score = scoreForRandomSyllable(originalSyllables, randomSyllable);
                if (score > 0) {
                    const syllableHere = [
                        randomSyllable.syllable,
                        score,
                    ] as [IPA[], number];

                    candidates.push(syllableHere);
                    if (score > 7 * randomSyllable.syllable.length) {
                        // early exit: we found a syllable that got a decent score
                        best = [
                            randomSyllable.syllable,
                            score,
                        ];
                        break;
                    }
                }
            }

            if (candidates.length > 0 && !best[0]) {
                for (const candidate of candidates) {
                    if (candidate[1] > best[1]) {
                        best = candidate;
                    }
                }

                assign(originalWord, best[0]!, 'choice', originalSyllables.length);
                continue;
            }

            // if we didn't find a decent match, just use the first available
            if (randomSyllablesWithVariations.size > 0) {
                const [rand] = randomSyllablesWithVariations;
                assign(originalWord, rand[1].syllable, 'random', originalSyllables.length);

                continue;
            }
        }

        // fallback -> we failed to assign anything
        assign(
            originalWord,
            [
                '[',
                ...originalWord,
                ']',
            ],
            'failed',
            originalSyllables.length,
        );
    }
    console.log(); // last progress bar printed `\r`, newline to leave it

    console.log(
        `Assigned ${assignResults.filter(Boolean).length} words out of ${multiSyllable.length}`,
    );
    const [totalSyllables, newTotalSyllables] = [...assignments.values()]
        .filter((a) => a.method !== 'failed')
        .reduce(
            (prev, a) => [
                prev[0] + a.numSyllables,
                prev[1] + 1,
            ],
            [
                0,
                0,
            ],
        );
    console.log(
        `Removed ${totalSyllables - newTotalSyllables} syllables (${oneSigFig(
            (100 * (totalSyllables - newTotalSyllables)) / totalSyllables,
        )}%)`,
    );

    // sanity check that there's no duplicates
    {
        const seenIpa = new Set();
        let duplicates: Array<[string, Assignment]> = [];
        console.log('Testing if there are duplicates...');
        for (const [word, entry] of assignments.entries()) {
            // don't warn about duplicates for words that were already one syllable.
            // such duplicates are expected: "There" / "their"
            if (entry.method !== 'alreadyOneSyllable' && seenIpa.has(entry.mono)) {
                duplicates.push([
                    word,
                    entry,
                ]);
            }
            seenIpa.add(entry.mono);
        }
        if (duplicates.length > 0) {
            console.log(
                `${duplicates.length} Duplicates detected: ${duplicates
                    .slice(0, 5)
                    .map((d) => `${d[0]} -> ${d[1].mono} (${d[1].method})`)
                    .join('\n')}`,
            );
            console.log('Writing duplicates for debugging to ', parameters.filePaths.duplicates);
            await fs.writeFile(
                parameters.filePaths.duplicates,
                JSON.stringify(duplicates, null, 2),
            );
        }
    }

    // write out main result: JSON mapping of words (+metadata)
    {
        console.log(
            'Writing monosyllabic result to ',
            parameters.filePaths.monosyllabicOutput,
        );
        await fs.writeFile(
            parameters.filePaths.monosyllabicOutput,
            JSON.stringify([...assignments.entries()], undefined, 2),
        );
    }

    // write out front-end optimized consumable json to power translator tool
    {
        console.log(
            'Writing ui-consumable monosyllabic result to ',
            parameters.filePaths.uiResultsOutput,
        );
        await fs.writeFile(
            parameters.filePaths.uiResultsOutput,
            JSON.stringify(
                [...assignments.entries()].map(([word, result]) => {
                    return [
                        word,
                        result.mono,
                        result.respelled,
                        result.numSyllables,
                    ];
                }),
            ),
        );
    }

    return;
}

main();

const optimisedSimilarityLookup = Object.fromEntries(
    Array.from(
             new Set(
                 parameters
                     .IPA
                     .phonemeSimilarityGroups
                     .flat(),
             ),
         )
         .map(e => [
             e,
             new Set(
                 parameters.IPA.phonemeSimilarityGroups.filter(t => t.includes(e)).flat(),
             ),
         ]),
);

function scoreForRandomSyllable(
    syllables: Array<Array<IPA>>,
    randomSyllable: RandomSyllableInfo,
): number {
    const phonemes = syllables.flat();
    let score = 0;

    for (let phonemeIndex = 0; phonemeIndex < randomSyllable.syllable.length; phonemeIndex++) {
        const p = randomSyllable.syllable[phonemeIndex];
        let foundAtIndex = phonemes.indexOf(p);

        let bonusHere = 0;
        if (foundAtIndex > -1) {
            bonusHere = 10;
        } else {
            for (let i = 0; i < phonemes.length; i++) {
                if (optimisedSimilarityLookup[p]?.has(phonemes[i])) {
                    bonusHere = 4;
                    foundAtIndex = i;
                    break;
                }
            }
        }

        if (foundAtIndex > -1) {
            bonusHere *= 1 - Math.abs(foundAtIndex / phonemes.length - phonemeIndex / randomSyllable.syllable.length) * 0.3;
            score += bonusHere;
        } else {
            score -= 4;
        }
    }
    return score;
}

/** Encode a set of variants as a string to look up in a table
 *  e.g. {plural: true, gerund: true} -> '101000...'
 */
function hashForVariants(variants: {
    [key in AlternativeCategory]?: unknown
}): VariantHash {
    return parameters.alternatives.alternativeCategories.map(t => variants[t] ? '1' : '0').join('');
}

function findEnglishVariants(
    wordSet: Map<string, IPA[][]>,
    word: string,
): { [key in AlternativeCategory]?: Array<Array<IPA>> } {
    const result: { [key in AlternativeCategory]?: Array<Array<IPA>> } = {};

    const checkAndSet = (which: AlternativeCategory, end: string) => {
        let combinedWord: string;
        if (end.startsWith('^')) {
            const endSegments = end.match(/^(\^+)(.*)/)!;
            combinedWord = word.slice(0, -endSegments[1].length) + endSegments[2];
        } else if (end.endsWith('*')) {
            combinedWord = end.slice(0, -1) + word;
        } else {
            combinedWord = word + end;
        }

        if (wordSet.has(combinedWord)) {
            result[which] = wordSet.get(combinedWord);
        }
    };

    Object
        .entries(parameters.alternatives.alternantMatchers)
        .forEach(alternant => {
            alternant[1].forEach(end => {
                checkAndSet(alternant[0] as AlternativeCategory, end);
            });
        });

    return result;
}

/**
 * Given a split IPA word, find all variants in original english, in split IPA
 */
// function findVariants(
//     ipaWordSet: Map<IPA, Array<Array<IPA>>>,
//     word: Array<Array<IPA>>,
// ): { [key in AlternativeCategory]?: Array<Array<IPA>> } {
//     const result: { [key in AlternativeCategory]?: Array<Array<IPA>> } = {};
//
//     const checkAndSet = (which: AlternativeCategory, end: IPA) => {
//         const combined = JSON.parse(JSON.stringify(word)) as typeof word;
//         combined[combined.length - 1].push(end);
//         const flat = combined.flatMap((w) => w.join('')).join('');
//
//         if (ipaWordSet.has(flat)) {
//             result[which] = ipaWordSet.get(flat); // use the actual word, since syllabilization is unpredictable
//         }
//     };
//     checkAndSet('plural', 'z');
//     checkAndSet('plural', 's');
//     checkAndSet('past', 'd');
//     checkAndSet('past', 't');
//     checkAndSet('gerund', 'ŋ');
//     checkAndSet('gerund', 'ɪŋ');
//     checkAndSet('actor', 'ɹ');
//     checkAndSet('actor', 'ɝ');
//     checkAndSet('actor', 'ɹɪs');
//     checkAndSet('actor', 'ɹʌs');
//     return result;
// }
