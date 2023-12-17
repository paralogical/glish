import { promises as fs } from 'fs';
import * as util from 'util';
import { parameters } from './parameters';
import { registerTime } from './timing';

import { IPA, SyllablizedIPA } from './types';
import { progress } from './util';

/**
 * A graph with three connected subgraphs, corresponding to the parts of a syllable.
 * letters in the onset correspond to consants before the vowel.
 * letters in the vowel part are vowels (aka nucleus)
 * letters in the coda are consonants after the vowel
 * frost ->
 * "fr     o      st"
 *  onset  vowel  coda
 *
 * Within each part, letters may have edges pointing to each other in that part, or to
 * a letter in the next part.
 * Letters may never point backward to previous parts (e.g. vowels cannot point into the onset)
 * There will be duplicate letters in the onset and the coda, because they
 * represent different parts of the syllable.
 */
export type SonorityGraph = {
    // onset, nucleus, coda
    parts: [SonorityGraphPart, SonorityGraphPart, SonorityGraphPart];
};

const STOP = null;
const START = null;
/** letter -> [nextLetter | STOP, count]
 * note: letter may not be in this graph part. if not, look at next graph part.
 * null as next letter means stop
 * null as letter (key in map) means start. (only for onset)
 * null -> [null, count] means how often this graph part is skipped (no onset)
 */
export type SonorityGraphPart = Map<
    IPA | typeof START,
    Array<[IPA | typeof STOP, number]>
>;

// onset -> pre-vowel consonants
// nucleus -> vowel (or syllabic consonants like m in rhythm)
// coda -> post-vowel consonants

export function createSonorityGraph(
    syllablizedPronuncations: Array<[string, Array<Array<IPA>>]>,
): SonorityGraph {
    const graph: SonorityGraph = {
        parts: [
            new Map(),
            new Map(),
            new Map(),
        ],
    };

    let i = 0;
    for (const [word, syllables] of syllablizedPronuncations) {
        progress(i, syllablizedPronuncations.length, '');
        i += 1;
        for (const syllable of syllables) {
            const [onsetPart, nucleusPart, codaPart] = splitIntoChunks(syllable);
            updateGraphPart('onset', graph.parts[0], onsetPart, nucleusPart?.[0]);
            updateGraphPart('nucleus', graph.parts[1], nucleusPart, codaPart?.[0]);
            updateGraphPart('coda', graph.parts[2], codaPart, STOP);
        }
    }

    return graph;
}

const sonorityGraphFile = 'outputs/syllableGraph.json';

/**
 * Create sonority graph or load cached from disk
 */
export async function loadSonorityGraph(
    syllabilizedIpa: SyllablizedIPA,
): Promise<SonorityGraph> {
    try {
        const ipa = await fs.readFile(sonorityGraphFile, 'utf8');
        type ObjectGraphPart = { [key: string]: Array<[string, number]> };
        const result = JSON.parse(ipa) as {
            onset: ObjectGraphPart;
            vowel: ObjectGraphPart;
            coda: ObjectGraphPart;
        };
        const graph = {
            parts: [
                result.onset,
                result.vowel,
                result.coda,
            ].map(
                (part): SonorityGraphPart =>
                    new Map(
                        Object.entries(part)
                              .map(([k, v]) => [
                                  k === 'null' ? null : k,
                                  v,
                              ]),
                    ) as SonorityGraphPart,
            ),
        } as SonorityGraph;
        console.log('Loaded cached sonority graph');
        return graph;
    } catch (err) {
        return generateSonorityGraph(syllabilizedIpa);
    }
}

async function generateSonorityGraph(
    syllabilizedIpa: SyllablizedIPA,
): Promise<SonorityGraph> {
    console.log('creating sonority graph');
    const graph = createSonorityGraph(syllabilizedIpa);
    console.log();

    const stringGraphPart = (part: SonorityGraphPart) => {
        return Object.fromEntries(
            [...part.entries()].map(([k, v]) => [
                k == undefined ? null : k,
                v,
            ]),
        );
    };
    await fs.writeFile(
        sonorityGraphFile,
        JSON.stringify(
            {
                onset: stringGraphPart(graph.parts[0]),
                vowel: stringGraphPart(graph.parts[1]),
                coda: stringGraphPart(graph.parts[2]),
            },
            undefined,
            2,
        ),
    );
    console.log('wrote syllable graph');
    return graph;
}

// Given an input syllable, go through letters and update graph part
function updateGraphPart(
    which: 'onset' | 'nucleus' | 'coda',
    graphPart: SonorityGraphPart,
    letters: Array<IPA>,
    // first phone of next part
    nextPart: IPA | null,
) {
    // initial part of graph
    if (which === 'onset') {
        incGraphPart(graphPart, null, letters?.[0] ?? nextPart);
    }
    if (letters == null) {
        return;
    }

    let letter: IPA | null = letters[0] ?? null;
    for (const next of [
        ...letters.slice(1),
        nextPart,
    ]) {
        incGraphPart(graphPart, letter, next);
        letter = next;
    }
}

function incGraphPart(
    graphPart: SonorityGraphPart,
    letter: IPA | null,
    next: IPA | null,
) {
    const existing = graphPart.get(letter);
    if (existing) {
        const existingNext = existing.find((e) => e[0] === next);
        let updated: Array<[IPA | null, number]>;
        if (existingNext) {
            existingNext[1] += 1;
        } else {
            updated = [
                ...existing,
                [
                    next,
                    1,
                ],
            ];
            graphPart.set(letter, updated);
        }
    } else {
        graphPart.set(
            letter,
            [
                [
                    next,
                    1,
                ],
            ],
        );
    }
}

export function printGraph(graph: SonorityGraph) {
    let next = 1;
    const assignedIds: { [key: string]: number } = {};
    const getIdForNode = (nodeName: string): number => {
        if (assignedIds[nodeName] == null) {
            assignedIds[nodeName] = next++;
        }
        return assignedIds[nodeName];
    };

    const nodes: Array<{ id: number; label: string; group: number }> = [];
    const edges: Array<{ from: number; to: number; value: number }> = [];

    const nodeName = (letter: string | null, atOrAfter: number) => {
        let pref;
        if (atOrAfter === 0 && graph.parts[0].has(letter)) {
            pref = 'onset';
        } else if (atOrAfter <= 1 && graph.parts[1].has(letter)) {
            pref = 'vowel';
        } else if (atOrAfter > 0 && graph.parts[2].has(letter)) {
            pref = 'coda';
        }
        if (letter == null) {
            return 'end';
        }

        return `${pref}_${letter}`;
    };

    const starts = graph.parts[0].get(null);
    edges.push(
        ...starts!.map(([letter, value]) => ({
            from: getIdForNode('st'),
            to: getIdForNode(nodeName(letter, 0)),
            value: value,
        })),
    );
    let i = 0;
    for (const part of graph.parts) {
        edges.push(
            ...[...part.entries()]
                .filter(([letter]) => letter != null)
                .map(([letter, nexts]) =>
                    nexts.map(([next, value]) => ({
                        from: getIdForNode(nodeName(letter, i)),
                        to: getIdForNode(nodeName(next, i)),
                        value: value,
                    })),
                )
                .flat(),
        );
        i += 1;
    }

    nodes.push({
        id: getIdForNode('st'),
        label: 'Start',
        group: 1,
    });
    nodes.push({
        id: getIdForNode('end'),
        label: 'End',
        group: 5,
    });

    nodes.push(
        ...graph.parts
                .map((part, i) =>
                    [...part.keys()]
                        .filter((letter) => letter != null)
                        .map((letter) => ({
                            id: getIdForNode(`${[
                                'onset',
                                'vowel',
                                'coda',
                            ][i]}_${letter}`),
                            label: letter ?? 'null',
                            group: i + 1,
                        })),
                )
                .flat(),
    );

    return JSON.stringify({
        nodes,
        edges,
    }, undefined, 2);
}

function randomChoice<T>(a: Array<T>): T {
    return a[Math.floor(Math.random() * a.length)];
}

function weightedRandomChoice<T>(a: Array<[T, number]>): T {
    let i;
    let weights: Array<number> = [];

    for (i = 0; i < a.length; i++) {
        weights[i] = a[i][1] + (weights[i - 1] || 0);
    }

    let random = Math.random() * weights[weights.length - 1];

    for (i = 0; i < weights.length; i++) {
        if (weights[i] > random) break;
    }

    return a[i][0];
}

export function getRandomSyllable(graph: SonorityGraph): Array<IPA> {
    let word = [];
    let next = weightedRandomChoice(graph.parts[0].get(null)!);

    // track how often we use each phone, so we don't keep repeating ststststststs
    let phoneCounts = new Map<IPA, number>();

    let currentPart = 0;
    while (next && currentPart < 3) {
        const existing = phoneCounts.get(next);
        phoneCounts.set(next, existing ? existing + 1 : 1);

        word.push(next);

        let graphPart;
        if (graph.parts[currentPart].has(next)) {
            graphPart = graph.parts[currentPart];
        } else {
            currentPart++;
            phoneCounts = new Map(); // reset so we only count within a syllable part
            graphPart = graph.parts[currentPart];
        }
        next = weightedRandomChoice(
            graphPart.get(next)!.filter(([p]) => {
                if (p == null) {
                    return true;
                }
                const count = phoneCounts.get(p) ?? 0;
                // allow the same letter up to twice, so asks is ok but iststs is not
                return count < 2;
            }),
        );
    }

    return word;
}

export function getRandomSyllableFromPalette(
    graph: SonorityGraph,
    palette: Array<IPA>,
    forceOrder: boolean = false,
    useOnceOnly: boolean = false,
): Array<IPA> | null {
    let word: IPA[] = [];
    const randomTilLegal = (from: Array<[IPA | null, number]>) => {
        let filteredFrom = from.filter(
            ([l, f]) => (l === null || palette.includes(l!)) && f > 2,
        );

        if (forceOrder) {
            filteredFrom = filteredFrom.map(([l, f]) => l === null ?
                [
                    null,
                    1,
                ] :
                [
                    l,
                    f * Math.pow(palette.indexOf(l) + 1, -0.2),
                ]);
        }

        if (filteredFrom.length === 0) {
            return null;
        }

        return weightedRandomChoice(filteredFrom);
    };

    let next = randomTilLegal(graph.parts[0].get(null)!);
    if (next == null) {
        return null;
    }

    let currentPart = 0;
    while (next && currentPart < 3) {
        word.push(next);

        if (useOnceOnly) {
            palette.splice(palette.indexOf(next), 1);
        } else if (forceOrder) {
            palette.splice(0, palette.indexOf(next) + 1);
        }

        let graphPart;
        if (graph.parts[currentPart].has(next)) {
            graphPart = graph.parts[currentPart];
        } else {
            currentPart++;
            graphPart = graph.parts[currentPart];
        }

        next = randomTilLegal(graphPart.get(next)!);
    }

    if (word.length < 2) {
        return null;
    }

    return word;
}

function splitIntoChunks(
    syllable: Array<IPA>,
): [Array<IPA>, Array<IPA>, Array<IPA>] {
    let onset = [];
    let vowel = [];
    let coda = [];
    let state: 'onset' | 'vowel' | 'coda' = 'onset';
    for (const p of syllable) {
        if (state == 'onset') {
            if (parameters.IPA.consonantsOrExtra.has(p)) {
                onset.push(p);
            } else if (parameters.IPA.vowels.has(p)) {
                vowel.push(p);
                state = 'vowel';

            } else {
                // no vowel at all...
                return [
                    [],
                    [],
                    [],
                ];
            }
        } else if ((state = 'vowel')) {
            // actually, we don't expect multiple vowels in the same syllable...
            // but might as well tolerate it in case of bad data.
            if (parameters.IPA.vowels.has(p)) {
                vowel.push(p);
            } else {
                coda.push(p);
                state = 'coda';
            }
        } else if ((state = 'coda')) {
            if (parameters.IPA.consonantsOrExtra.has(p)) {
                coda.push(p);
            } else {
                // vowels again in coda...
                return [
                    [],
                    [],
                    [],
                ];
            }
        }
    }
    return [
        onset,
        vowel,
        coda,
    ];
}

// Tests
if (require.main === module) {
    const graph = createSonorityGraph([
        [
            'cat',
            [
                [
                    'c',
                    'a',
                    't',
                ],
            ],
        ],
        [
            'hat',
            [
                [
                    'h',
                    'a',
                    't',
                ],
            ],
        ],
        [
            'at',
            [
                [
                    'a',
                    't',
                ],
            ],
        ],
        [
            'ant',
            [
                [
                    'a',
                    'n',
                    't',
                ],
            ],
        ],
        [
            'it',
            [
                [
                    'i',
                    't',
                ],
            ],
        ],
        [
            'hut',
            [
                [
                    'h',
                    'u',
                    't',
                ],
            ],
        ],
        [
            'but',
            [
                [
                    'b',
                    'u',
                    't',
                ],
            ],
        ],
        [
            'booth',
            [
                [
                    'b',
                    'oʊ',
                    'θ',
                ],
            ],
        ],
        [
            'boo',
            [
                [
                    'b',
                    'oʊ',
                ],
            ],
        ],
        [
            'truth',
            [
                [
                    't',
                    'r',
                    'u',
                    'θ',
                ],
            ],
        ],
        [
            'bun',
            [
                [
                    'b',
                    'u',
                    'n',
                ],
            ],
        ],
        [
            'bund',
            [
                [
                    'b',
                    'u',
                    'n',
                    'd',
                ],
            ],
        ],
        [
            'bundt',
            [
                [
                    'b',
                    'u',
                    'n',
                    'd',
                    't',
                ],
            ],
        ],
        [
            'bring',
            [
                [
                    'b',
                    'r',
                    'i',
                    'n',
                    'g',
                ],
            ],
        ],
        [
            'thing',
            [
                [
                    't',
                    'h',
                    'i',
                    'n',
                    'g',
                ],
            ],
        ],
        [
            'shin',
            [
                [
                    's',
                    'h',
                    'i',
                    'n',
                ],
            ],
        ],
        [
            'sing',
            [
                [
                    's',
                    'i',
                    'n',
                    'g',
                ],
            ],
        ],
        [
            'wing',
            [
                [
                    'w',
                    'i',
                    'n',
                    'g',
                ],
            ],
        ],
        [
            'win',
            [
                [
                    'w',
                    'i',
                    'n',
                ],
            ],
        ],
        [
            'singing',
            [
                [
                    's',
                    'i',
                    'n',
                    'g',
                ],
                [
                    'i',
                    'n',
                    'g',
                ],
            ],
        ],
    ]);

    console.log('graph:', util.inspect(graph, undefined, 8));
    console.log(printGraph(graph));

    for (var i = 0; i < 10; i++) {
        console.log('random syllable: ', getRandomSyllable(graph).join(''));
    }

    for (var i = 0; i < 3; i++) {
        const palette = [
            'b',
            'u',
            'n',
            'i',
            'd',
            't',
            'a',
            's',
            'w',
        ];
        console.log(
            'random syllable in palette: ',
            palette.join(''),
            getRandomSyllableFromPalette(graph, palette)?.join(''),
        );
    }
}
