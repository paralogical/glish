<script lang="ts">
  import { monosyllabic } from "./monosyllabic.js";

  import * as mySampleText from "./sampleText";

  //   let text = "Hello, world! Multiple things are happening to me...";
  //   let text = `According to all known laws
  // of aviation,
  // there is no way a bee
  // should be able to fly.
  // Its wings are too small to get
  // its fat little body off the ground.
  // The bee, of course, flies anyway
  // because bees don't care
  // what humans think is impossible.`;
  //   let text = "hello world";
  let text = mySampleText.sampleText as string;

  $: convertedWords = text.split(/[ \n\t]/).map((word) => {
    // extract what looks like an english word from text
    // look for sequence of [a-z] characters, to filter ?!,. etc
    const match = /([^a-zA-Z']*)([a-zA-Z']+)(.*)/.exec(word);
    if (!match) {
      // empty string, only punctuation, non-english text etc
      return { orig: word, kind: "unknown" as const };
    }
    const [, prefix, realword, suffix] = match;
    // monosyllabic dict is keyed by lower case. Output is lowercase IPA anyway,
    // we don't care about input case
    const lowerWord = realword.toLowerCase();
    const found = monosyllabic.get(lowerWord);
    if (found) {
      const reconstructed = prefix + found.respelled_mono + suffix;
      const isAlreadyOneSyllable = !found.multiSyllable;
      return {
        orig: word,
        mono: reconstructed,
        kind: isAlreadyOneSyllable ? "oneSyllable" : "mono",
      };
    }
    return { orig: word, kind: "unknown" as const };
  });
</script>

<div class="root leftright">
  <div>
    <h1>Input</h1>
    <textarea bind:value={text} class="input" />
  </div>
  <div>
    <span class="header">
      <h1>Monosyllabic result</h1>
      <div class="legend">
        <span
          ><span class="translated mono">bold</span>=multi-syllable word</span
        >
        <span
          ><span class="translated oneSyllable">plain</span>=already
          mono-syllable word</span
        >
        <span><span class="translated unknown">red</span>=unknown word</span>
      </div>
    </span>
    <div class="result">
      {#each convertedWords as { orig, mono, kind }}
        <span class="contain">
          <span class={`translated ${kind}`}>{mono ?? orig}</span>
          <span class="orig">{orig}</span>
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  }

  .legend {
    margin: 20px;
    display: flex;
    flex-direction: column;
  }
  .header {
    display: flex;
    justify-content: space-between;
  }

  .input {
    width: 500px;
    height: 300px;
  }
  .result {
    white-space: pre-wrap;
    display: flex;
    flex-direction: row;
    gap: 1ch;
    flex-wrap: wrap;
  }
  .input,
  .result {
    font-size: 16pt;
  }

  .contain {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .translated.mono {
    opacity: 1;
    font-weight: bold;
  }
  .translated.oneSyllable {
    opacity: 0.9;
  }
  .translated.unknown {
    opacity: 0.5;
    color: red;
  }
  .orig {
    opacity: 0.8;
    font-size: 80%;
  }

  .leftright {
    margin: 10px;
    display: flex;
    width: 100%;
    gap: 20px;
  }
  .leftright div {
    max-width: calc(100% - 50px);
  }
</style>
