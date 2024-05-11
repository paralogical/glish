import { IPA } from './types';

export const parameters = {
    buildSyllables: {
        // many attempts with be repeats; 100 million typically generates ~190,000 syllables
        // which is enough to cover our dictionary
        generationAttempts: 100_000_000,
        wordFrequencyCutoff: 60000,
    },
    buildWords: {
        choiceCutoffThresholds: [
            [0, 8],
            [0.2, 7],
            [0.3, 6],
        ] as [number, number][],
        syllableScoring: {
            perfectMatch: 10,
            similarMatch: 7,
            missing: -4,
            orderPunishmentFraction: 0.4,
        }
    },
    alternatives: {
        alternativeCategories: [
            'past',
            'plural',
            'gerund',
            'actor',
            'participle',
            'superlative',
            'comparative',
            'adverb',

            'un',
            'dis',
            're',
            'in',
            'pre',
            'post',
            'non',
        ],
        alternants: {
            plural: 'z', // bubbles
            gerund: 'ŋ', // bubbling
            past: 'd', // bubbled
            actor: 's', // bubbler
            participle: 'n', // eaten
            comparative: 'ɹ', // bubblier
            superlative: 't', // bubbliest
            adverb: 'l', // bubblily

            // prefixes
            un: 'ə',
            dis: 'ɪ',
            re: 'i',
            in: 'm',
            pre: 'p',
            post: 'ʊ',
            non: 'o'
        },
        alternantMatchers: {
            un: ['un*'],
            dis: ['dis*'],
            re: ['re*'],
            in: ['in*'],
            pre: ['pre*'],
            post: ['post*'],
            non: ['non*'],
            past: [
                'ed',
                'de',
            ],
            plural: [
                's',
                'es',
            ],
            gerund: ['ing', '*ing'],
            actor: [
                'or',
                'er',
                '^^ress',
            ],
            participle: ['en'],
            superlative: [
                'est',
                '^iest',
                'iest',
            ],
            comparative: [
                'er',
                '^ier',
                'ier',
            ],
            adverb: [
                'ly',
                'lily',
                '^ily',
            ],
        },
    },
    filePaths: {
        wordFrequencyList: './inputs/word_frequency.txt',
        syllabilizedIPA: 'outputs/syllablizedIPA.json',
        pronunciationList: 'inputs/cmudict.0.6-syl.txt',
        graphViz: 'ui/public/syllableGraphDisplayData.json',
        randomGeneratedSyllables: 'outputs/random_generated_syllables.json',
        randomWithVariations: 'outputs/random_generated_syllables_with_variations.json',
        duplicates: 'outputs/duplicates.json',
        monosyllabicOutput: 'outputs/monosyllabic.json',
        uiResultsOutput: 'ui/public/monosyllabic.json',
    },
    IPA: {
        vowelRegex: /(ʌ|æ|u|ɔ|ɪ|ɑ|aɪ|i|oʊ|aʊ|eɪ|ɝ|ɨ|ɚ|ɛ|ʊ|ɔɪ|ʉ)/,
        vowels: new Set<IPA>([
            'a',
            'ɑ', // ɑ or ɒ
            'æ',
            'ʌ',
            'ɔ',
            'aʊ',
            'ɚ', // ɚ
            'ə',
            'aɪ',
            'ɛ',
            'ɝ', // ɝ
            'eɪ',
            'ɪ',
            'ɨ',
            'i',
            'oʊ',
            'ɔɪ',
            'ʊ',
            'u',
            'ʉ',
        ]),
        phonemeSimilarityGroups: [
            ['b', 'p'],
            ['k', 'g', 'ɡ'],
            ['ɡ', 'g', 'ŋ'],
            ['n', 'ŋ'],
            ['m', 'n', 'm̩', 'n̩'],
            ['tʃ', 'ʃ', 's'],
            ['ð', 'v', 'z', 'θ'],
            ['l', 'ɹ', 'ɾ', 'ɾ̃', 'r'],
            ['v', 'w', 'ʍ'],
            ['dʒ', 'ʒ', 'j'],
            ['h', 'ʔ'],
            ['a', 'ɑ', 'æ', 'ɔ', 'eɪ'], // grouping of ɔ depends on cot-caught merger status; will assume NE American here
            ['ʌ', 'aʊ'],
            ['ɚ', 'ɝ'],
            ['oʊ', 'ɔɪ', 'ʊ'],
            ['ɪ', 'i'],
            ['ɛ', 'e', 'ə'],
            ['u', 'ʉ']
        ] as IPA[][],
        consonantsOrExtra: new Set<IPA>([
            'b',
            'tʃ',
            'd',
            'ð',
            'ɾ',
            'l̩',
            'm̩',
            'n̩',
            'f',
            'ɡ',
            'h',
            'dʒ',
            'k',
            'l',
            'm',
            'n',
            'ŋ',
            'ɾ̃',
            'p',
            'ʔ',
            'ɹ',
            's',
            'ʃ',
            't',
            'θ',
            'v',
            'w',
            'ʍ',
            'j',
            'z',
            'ʒ',
        ]),
        APRABET_TO_IPA: {
            AA: 'ɑ', // ɑ or ɒ
            AE: 'æ',
            AH: 'ʌ',
            AO: 'ɔ',
            AW: 'aʊ',
            AX: 'ɚ', // ɚ
            AXR: 'ə',
            AY: 'aɪ',
            EH: 'ɛ',
            ER: 'ɝ', // ɝ
            EY: 'eɪ',
            IH: 'ɪ',
            IX: 'ɨ',
            IY: 'i',
            OW: 'oʊ',
            OY: 'ɔɪ',
            UH: 'ʊ',
            UW: 'u',
            UX: 'ʉ',
            //
            B: 'b',
            CH: 'tʃ',
            D: 'd',
            DH: 'ð',
            DX: 'ɾ',
            EL: 'l̩',
            EM: 'm̩',
            EN: 'n̩',
            F: 'f',
            G: 'ɡ',
            HH: 'h',
            H: 'h',
            JH: 'dʒ',
            K: 'k',
            L: 'l',
            M: 'm',
            N: 'n',
            NG: 'ŋ',
            NX: 'ɾ̃',
            P: 'p',
            Q: 'ʔ',
            R: 'ɹ',
            S: 's',
            SH: 'ʃ',
            T: 't',
            TH: 'θ',
            V: 'v',
            W: 'w',
            WH: 'ʍ',
            Y: 'j',
            Z: 'z',
            ZH: 'ʒ',
        } as { [key: string]: IPA },
        // based on wikipedia's pronunciation respelling key
        // with adjustments
        // https://en.wikipedia.org/wiki/Help:Pronunciation_respelling_key
        // Not all rules are followed since this focuses on monosyllabic words,
        // for example checked vowels.
        respellKey: [
            [
                'ire',
                'aɪər',
            ],
            [
                'oir',
                'ɔɪər',
            ],
            [
                'our',
                'aʊər',
            ],
            [
                'eer',
                'ɪər',
            ],
            [
                'air',
                'ɛər',
            ],
            [
                'ure',
                'jʊər',
            ],
            [
                'ur',
                'ɜːr',
            ],
            [
                'ew',
                'juː',
            ],
            [
                'eye',
                'aɪ',
            ],
            [
                'err',
                'ɛr',
            ],
            [
                'irr',
                'ɪr',
            ],
            [
                'urr',
                'ʌr',
            ],
            [
                'uurr',
                'ʊr',
            ],
            [
                'uhr',
                'ər',
            ],
            [
                'oor',
                'ʊər',
            ],
            [
                'or',
                'ɔːr',
            ],
            [
                'orr',
                'ɒr',
            ],
            [
                'oh',
                'oʊ',
            ],
            [
                'oo',
                'uː',
            ],
            [
                'ar',
                'ɑːr',
            ],
            [
                'arr',
                'ær',
            ],
            [
                'y',
                'aɪ',
            ],
            [
                'ay',
                'eɪ',
            ],
            [
                'ee',
                'iː',
            ],
            [
                'aw',
                'ɔː',
            ],
            [
                'ow',
                'aʊ',
            ],
            [
                'oy',
                'ɔɪ',
            ],
            [
                'ah',
                'ɑː',
            ],
            [
                'ah',
                'ɑ',
            ],
            [
                'ee',
                'i',
            ],
            [
                'oo',
                'u',
            ],
            [
                'aw',
                'ɔ',
            ],
            //   ["ə", "ə"],
            //   ["ər", "ər"],
            [
                'uh',
                'ə',
            ], // use `uh` instead of ə
            //
            [
                'a',
                'æ',
            ],
            [
                'o',
                'ɒ',
            ],
            [
                'uu',
                'ʊ',
            ],
            //
            [
                'i',
                'ɪ',
            ],
            [
                'u',
                'ʌ',
            ],
            [
                'e',
                'ɛ',
            ],
            //   ["ih", "ɪ$"], // ɪ at the end of a syllable is 'ih' not 'i'
            //   ["uh", "ʌ$"], // ʌ at the end of a syllable is 'uh' not 'u'
            //   ["eh", "ɛ$"], // ɛ at the end of a syllable is 'eh' not 'e'
            //
            [
                'j',
                'dʒ',
            ],
            [
                'nk',
                'ŋk',
            ],
            [
                'wh',
                'hw',
            ],
            [
                'b',
                'b',
            ],
            [
                'ch',
                'tʃ',
            ],
            [
                'd',
                'd',
            ],
            [
                'dh',
                'ð',
            ],
            [
                'f',
                'f',
            ],
            [
                'g',
                'ɡ',
            ],
            //   ["gh", "ɡ"], //  IGNORED: /ɡ/ may be respelled gh instead of g when otherwise it may be misinterpreted
            // as /dʒ/. ["tch", "tʃ"], // IGNORED: /tʃ/ after a vowel in the same syllable is respelled tch instead of
            // ch to better distinguish it from /k, x/.
            [
                'h',
                'h',
            ],
            [
                'k',
                'k',
            ],
            [
                'kh',
                'x',
            ],
            [
                'l',
                'l',
            ],
            [
                'l',
                'ɫ',
            ],
            [
                'm',
                'm',
            ],
            [
                'n',
                'n',
            ],
            [
                'ng',
                'ŋ',
            ],
            [
                'p',
                'p',
            ],
            [
                'r',
                'ɹ',
            ],
            [
                'r',
                'r',
            ],
            [
                's',
                's',
            ],
            //   ["ss", "s"], // /s/ may be respelled ss instead of s when otherwise it may be misinterpreted as /z/:
            // "ice" EYESS, "tense" TENSS (compare eyes, tens).
            [
                'sh',
                'ʃ',
            ],
            [
                't',
                't',
            ],
            [
                'th',
                'θ',
            ],
            [
                'v',
                'v',
            ],
            [
                'w',
                'w',
            ],
            [
                'y',
                'j',
            ],
            [
                'z',
                'z',
            ],
            [
                'zh',
                'ʒ',
            ],
        ] as [string, IPA][],
        // If these IPA symbols are the end of a syllable, they add 'h'
        specialEnders: [
            [
                'ih',
                'ɪ',
            ], // ɪ at the end of a syllable is 'ih' not 'i'
            [
                'uh',
                'ʌ',
            ], // ʌ at the end of a syllable is 'uh' not 'u'
            [
                'eh',
                'ɛ',
            ], // ɛ at the end of a syllable is 'eh' not 'e'
        ] as [string, IPA][],
    },
} as const;