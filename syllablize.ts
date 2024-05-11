import { promises as fs } from 'fs';
import { parameters } from './parameters';
import { getRandomSyllable, loadSonorityGraph, printGraph, SonorityGraph } from './sonorityGraph';
import { AlternativeCategory, AlternativesForSyllable, IPA, RandomSyllableInfo, SyllablizedIPA } from './types';
import { oneSigFig, progress } from './util';

async function getWordsByFrequency(): Promise<Array<string>> {
    const content = await fs.readFile(parameters.filePaths.wordFrequencyList, {
        encoding: 'utf-8',
    });
    const lines = content.split('\n');
    const words = lines.map((line) => line.split('\t')[0]);

    return words.slice(0, parameters.buildSyllables.wordFrequencyCutoff);
}

/**
 * Load previously written syllabized IPA from disk.
 * If it doesn't exist, generate anew.
 */
export async function loadSyllabilizedIpa(): Promise<SyllablizedIPA> {
    try {
        const ipa = await fs.readFile(parameters.filePaths.syllabilizedIPA, 'utf8');
        const result = JSON.parse(ipa) as SyllablizedIPA;
        console.log('Loaded cached syllabilized IPA');
        return result;
    } catch (err) {
        return generatedSyllabilizedIpa();
    }
}

async function generatedSyllabilizedIpa(): Promise<SyllablizedIPA> {
    const wordsByFrequency = await getWordsByFrequency();
    const wordSet = new Set(wordsByFrequency);

    console.log('loaded %d frequencies', wordSet.size);

    const cmu_file = await fs.readFile(parameters.filePaths.pronunciationList, 'utf-8');
    const lines = cmu_file.split('\n');
    console.log(`converting ${lines.length} CMU words into IPA`);
    let i = 0;
    const ipaSyllables: { [key: string]: Array<Array<IPA>> } = {};
    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        }
        i += 1;
        progress(i, lines.length, '');
        if (line.trim() === '') continue;
        const [wordUpper, sounds] = line.split('  ', 2);
        if (/.*\(\d\)$/.test(wordUpper)) continue;
        const syllables = sounds.split('.').map((syllable) =>
            syllable
                .trim()
                .split(' ')
                .map(
                    (phone) =>
                        parameters.IPA.APRABET_TO_IPA[/^([A-Z]+)\d*$/.exec(phone)![1]] ??
                        console.log('couldn\'t find phone ', phone),
                ),
        );
        const word = wordUpper.toLowerCase();
        ipaSyllables[word] = syllables;
    }

    console.log();

    console.log('sorting by frequency...');

    const orderedResult: SyllablizedIPA = [];
    // insert syllablized one by one
    for (const word of wordsByFrequency) {
        const found = ipaSyllables[word];
        if (found) {
            orderedResult.push([
                word,
                found,
            ]);
            delete ipaSyllables[word];
        }
    }
    // anything left in ipaSyllables we don't have a frequency for, but we still want to use
    orderedResult.push(...Object.entries(ipaSyllables));

    console.log('writing syllabized ipa result...');

    await fs.writeFile(
        parameters.filePaths.syllabilizedIPA,
        JSON.stringify(orderedResult, undefined, 2),
    );

    return orderedResult;
}

/**
 * Construct ordered list of syllablized pronunciations
 * map of word -> IPA split into syllables by |
 * ordered by usage of the word (common words first)
 * ['business', [ ["b", "ɪ", "z"], ["n", "ʌ", "s"] ]]
 * words not in frequency list are appended to the end
 */
export async function loadSyllabalizedPronunciations(): Promise<
    Array<[string, Array<Array<IPA>>]>
> {
    const syllabilizedIpa = await loadSyllabilizedIpa();
    const graph = await loadSonorityGraph(syllabilizedIpa);

    await fs.writeFile(
        parameters.filePaths.graphViz,
        printGraph(graph),
    );
    console.log('wrote graphviz');

    const existingOneSyllableWords: Array<IPA> = [];

    for (const [_word, syllables] of syllabilizedIpa) {
        if (syllables.length === 1) {
            existingOneSyllableWords.push(
                syllables.flatMap((s) => s.join('')).join(''),
            );
        }
    }

    // Uncomment this to generate random syllables (takes a few minutes)
    // await bulkGenerateSyllables(graph);
    console.log('creating lots of random syllables');
    await bulkGenerateSyllablesWithVariations(graph, existingOneSyllableWords);

    console.log('-----------');

    return syllabilizedIpa;
}

async function bulkGenerateSyllables(graph: SonorityGraph) {
    const syllables = new Map<IPA, Array<IPA>>();

    let N = parameters.buildSyllables.generationAttempts;
    for (let j = 0; j < N; j++) {
        const s = getRandomSyllable(graph);
        const joined = s.join('');
        if (syllables.has(joined)) {
            continue;
        }
        syllables.set(joined, s);
        if (j % 100 === 0) {
            process.stdout.write('\u001b[2K');
            progress(j, N, oneSigFig((100 * j) / N) + '% ' + joined);
        }
    }
    console.log();
    console.log(`created ${syllables.size} unique syllables`);
    console.log('writing random syllables');

    await fs.writeFile(
        parameters.filePaths.randomGeneratedSyllables,
        JSON.stringify([...syllables.entries()], undefined, 2),
    );
}

// Tests / standalone
if (require.main === module) {
    loadSyllabalizedPronunciations();
}

async function bulkGenerateSyllablesWithVariations(
    graph: SonorityGraph,
    existingOneSyllableWords: Array<IPA>,
) {
    const syllables = new Map<
        IPA,
        { syllable: Array<IPA>; variations?: AlternativesForSyllable }
    >();
    const variations = new Set<IPA>();

    for (const word of existingOneSyllableWords) {
        // Make sure our random syllables aren't existing one-syllable words.
        variations.add(word);
    }

    let numWithVariations = 0;
    let numWithoutVariations = 0;

    // many attempts with be repeats; 100 million typically generates ~150,000 syllables
    // which is enough to cover our dictionary.
    // we get slightly less using variations
    let N = parameters.buildSyllables.generationAttempts;
    for (let j = 0; j < N; j++) {
        const s = getRandomSyllable(graph);
        const joined = s.join('');
        if (syllables.has(joined) || variations.has(joined)) {
            continue;
        }

        const result: RandomSyllableInfo = { syllable: s };

        {
            const foundVariations = generateSyllableAlternatives(
                s,
                graph,
                syllables,
                variations,
            );

            if (foundVariations) {
                result.variations = foundVariations;
                for (const [alternant, variation] of Object.entries(foundVariations)) {
                    const joined = variation.join('');
                    variations.add(joined);
                }
                numWithVariations++;
            } else {
                numWithoutVariations++;
            }
        }

        syllables.set(joined, result);
        if (j % 100 === 0) {
            process.stdout.write('\u001b[2K');
            progress(j, N, oneSigFig((100 * j) / N) + '% ' + joined);
        }
    }
    console.log();
    console.log(`created ${syllables.size} unique syllables`);
    console.log(`${numWithVariations} with variations,`);
    console.log(`${numWithoutVariations} without.`);
    console.log('writing random syllables');

    await fs.writeFile(
        parameters.filePaths.randomWithVariations,
        JSON.stringify([...syllables.entries()], undefined, 2),
    );
}

/**
 * Given a randomly generated syllable,
 * Consider all alternants (plural: add z, past: add d, ...)
 * Find where the alternant could be inserted to make a valid variation.
 * Only tries to insert into the coda (so it's like a suffix)
 *  e.g. "blulb"
 *   extract coda "lb"
 *   for each alternant (z, d, ŋ, ɹ)
 *   find possible insertion points (*lb, l*b, lb*)
 *   compute probability of putting alternant in that place
 *   pick variant with highest
 *   if all 0, that variant is not allowed to exist
 *
 * This function also takes the set of existing variants/syllables so it won't
 * duplicate existing already-generated syllables
 */
export function generateSyllableAlternativesFromCoda(
    syllable: Array<IPA>,
    graph: SonorityGraph,
    syllables: Map<IPA, unknown>,
    variations: Set<IPA>,
): AlternativesForSyllable | undefined {
    let alternatives: AlternativesForSyllable | undefined = undefined;

    // const log: typeof console.log = console.log;
    const log: typeof console.log = () => undefined;

    let codaStartIndex = 0;
    let state = 'onset';
    for (const letter of syllable) {
        if (state === 'onset') {
            if (parameters.IPA.vowelRegex.exec(letter)) {
                state = 'vowel';
            }
        } else if (state === 'vowel') {
            if (!parameters.IPA.vowelRegex.exec(letter)) {
                state = 'coda';
                break;
            }
        }
        codaStartIndex++;
    }
    const coda = syllable.slice(codaStartIndex);
    const onsetAndVowel = syllable.slice(0, codaStartIndex);

    log(syllable.join(''), 'parts', onsetAndVowel.join(''), coda.join(''));

    const codaGraph = graph.parts[2];

    // probability counts should be at least this to consider it valid
    // this helps avoid `zz` and other weird insertions
    const MIN_SCORE = 2;

    for (const [kind, alternant] of Object.entries(parameters.alternatives.alternants) as Array<[AlternativeCategory, IPA]>) {
        // one extra spot at the end
        // blulb -> lb -> l b
        //                0 1 2
        // e.g.: try to insert 'z'
        const scores: Array<[number, Array<IPA>]> = [];

        log(syllable.join(''), '+', alternant);
        for (let spot = 0; spot < coda.length + 1; spot++) {
            if (spot === 0) {
                // beginning: zlb

                const realization = [
                    ...onsetAndVowel,
                    alternant,
                    ...coda,
                ];
                const joinedRealization = realization.join('');

                log('  considering', joinedRealization);
                if (
                    syllables.has(joinedRealization) ||
                    variations.has(joinedRealization)
                ) {
                    log('  already realized');
                    // this variant has been used before
                    continue;
                }

                // possible next steps after starting with the alternant: z->t, z->d, ...
                const starting = codaGraph.get(alternant);
                if (starting == null) {
                    log('  not a possible start');
                    continue;
                }

                // find which next step actually applies
                const result = starting.find(([next, value]) => next === coda[0]);
                if (result == null || result[1] <= MIN_SCORE) {
                    log('  not possible to insert continuation');
                    continue;
                }

                // if it's possible, take this score
                scores.push([
                    result[1],
                    realization,
                ]);
            } else {
                // between letters: lzb
                // or end: lbz

                const realization = [
                    ...onsetAndVowel,
                    ...coda.slice(0, spot),
                    alternant,
                    ...coda.slice(spot),
                ];
                const joinedRealization = realization.join('');

                log('  considering', joinedRealization);
                if (
                    syllables.has(joinedRealization) ||
                    variations.has(joinedRealization)
                ) {
                    log('  already realized');
                    // this variant has been used before
                    continue;
                }

                const previous = coda[spot - 1];
                const after = coda[spot]; // undefined at end

                // possible next steps after starting with the previous: l->z, ...
                const starting = codaGraph.get(previous);
                if (starting == null) {
                    // should never happen, since we're here now...
                    log('  not a possible start (uh oh)', previous);
                    continue;
                }

                // find which next step actually applies the alternant
                // l->z
                const result = starting?.find(([next, value]) => next === alternant);
                if (result == null || result[1] <= MIN_SCORE) {
                    log(
                        `  alternant is not possible continuation (${previous} -> ${alternant})`,
                    );
                    continue;
                }

                // additionally, after the alternant we must be able to resume the word
                let continued = null;
                if (after != null) {
                    // this is the end

                    const continuations = codaGraph.get(alternant);
                    const continued = continuations?.find(
                        ([next, value]) => next === after,
                    );
                    if (continued == null || continued[1] <= MIN_SCORE) {
                        log(
                            `  alternant could not be continued by next (${alternant} -> ${after})`,
                        );
                        continue;
                    }
                }

                // if it's possible, take the average score (or just the predecessor on the last letter)
                scores.push([
                    continued == null ? result[1] : (result[1] + continued[1]) / 2,
                    realization,
                ]);
            }
        }

        // pick the highest scoring alternant location
        let max: [number, Array<IPA>] = [
            0,
            [],
        ];
        for (const [score, realization] of scores) {
            if (score > max[0]) {
                max = [
                    score,
                    realization,
                ];
            }
        }

        const [bestScore, realization] = max;

        if (bestScore > 0) {
            if (alternatives == null) {
                alternatives = {};
            }
            alternatives[kind] = realization;
        }
    }
    return alternatives;
}

export function generateSyllableAlternatives(
    syllable: Array<IPA>,
    graph: SonorityGraph,
    syllables: Map<IPA, unknown>,
    variations: Set<IPA>,
): AlternativesForSyllable | undefined {
    let alternatives: AlternativesForSyllable | undefined = undefined;

    const calculateRelevantScore = (start: IPA, end: IPA, hint: 0 | 1 | 2) => {
        let graphToUse = graph.parts[hint === 0 ? 0 : 2];

        if (parameters.IPA.vowelRegex.exec(start)) {
            graphToUse = graph.parts[1];
        } else if (parameters.IPA.vowelRegex.exec(end)) {
            graphToUse = graph.parts[0];
        }

        return graphToUse.get(start)?.find(t => t[0] === end)?.[1] || NaN;
    };

    for (const [kind, alternant] of Object.entries(parameters.alternatives.alternants) as Array<
        [AlternativeCategory, IPA]
    >) {
        // one extra spot at the end
        // blulb -> lb -> l b
        //                0 1 2
        // e.g.: try to insert 'z'
        const scores: Array<[number, Array<IPA>]> = [];

        let currentSection: 0 | 1 | 2 = 0;
        for (let spot = 0; spot < syllable.length; spot++) {
            const currentPhoneme = syllable[spot];
            if (parameters.IPA.vowelRegex.exec(currentPhoneme)) {
                if (currentSection === 0) {
                    currentSection = 1;
                }
            } else if (currentSection === 1) {
                currentSection = 2;
            }

            const insertionRealisation = [
                syllable.slice(0, spot + 1),
                alternant,
                syllable.slice(spot + 1),
            ];

            const replacementRealisation = [
                syllable.slice(0, spot),
                alternant,
                syllable.slice(spot + 1),
            ];

            [
                insertionRealisation,
                replacementRealisation,
            ].forEach(realisation => {
                const flattened = realisation.flat();

                const joined = flattened.join('');
                if (!(syllables.has(joined) || variations.has(joined))) {
                    const preScore = calculateRelevantScore(realisation[0].slice(-1)[0], alternant, currentSection);
                    const postScore = calculateRelevantScore(alternant, realisation[2][0], currentSection);

                    if (preScore && preScore > 2 && postScore && postScore > 2) {
                        let insertionScore = 1 / (Math.pow(preScore, -0.5) + Math.pow(postScore, -0.5));

                        if (!isNaN(insertionScore)) {
                            scores.push(
                                [
                                    insertionScore,
                                    flattened,
                                ],
                            );
                        }
                    }
                }
            });
        }

        // pick the highest scoring alternant location
        let max: [number, Array<IPA>] = [
            0,
            [],
        ];
        for (const [score, realization] of scores) {
            if (score > max[0]) {
                max = [
                    score,
                    realization,
                ];
            }
        }

        const [bestScore, realization] = max;

        if (bestScore > 0) {
            if (alternatives == null) {
                alternatives = {};
            }
            alternatives[kind] = realization;
        }
    }

    return alternatives;
}
