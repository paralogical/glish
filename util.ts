export function pad(s: string, l: number): string {
    return (s + ' '.repeat(l)).slice(0, l);
}

export function oneSigFig(n: number): string {
    return String(Math.floor(10 * n) / 10);
}

export function progress(done: number, outof: number, extraInfo: string) {
    const width = 20;
    const pct = done / outof;
    const FILLED_CHAR = '█';
    const EMPTY_CHAR = ' ';
    const SUBPIXEL_CHARS = '▏▎▍▌▋▊▉█';
    let progressBar = '';
    progressBar += '▐'; // start

    const fillTill = Math.floor(pct * width);
    let filled = 0;

    // filled part
    progressBar += FILLED_CHAR.repeat(fillTill);
    filled += fillTill;

    // subpixel part
    if (fillTill != width) {
        const subpixelFillLevel = pct * width - Math.floor(pct * width);
        const subpixelIndex = Math.floor(subpixelFillLevel * SUBPIXEL_CHARS.length);
        progressBar += SUBPIXEL_CHARS[subpixelIndex];

        filled += 1;
    }

    // unfilled part
    progressBar += EMPTY_CHAR.repeat(width - filled);

    progressBar += '▌ '; // end
    process.stdout.write(progressBar + extraInfo + '\r');
}
