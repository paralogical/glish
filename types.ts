import { parameters } from './parameters';

export type IPA = string;
export type VariantHash = string; // e.g. 0000010

/**
 * Frequency ordered words ->  syllable arrays
 * very -> [ [v, ɛ], [ɹ, i] ]
 * */
export type SyllablizedIPA = Array<[string, Array<Array<IPA>>]>;
export type AlternativeCategory = typeof parameters.alternatives.alternativeCategories[number];
export type AlternativesForSyllable = {
    [key in AlternativeCategory]?: Array<IPA>;
};
export type RandomSyllableInfo = {
    syllable: Array<IPA>;
    variations?: AlternativesForSyllable;
};
export type AssignMethod =
    | 'direct'
    | 'variant'
    | 'singleSyllableVariant'
    | 'graph'
    | 'graphOrdered'
    | 'graphRemoved'
    | 'choice'
    | 'random'
    | 'failed'
    | 'alreadyOneSyllable';