import {ExtensionLibrary} from '../../../src/containers/extension-library.jsx';

const makeExtensionLibrary = ({
    isExtensionLoaded = false,
    loadExtensionURL = jest.fn(() => Promise.resolve())
} = {}) => new ExtensionLibrary({
    intl: {
        formatMessage: message => message.defaultMessage
    },
    onCategorySelected: jest.fn(),
    onRequestClose: jest.fn(),
    visible: true,
    vm: {
        extensionManager: {
            isExtensionLoaded: jest.fn(() => isExtensionLoaded),
            loadExtensionURL
        }
    }
});

describe('ExtensionLibrary container', () => {
    test('selects the loaded VSLE-EV3 category after loading the EV3 URL tile', async () => {
        const loadExtensionURL = jest.fn(() => Promise.resolve());
        const container = makeExtensionLibrary({loadExtensionURL});
        const ev3Item = {
            extensionId: 'ev3',
            loadedExtensionId: 'vsleev3',
            extensionURL: 'http://localhost:8000/vsle-ev3-extension/index.js'
        };

        await container.handleItemSelect(ev3Item);

        expect(loadExtensionURL).toHaveBeenCalledWith(
            'http://localhost:8000/vsle-ev3-extension/index.js'
        );
        expect(container.props.onCategorySelected).toHaveBeenCalledWith('vsleev3');
    });
});
