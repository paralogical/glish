import { promises as fs } from "fs";
import readline from "readline";

// Evaluate.ts -- given a monosyllabification,
// present words to be rated 1-5 stars.
// If a monosyllabized word has already been rated, keep its rating and don't ask
// if  monosyllabized word has already been rated but the monosyllabification has changed,
// do a new evaluation but keep both copies.
// Save evaluation to disk

// map of word -> array of monosyllabification + rating 1-5 stars
type Evalutations = {
  [key: string]: { [key: string]: 1 | 2 | 3 | 4 | 5 };
};

async function evaluate() {
  // read monosyllabifications
  const monosyllabification = require("./outputs/monosyllabic_only_modified_words.json");
  const wordMonoPairs: Array<[string, string]> =
    Object.entries(monosyllabification);
  console.log("monosylabic", wordMonoPairs.slice(0, 10));

  // read previous evaluations
  const evaluationsPath = "./outputs/evaluations.json";
  const evaluationsBackupPath = "./outputs/evaluations.backup.json";
  try {
    await fs.stat(evaluationsPath);
  } catch (err) {
    throw new Error(
      `${evaluationsPath} does not exist! Did the last run fail? try recovering from ${evaluationsBackupPath}`
    );
  }
  const evaluations: Evalutations = JSON.parse(
    await fs.readFile(evaluationsPath, "utf-8")
  );
  console.log("previous evaluations", evaluations);

  // ask user about each word in a loop until they're done
  // update evaluation map as you go

  for (const [word, mono] of wordMonoPairs) {
    if (evaluations[word] == null) {
      // this word has not been evaluated yet
    } else if (Object.keys(evaluations[word]).includes(mono)) {
      // this exact monosyllabification has been evaluated before,
      // no need to ask again
      continue;
    } else if (evaluations[word].length > 0) {
      // this word has previous evaluations, but the word has changed
      console.log("%s was evaluated previously, but it has changed", word);
    }

    console.log("%s => %s?", word, mono);
    const result = await ask("Enter rating 1-5. q or empty to quit > ");
    if (!result || result === "q") {
      break;
    }

    const existing = evaluations[word] ?? {};
    evaluations[word] = { ...existing, [mono]: result as 1 | 2 | 3 | 4 | 5 };
  }

  // make backup of past evaluations
  await fs.rename(evaluationsPath, evaluationsBackupPath);

  // when done, write evaluations back to disk
  await fs.writeFile(
    evaluationsPath,
    JSON.stringify(evaluations, undefined, 2)
  );

  // remove backup of last session, only if we didn't throw by now
  await fs.rm(evaluationsBackupPath);
}

evaluate().catch(console.error);

function ask(query: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}
