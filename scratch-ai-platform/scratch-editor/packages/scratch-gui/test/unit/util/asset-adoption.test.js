/* eslint-env jest */
import {
    ASSET_ADOPTION_ACTIONS,
    ASSET_ADOPTION_STATUS,
    createAssetAdoptionState,
    createAssetAdoptionSummary,
    createAssetImportData,
    getNextAssetAdoptionState
} from '../../../src/lib/ai/asset-adoption';

const createReply = () => ({
    worker: {
        job: {
            id: 'asset-job-1234',
            type: 'character',
            result: {
                asset: {
                    dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
                    mimeType: 'image/svg+xml'
                }
            },
            audit: {
                costumeEditorEditsRequired: 2
            }
        }
    }
});

describe('asset adoption', () => {
    test('requires review, import, two visual edits, and adoption in order', () => {
        const reply = createReply();
        let state = createAssetAdoptionState(reply);
        let summary = createAssetAdoptionSummary({
            adoptionState: state,
            assetReply: reply
        });

        expect(summary.status).toBe(ASSET_ADOPTION_STATUS.NEEDS_REVIEW);
        expect(summary.canReview).toBe(true);
        expect(summary.canImport).toBe(false);

        state = getNextAssetAdoptionState({
            action: ASSET_ADOPTION_ACTIONS.REVIEW,
            assetReply: reply,
            currentState: state
        });
        summary = createAssetAdoptionSummary({
            adoptionState: state,
            assetReply: reply
        });
        expect(summary.status).toBe(ASSET_ADOPTION_STATUS.NEEDS_IMPORT);
        expect(summary.canImport).toBe(true);

        state = getNextAssetAdoptionState({
            action: ASSET_ADOPTION_ACTIONS.IMPORT,
            assetReply: reply,
            currentState: state,
            values: {
                importTarget: 'AI draft character 1234'
            }
        });
        summary = createAssetAdoptionSummary({
            adoptionState: state,
            assetReply: reply
        });
        expect(summary.status).toBe(ASSET_ADOPTION_STATUS.NEEDS_EDITS);
        expect(summary.imported).toBe(true);
        expect(summary.canRecordVisualEdit).toBe(true);

        state = getNextAssetAdoptionState({
            action: ASSET_ADOPTION_ACTIONS.RECORD_VISUAL_EDIT,
            assetReply: reply,
            currentState: state
        });
        state = getNextAssetAdoptionState({
            action: ASSET_ADOPTION_ACTIONS.RECORD_VISUAL_EDIT,
            assetReply: reply,
            currentState: state
        });
        summary = createAssetAdoptionSummary({
            adoptionState: state,
            assetReply: reply
        });
        expect(summary.status).toBe(ASSET_ADOPTION_STATUS.READY_TO_ADOPT);
        expect(summary.visualEditCount).toBe(2);
        expect(summary.canAdopt).toBe(true);

        state = getNextAssetAdoptionState({
            action: ASSET_ADOPTION_ACTIONS.ADOPT,
            assetReply: reply,
            currentState: state
        });
        summary = createAssetAdoptionSummary({
            adoptionState: state,
            assetReply: reply
        });
        expect(summary.status).toBe(ASSET_ADOPTION_STATUS.ADOPTED);
        expect(summary.adopted).toBe(true);
    });

    test('creates an import payload without retaining the source data URI', () => {
        const importData = createAssetImportData(createReply());

        expect(importData.ready).toBe(true);
        expect(importData.assetType).toBe('character');
        expect(importData.mimeType).toBe('image/svg+xml');
        expect(importData.fileData.byteLength).toBeGreaterThan(0);
        expect(importData.name).toBe('AI draft character 1234');
        expect(JSON.stringify(importData).includes('data:image')).toBe(false);
    });
});
