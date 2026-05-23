import React from 'react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import '@testing-library/jest-dom';
import {PLATFORM} from '../../../src/lib/platform.js';

// Mock this utility because it uses dynamic imports that do not work with jest
jest.mock('../../../src/lib/libraries/decks/translate-image.js', () => { });

import Cards from '../../../src/components/cards/cards.jsx';

describe('Cards component', () => {
    const trackingPixelUrl = `https://${['code', 'org'].join('.')}/api/hour/begin_scratch_talk.png`;

    const defaultProps = () => ({
        activeDeckId: 'id1',
        content: {
            id1: {
                name: 'id1 - name',
                img: 'id1 - img',
                steps: [{
                    video: 'videoUrl',
                    trackingPixel: <img src={trackingPixelUrl} />
                }]
            }
        },
        dragging: false,
        expanded: true,
        isRtl: false,
        locale: 'en',
        onActivateDeckFactory: jest.fn(),
        onCloseCards: jest.fn(),
        onDrag: jest.fn(),
        onEndDrag: jest.fn(),
        onNextStep: jest.fn(),
        onPrevStep: jest.fn(),
        onShowAll: jest.fn(),
        onShrinkExpandCards: jest.fn(),
        onStartDrag: jest.fn(),
        showTrackingPixels: false,
        showVideos: true,
        step: 0,
        x: 0,
        y: 0
    });

    test('showVideos=true shows the video step', () => {
        const {container} = renderWithIntl(<Cards
            {...defaultProps()}
            platform={PLATFORM.WEB}
            showVideos
        />);

        expect(container.firstChild).toMatchSnapshot();
    });

    test('showVideos=false shows the title image/name instead of video step', () => {
        const {container} = renderWithIntl(<Cards
            {...defaultProps()}
            showVideos={false}
        />);

        expect(container.firstChild).toMatchSnapshot();
    });

    test('tracking pixels are hidden by default', () => {
        const {container} = renderWithIntl(<Cards
            {...defaultProps()}
            showVideos={false}
        />);

        expect(container.querySelector(`img[src="${trackingPixelUrl}"]`)).toBeNull();
    });

    test('tracking pixels can be explicitly shown', () => {
        const {container} = renderWithIntl(<Cards
            {...defaultProps()}
            showTrackingPixels
            showVideos={false}
        />);

        expect(container.querySelector(`img[src="${trackingPixelUrl}"]`)).toBeInTheDocument();
    });
});
