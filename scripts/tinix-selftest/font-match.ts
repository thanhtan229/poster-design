import {extractText} from '../../service/src/tinix/ai/font-extract';
import assert from 'node:assert/strict';
import { cropBox, shortlistFonts, validateVisualRanking } from '../../service/src/tinix/ai/font-match';
import { fontShape, shapeDistance } from '../../service/src/tinix/ai/font-shape';
import { fuseFontRanks } from '../../service/src/tinix/ai/font-ranking';
const rankPool=[{key:'C1',score:.05},{key:'C2',score:.2},{key:'C3',score:.3}];
const conflicting=fuseFontRanks(rankPool,['C2','C3','C1'],['C2','C1','C3'],.99);
assert.equal(conflicting.ranked[0].key,'C1','Strong shape evidence survives AI ranking');
assert.equal(conflicting.canAutoApply,false,'AI confidence cannot override conflicting evidence');
assert.equal(conflicting.needsReview,true);
assert.equal(fuseFontRanks(rankPool,['C1'],['C1'],.9,.3).canAutoApply,false);
assert.equal(fuseFontRanks(rankPool,['C1'],['C1'],.9,.3).geometryWeight,.15);
assert.equal(fuseFontRanks(rankPool,['C1','C2'],['C1','C2'],.9).canAutoApply,true);
assert.equal(fuseFontRanks(rankPool,['C1','C2'],['C1','C2'],.3).canAutoApply,false);
assert.equal(fuseFontRanks([{key:'C1',score:.6},{key:'C2',score:.61}],['C1','C2'],['C1','C2'],.99).canAutoApply,false,'Poor crop requires review even on agreement');
assert.throws(()=>fuseFontRanks([],[],[],.9));
console.log('PASS rank fusion, disagreement/low-confidence/poor-fit review gates');
assert.deepEqual(cropBox({ x: .9, y: .9, w: .5, h: .5 }, 100, 200), { left: 90, top: 180, width: 10, height: 20 });
assert.throws(() => cropBox({ x: 0, y: 0, w: 0, h: .5 }, 100, 100));
assert.throws(() => cropBox({ x: 'nan', y: 0, w: 1, h: 1 }, 100, 100));
assert.throws(() => validateVisualRanking({ ranking: ['unknown'] }, ['C1']));
assert.throws(() => validateVisualRanking({ ranking: ['C1', 'C1'] }, ['C1']));
assert.deepEqual(validateVisualRanking({ ranking: ['C2', 'C1'], confidence: 5, reason: 'ok' }, ['C1', 'C2']), { ranking: ['C2', 'C1'], confidence: 1, reason: 'ok' });
const profile: any = { version: 1, status: 'verified', browser_loaded: true, weight: 400, width: 5, coverage: [[32, 126]], source_url: 'x', checked_at: 'now' };
const fonts: any[] = [{ id: 1, value: 'Sans', alias: 'Sans', category: 'sans', tags: [], profile }, { id: 2, value: 'Serif', alias: 'Serif', category: 'serif', tags: ['tạp chí'], profile }, { id: 3, value: 'Missing', category: 'serif', tags: [], profile: { ...profile, coverage: [[65, 66]] } }];
const found = shortlistFonts(fonts, { category: 'serif', traits: ['tạp chí'], suspected: [], weight: 400, italic: false }, 'Sans', 'HELLO');
assert.equal(found[0].id, 2);
assert(!found.some(f => f.id === 3));
// Metadata must order work, never discard a compatible font beyond the old top-36 cutoff.
const broadPool: any[] = Array.from({ length: 80 }, (_, i) => ({ ...fonts[0], id: i + 100, category: i === 79 ? 'script' : 'serif' }));
const broad = shortlistFonts(broadPool, { category: 'serif', traits: [], suspected: [], weight: 400, italic: false }, '', 'HELLO');
assert.equal(broad.length, 80);
assert(broad.some(f => f.id === 179), 'A mismatched category remains eligible for image measurement');
const shapeFixture = (padding: number, inverted = false, narrow = false) => {
    const width = 96 + padding * 2, height = 32 + padding * 2, rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ink = x >= padding && x < padding + (narrow ? 48 : 96) && y >= padding && y < padding + 32 && (x - padding < 8 || y - padding > 23);
        const v = ink !== inverted ? 0 : 255, index = (y * width + x) * 4;
        rgba[index] = rgba[index + 1] = rgba[index + 2] = v; rgba[index + 3] = 255;
    }
    return fontShape(rgba, width, height);
};
const originalShape = shapeFixture(8);
assert.equal(shapeDistance(originalShape, shapeFixture(24)), 0, 'Whitespace does not change the tight ink descriptor');
assert.equal(shapeDistance(originalShape, shapeFixture(8, true)), 0, 'Light text on dark background has the same shape');
assert(shapeDistance(originalShape, shapeFixture(8, false, true)) > .1, 'Different proportions rank below an exact shape');
assert.equal(fontShape(new Uint8Array(16 * 16 * 4).fill(255), 16, 16), null);
console.log('PASS full compatible pool survives metadata cutoff; ink shape ignores margins/polarity and detects proportions');
console.log('PASS cropped bounds, shortlist coverage/category, ranking id validation and confidence bounds');
// Real Chromium font rendering and image payload, fake provider: no paid API call.
async function renderingTest() {
    const path = require('path'), fs = require('fs'), sharp = require('../../service/node_modules/sharp');
    const root = path.resolve(__dirname, '../..'), target = path.resolve('static/fonts/match.woff2');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, 'service/seed/static/fonts/be-vietnam-pro-400.woff2'), target);
    const fontsModule = require('../../service/src/tinix/ai/fonts'), vision = require('../../service/src/tinix/ai/vision');
    const originalFonts = fontsModule.libraryFonts, originalCall = vision.callVisionJSON;
    const testFont = { id: 91, value: 'Match fixture', alias: 'Match fixture', woff: '/static/fonts/match.woff2', category: 'sans', tags: [], supports_vietnamese: true, profile: { ...profile, weight: 400, coverage: [[32, 126]] } };
    const calls: any[] = [];
    fontsModule.libraryFonts = () => [testFont, {...testFont,id:92,value:'Second fixture'}];
    vision.callVisionJSON = async (call: any) => {
        calls.push(call);
        if (calls.length === 1) {
            assert.equal(call.images.length, 1);
            return { data: call.validate({ text: 'HELLO', category: 'sans', traits: [], suspected: [], weight: 400, italic: false, legible: true }), jobId: 1, model: 'fake' };
        }
        assert.equal(call.images.length, 2);
        const bytes = Buffer.from(call.images[1].split(',')[1], 'base64'), meta = await sharp(bytes).metadata();
        assert.equal(meta.width, 1200);
        assert(meta.height >= 100);
        assert.equal(call.inputSummary.options[0].id, 91);
        assert.equal(call.inputSummary.stage,calls.length===2?'font_visual_compare':'font_visual_detail');
        if(calls.length===3){assert(call.inputSummary.options.every((c:any)=>Number.isFinite(c.letterSpacing)));assert(meta.height>=480)}
        return { data: call.validate({ ranking: ['C1','C2'], confidence: .9, reason: 'matched fixture' }), jobId: calls.length, model: 'fake' };
    };
    try {
        const input = await sharp({ create: { width: 400, height: 100, channels: 3, background: 'white' } }).png().toBuffer();
        const match = await require('../../service/src/tinix/ai/font-match').matchFontFromReference({ reference: 'data:image/png;base64,' + input.toString('base64'), bbox: { x: 0, y: 0, w: 1, h: 1 }, text: 'HELLO',referenceText:'CORRECTED' });
        assert.equal(match.observedText,'CORRECTED');assert.equal(match.correctedReference,true);assert.equal(match.candidates[0].fontClass.id, 91);
        assert.equal(match.candidates[0].weight, 400);
        assert.match(match.candidates[0].preview, /^data:image\/png/);
        assert.deepEqual(match.jobIds, [1, 2, 3]);
        assert.equal(calls.length, 3);
        assert.match(match.detailPreview,/^data:image\/png/);
        assert.equal(match.detailLabels.length,2);
        assert.equal(match.candidates[0].comparisonLabel,'C1');
        assert.equal(match.detailLabels[0].label,'C1');
        assert.equal(match.canAutoApply,false,'Blank reference must not auto-apply a confident AI guess');
        assert.equal(match.candidates[0].letterSpacing,0);
        console.log('PASS real full/detail glyph rendering, refined styles, three AI payloads, selected face and thumbnail');
    }
    finally {
        fontsModule.libraryFonts = originalFonts;
        vision.callVisionJSON = originalCall;
    }
}
renderingTest().catch(e => { console.error(e); process.exitCode = 1; });

import {clampTextCrop,cropFromPoints} from '../../src/utils/tinix/font-crop'
assert.deepEqual(cropFromPoints({x:.8,y:.7},{x:.2,y:.1}),{x:.2,y:.1,w:.6000000000000001,h:.6})
assert.deepEqual(clampTextCrop({x:-1,y:.9,w:3,h:4}),{x:0,y:.9,w:1,h:.09999999999999998})
assert.throws(()=>validateVisualRanking({ranking:['C999']},['C1']))
console.log('PASS reversed crop selection and boundary clamping')

const pixels=new Uint8Array(120*40*4);for(let y=0;y<40;y++)for(let x=0;x<120;x++){const i=(y*120+x)*4,v=(x>20&&x<25&&y>5&&y<30)?20:180+x/3;pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255}
const extracted=extractText(pixels,120,40);assert(extracted.usable);assert.equal(extracted.rgba[(15*120+22)*4],0);assert.equal(extracted.rgba[(15*120+100)*4],255);
const inverse=new Uint8Array(pixels);for(let i=0;i<inverse.length;i+=4)for(let c=0;c<3;c++)inverse[i+c]=255-pixels[i+c];assert.equal(extractText(inverse,120,40).rgba[(15*120+22)*4],0);
assert.equal(extractText(new Uint8Array(100*4).fill(255),10,10).usable,false);console.log('PASS local-background subtraction, both polarities, blank rejection');
