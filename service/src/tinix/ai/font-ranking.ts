/** Rank fusion is evidence, not a calibrated probability of the original font. */
export function fuseFontRanks(options: Array<{key:string;score:number}>, ai: string[], detail: string[], confidence: number, quality = 1) {
    const geometry = [...options].sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
    if (!geometry.length) throw Error('Không có ứng viên font');
    const best = geometry[0].score;
    // A noisy/inaccurate crop must not let the pixel metric dominate semantic comparison.
    const geometryWeight = Math.min(best <= .22 ? .65 : best <= .38 ? .5 : .25, quality < .5 ? .15 : quality < .75 ? .35 : .65);
    const reciprocal = (keys:string[],key:string) => {const index=keys.indexOf(key);return index<0?0:1/(index+1)};
    const ranked=geometry.map((c,i)=>({...c,shapeRank:i+1,aiRank:ai.indexOf(c.key)+1||null,detailRank:detail.indexOf(c.key)+1||null,
        combinedScore:geometryWeight/(i+1)+(1-geometryWeight)*(.4*reciprocal(ai,c.key)+.6*reciprocal(detail.length?detail:ai,c.key))
    })).sort((a,b)=>b.combinedScore-a.combinedScore||a.score-b.score);
    const first=ranked[0].key, visualFirst=detail[0]||ai[0];
    const disagreement=first!==visualFirst||first!==geometry[0].key||!!(detail.length&&ai[0]!==detail[0]);
    const gap=ranked.length>1?ranked[0].combinedScore-ranked[1].combinedScore:1;
    const needsReview=disagreement||confidence<.65||best>.38||gap<.08||quality<.75;
    return {ranked,geometryWeight,disagreement,needsReview,canAutoApply:!needsReview};
}
