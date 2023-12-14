# Monosyllabic

**Goal: Make a version of English where every word is only one syllable**

Inputs:

- words by frequency (optimize monosyllabification for more common words)
  inputs/word_frequency.txt
- words split into syllables (only source of syllables is on regular words, not IPA)
  inputs/Syllables.txt
- words with IPA pronunciations (monosyllabification based on pronunciation)
  Note: multiple valid pronunciations for any given word
  inputs/pronunciations.json

Stages:

1. take inputs, produce words split into IPA syllables order by frequency
   business 74th most used word
   business = busi-ness syllabification
   business = bɪznɪs
   output bɪz|nɪs
   writes to outputs/syllabilizedIPA.json
2. Evaluate syllabification
3. Take syllablized IPA and use multiple strategies to generate monosyllabic form
   one-syllable words stay the same
4. Evaluate monosyllabic values 1-5.
   Remember evaluations to converge on good test cases
5. Small UI to translate text into monosyllabized
