import { useEffect, useMemo, useState } from "react";
import "./App.css";

import { sampleText } from "./sampleText";

/** english word -> ipa, respelled, previous number of syllables */
type MonosyllabicData = Map<string, [string, string, number]>;

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
function convert(monosyllabic: MonosyllabicData, text: string): ConvertedText {
  if (text === "") {
    return {
      converted: [],
      totalSyllables: 0,
      syllablesRemoved: 0,
    };
  }

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
      const found = monosyllabic.get(lowerWord);
      if (found) {
        const [ipa, respelled, prevNumSyllables] = found;
        const reconstructed = prefix + respelled + suffix;
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

async function fetchMonosyllabicData(): Promise<MonosyllabicData> {
  const data = await fetch("/monosyllabic.json");
  const json = await data.json();
  console.log("got data:", json);
  return new Map(
    (json as Array<[string, string, string, number]>).map<
      [string, [string, string, number]]
    >(([word, ...rest]) => [word, rest])
  );
}

function convertedToStr(converted: ConvertedText["converted"]): string {
	return converted
		.map(({ kind, mono, orig }) => {
			switch (kind) {
				case "mono":
					return mono ?? orig;
				case "unknown":
				case "alreadyOneSyllable":
					return orig;
				case "whitespace":
					return " ";
				case "newline":
					return "\n";
			}
		})
		.join("");
}

const monosyllabicData = fetchMonosyllabicData();

export function App() {
  const [monosyllabic, setMonosyllabic] = useState<
    MonosyllabicData | undefined
  >(undefined);
  useEffect(() => {
    monosyllabicData.then(setMonosyllabic);
  }, []);
  if (monosyllabic == null) {
    return <div>"loading"</div>;
  }
  return <Editor monosyllabic={monosyllabic} />;
}

function Editor({ monosyllabic }: { monosyllabic: MonosyllabicData }) {
  const [content, setContent] = useState(sampleText);

  const trimmedContent = content.trim();
  const convertedWords = useMemo(() => convert(monosyllabic, trimmedContent), [trimmedContent]);

  const [showCopied, setShowCopied] = useState(false);
  useEffect(() => {
    if (showCopied) {
      const id = setTimeout(() => setShowCopied(false), 4000);
      return () => clearTimeout(id);
    }
  }, [showCopied]);

  useEffect(() => {
    // effect to stop speech synthesis on refresh
    const handler = () => window.speechSynthesis?.cancel();

    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  return (
    <div className="App">
      <h1>English</h1>
      <h1 style={{ position: "relative" }}>
        <span className="glish-arrow">&rarr;</span>
        Glish
      </h1>

      <div className="converted-byline">
        <a href="https://www.youtube.com/@paralogical8914">Watch the video</a>
      </div>

      <div className="converted byline">
        <span>
          {convertedWords.syllablesRemoved} syllables removed (
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
            const convertedAsStr = convertedToStr(convertedWords.converted);

            navigator.clipboard.writeText(convertedAsStr);
            setShowCopied(true);
          }}
        >
        <span className="copy-txt">{showCopied ? 'Copied!' : 'Copy Monosyllabic'}</span>
        </button>
        {window.speechSynthesis && (
					<button
						onClick={() => {
              const convertedAsStr = convertedToStr(convertedWords.converted);

							const utterance = new SpeechSynthesisUtterance(convertedAsStr);
							utterance.lang = "en-US";
							utterance.rate = 0.8;

							window.speechSynthesis.speak(utterance);
						}}
					>
						Listen
					</button>
				)}
      </div>

      <textarea
        value={content}
        className="input"
        onChange={(e) => setContent(e.target.value)}
      />

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

      <div className="legend">
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
