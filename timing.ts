export const timingSegments = Array(10).fill(0);
export const countSegments = Array(10).fill(0);
let currentSegment = 0;
let currentStartTime = new Date().getTime();
let total = 0;
export const registerTime = (segment?: number) => {
    if (segment !== undefined) {
        currentSegment = segment;

        const elapsedTime = new Date().getTime() - currentStartTime;
        countSegments[currentSegment]++;
        timingSegments[currentSegment] += elapsedTime * 10000;

        total++;
        if (total === 10_000_000) {
            let profileInfo = timingSegments
                .map((e, i) => `\tS${i}: T${e.toFixed(2)} C${countSegments[i]} A${(e / countSegments[i] || 0).toFixed(2)};`)
                .join('\n');

            console.log(`\nTiming info:\n${profileInfo}`);
            total = 0;
        }
    }

    currentStartTime = new Date().getTime();
}