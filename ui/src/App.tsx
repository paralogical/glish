import { useEffect, useState } from "react";
import "./App.css";

import { sampleText } from "./sampleText";

/** english word -> ipa, respelled, previous number of syllables */
type EnglishToGlishMap = Map<string, [ipa: string, glish: string, num: number]>;
/** glish word -> ipa, english, previous number of syllables */
type GlishToEnglishMap = Map<
  string,
  [ipa: string, english: string, num: number]
>;

const knownUnknownWords = new Set(["", "-"]);

type ConvertedText = {
  syllablesRemoved: number;
  totalSyllables: number;
  converted: Array<{
    orig: string;
    mono?: string;
    kind: "unknown" | "alreadyOneSyllable" | "mono" | "whitespace" | "newline";
  }>;
};

enum Direction {
  toGlish,
  toGlishIPA,
  toEnglish,
}

function convert(
  maps: [EnglishToGlishMap, GlishToEnglishMap],
  text: string,
  direction: Direction
): ConvertedText {
  let totalSyllables = 0;
  let syllablesRemoved = 0;
  const converted: ConvertedText["converted"] = text
    .split(/([ \n\t]+)/)
    .map((word) => {
      // extract what looks like an english word from text
      // look for sequence of [a-z] characters, to filter ?!,. etc
      const match = /([^a-zA-Z']*)([a-zA-Z']+)(.*)/.exec(word);
      if (!match) {
        // empty string, only punctuation, non-english text etc
        if (word.includes("\n")) {
          return { orig: word, kind: "newline" as const };
        }
        return { orig: word, kind: "whitespace" as const };
      }
      if (knownUnknownWords.has(word)) {
        return {
          orig: word,
          kind: "alreadyOneSyllable",
        };
      }
      const [, prefix, realword, suffix] = match;
      // monosyllabic dict is keyed by lower case. Output is lowercase IPA anyway,
      // we don't care about input case
      const lowerWord = realword.toLowerCase();
      const found = (
        direction === Direction.toGlish || direction === Direction.toGlishIPA
          ? maps[0]
          : maps[1]
      ).get(lowerWord);
      if (direction === Direction.toEnglish) {
        const foundInEnglish = maps[0].get(lowerWord);
        if (foundInEnglish) {
          // this is already a word in english...
          // let's use the english one instead of the glish one
          return {
            orig: word,
            kind: "alreadyOneSyllable" /* this is a lie, but I'm tool lazy to add a separate kind */,
          };
        }
      }
      if (found) {
        const [ipa, respelled, prevNumSyllables] = found;
        const reconstructed =
          prefix +
          (direction === Direction.toGlishIPA ? ipa : respelled) +
          suffix;
        const isAlreadyOneSyllable = prevNumSyllables === 1;
        totalSyllables += prevNumSyllables;
        syllablesRemoved += prevNumSyllables - 1;
        return {
          orig: word,
          mono: reconstructed,
          kind: isAlreadyOneSyllable ? "alreadyOneSyllable" : "mono",
        };
      }

      return { orig: word, kind: "unknown" as const };
    });
  return {
    totalSyllables,
    syllablesRemoved,
    converted,
  };
}

async function fetchMonosyllabicData(): Promise<
  [EnglishToGlishMap, GlishToEnglishMap]
> {
  const data = await fetch("./monosyllabic.json");
  const json: Array<[string, string, string, number]> = await data.json();
  console.log("got data:", json);
  const toGlish: EnglishToGlishMap = new Map(
    json.map(([english, ...rest]) => [english, rest])
  );
  const reversed = [...json].reverse(); // reverse so the most common word is used
  const toEnglish: GlishToEnglishMap = new Map(
    reversed.map(([english, ipa, glish, num]) => [glish, [ipa, english, num]])
  );

  return [toGlish, toEnglish];
}

const monosyllabicData = fetchMonosyllabicData();

export function App() {
  const [maps, setMonosyllabic] = useState<
    [EnglishToGlishMap, GlishToEnglishMap] | undefined
  >(undefined);
  useEffect(() => {
    monosyllabicData.then(setMonosyllabic);
  }, []);
  if (maps == null) {
    return <div>loading</div>;
  }
  return <Editor maps={maps} />;
}

function Editor({ maps }: { maps: [EnglishToGlishMap, GlishToEnglishMap] }) {
  const [content, setContent] = useState(sampleText);
  const [convertedWords, setConvertedWords] = useState<ConvertedText>({
    converted: [],
    totalSyllables: 0,
    syllablesRemoved: 0,
  });

  const [direction, setDirection] = useState<Direction>(Direction.toGlish);

  const [showCopied, setShowCopied] = useState(false);
  useEffect(() => {
    if (showCopied) {
      const id = setTimeout(() => setShowCopied(false), 4000);
      return () => clearTimeout(id);
    }
  }, [showCopied]);

  useEffect(() => {
    setConvertedWords(convert(maps, content, direction));
  }, [content, direction]);

  return (
    <div
      className={`App ${
        direction === Direction.toGlish || direction === Direction.toGlishIPA
          ? "to-glish"
          : "to-english"
      }`}
    >
      {" "}
      <h1>English</h1>
      <h1 style={{ position: "relative" }}>
        <span className={`glish-arrow`}>&rarr;</span>
        Glish
      </h1>
      <div className="converted-byline">
        <a href="https://youtu.be/sRbcw2sGkJw">Watch the video</a>
        &middot;
        <a href="https://github.com/paralogical/glish">GitHub</a>
        <button
          onClick={() => {
            setDirection(
              direction === Direction.toGlish ||
                direction === Direction.toGlishIPA
                ? Direction.toEnglish
                : Direction.toGlish
            );

            setContent(
              (direction === Direction.toGlishIPA
                ? convert(maps, content, Direction.toGlish)
                : convertedWords
              ).converted
                .map((info) => (info.kind === "mono" ? info.mono : info.orig))
                .join("")
            );
          }}
        >
          Flip Translation
        </button>
      </div>
      <div className="converted-byline">
        <span>
          {convertedWords.syllablesRemoved} syllables{" "}
          {direction === Direction.toGlish || direction === Direction.toGlishIPA
            ? "removed"
            : "added"}{" "}
          (
          {convertedWords.totalSyllables === 0
            ? 0
            : oneSigFig(
                (100 * convertedWords.syllablesRemoved) /
                  convertedWords.totalSyllables
              )}
          %)
        </span>
        <button
          onClick={() => {
            const toCopy = convertedWords.converted
              .map((info) => (info.kind === "mono" ? info.mono : info.orig))
              .join("");
            navigator.clipboard.writeText(toCopy);
            setShowCopied(true);
          }}
        >
          Copy Monosyllabic
        </button>
        {showCopied ? <span>Copied!</span> : null}
      </div>
      <textarea
        value={content}
        className="input"
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="result-container">
        <div className="result">
          {convertedWords.converted.map(({ kind, mono, orig }) => {
            switch (kind) {
              case "mono":
                return (
                  <span className="contain">
                    <span className={`translated ${kind}`}>{mono ?? orig}</span>
                    <span className="orig">{orig}</span>
                  </span>
                );
              case "unknown":
              case "alreadyOneSyllable":
                return <span className={`translated ${kind}`}>{orig}</span>;
              case "whitespace":
                return null;
              case "newline":
                return <span className={`translated ${kind}`}>{orig}</span>;
            }
          })}
        </div>
        {direction === Direction.toGlish ||
        direction === Direction.toGlishIPA ? (
          <button
            onClick={() => {
              setDirection(
                direction === Direction.toGlish
                  ? Direction.toGlishIPA
                  : Direction.toGlish
              );
            }}
          >
            Show {direction === Direction.toGlishIPA ? "respelled" : "IPA"}
          </button>
        ) : null}
      </div>
      <div className="legend">
        {direction === Direction.toGlish ||
        direction === Direction.toGlishIPA ? null : (
          <div className="banner">
            <b>Note:</b> Some Glish words are respelled to match an existing
            English word, which causes the reverse translator to sometimes not
            retranslate to the exact original input.
          </div>
        )}
        <span>
          <span className="translated mono">bold</span> = multi-syllable word
        </span>
        <span>
          <span className="translated oneSyllable">plain</span> = already
          monosyllabic word
        </span>
        <span>
          <span className="translated unknown">red</span> = unknown word
        </span>
      </div>
    </div>
  );
}

function oneSigFig(n: number): string {
  return String(Math.floor(10 * n) / 10);
}
