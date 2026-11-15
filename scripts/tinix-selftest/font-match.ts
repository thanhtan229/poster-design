import assert from 'node:assert/strict';
import { cropBox, shortlistFonts, validateVisualRanking } from '../../service/src/tinix/ai/font-match';
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
console.log('PASS cropped bounds, shortlist coverage/category, ranking id validation and confidence bounds');
// Real Chromium font rendering and image payload, fake provider: no paid API call.
async function renderingTest() {
    const path = require('path'), fs = require('fs'), sharp = require('../../service/node_modules/sharp');
    const root = path.resolve(__dirname, '../..'), target = path.resolve('static/fonts/match.woff2');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, 'service/static/fonts/be-vietnam-pro-400.woff2'), target);
    const fontsModule = require('../../service/src/tinix/ai/fonts'), vision = require('../../service/src/tinix/ai/vision');
    const originalFonts = fontsModule.libraryFonts, originalCall = vision.callVisionJSON;
    const testFont = { id: 91, value: 'Match fixture', alias: 'Match fixture', woff: '/static/fonts/match.woff2', category: 'sans', tags: [], supports_vietnamese: true, profile: { ...profile, weight: 400, coverage: [[32, 126]] } };
    const calls: any[] = [];
    fontsModule.libraryFonts = () => [testFont];
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
        return { data: call.validate({ ranking: ['C1'], confidence: .9, reason: 'matched fixture' }), jobId: 2, model: 'fake' };
    };
    try {
        const input = await sharp({ create: { width: 400, height: 100, channels: 3, background: 'white' } }).png().toBuffer();
        const match = await require('../../service/src/tinix/ai/font-match').matchFontFromReference({ reference: 'data:image/png;base64,' + input.toString('base64'), bbox: { x: 0, y: 0, w: 1, h: 1 }, text: 'HELLO' });
        assert.equal(match.candidates[0].fontClass.id, 91);
        assert.equal(match.candidates[0].weight, 400);
        assert.match(match.candidates[0].preview, /^data:image\/png/);
        assert.deepEqual(match.jobIds, [1, 2]);
        assert.equal(calls.length, 2);
        console.log('PASS real candidate rendering, image comparison payload, selected face and thumbnail');
    }
    finally {
        fontsModule.libraryFonts = originalFonts;
        vision.callVisionJSON = originalCall;
    }
}
renderingTest().catch(e => { console.error(e); process.exitCode = 1; });
