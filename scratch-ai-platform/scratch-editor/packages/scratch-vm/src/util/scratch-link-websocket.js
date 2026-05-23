/* global process, __SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS__ */

const {isScratchLinkRemoteFallbackEnabled} = require('./ai-feature-flags');

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const MIN_CONNECT_TIMEOUT_MS = 500;
const MAX_CONNECT_TIMEOUT_MS = 30000;
const REMOTE_FALLBACK_HOST = ['device-manager', 'scratch', 'mit', 'edu'].join('.');

const readEnvString = name => {
    if (name === 'SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS') {
        if (typeof __SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS__ !== 'undefined') {
            return __SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS__;
        }
    }
    if (typeof process === 'undefined' || !process.env || typeof process.env[name] !== 'string') {
        return '';
    }
    return process.env[name].trim();
};

const readConnectTimeoutMs = () => {
    const configuredValue = readEnvString('SCRATCH_AI_SCRATCH_LINK_CONNECT_TIMEOUT_MS');
    if (!configuredValue) return DEFAULT_CONNECT_TIMEOUT_MS;

    const value = Number(configuredValue);
    if (!Number.isFinite(value)) return DEFAULT_CONNECT_TIMEOUT_MS;
    return Math.min(MAX_CONNECT_TIMEOUT_MS, Math.max(MIN_CONNECT_TIMEOUT_MS, value));
};

/**
 * This class provides a ScratchLinkSocket implementation using WebSockets,
 * attempting to connect with the locally installed Scratch-Link.
 *
 * To connect with ScratchLink without WebSockets, you must implement all of the
 * public methods in this class.
 * - open()
 * - close()
 * - setOn[Open|Close|Error]
 * - setHandleMessage
 * - sendMessage(msgObj)
 * - isOpen()
 */
class ScratchLinkWebSocket {
    constructor (type) {
        this._type = type;
        this._onOpen = null;
        this._onClose = null;
        this._onError = null;
        this._handleMessage = null;

        this._ws = null;
    }

    open () {
        if (!(this._onOpen && this._onClose && this._onError && this._handleMessage)) {
            throw new Error('Must set open, close, message and error handlers before calling open on the socket');
        }

        let pathname;
        switch (this._type) {
        case 'BLE':
            pathname = 'scratch/ble';
            break;
        case 'BT':
            pathname = 'scratch/bt';
            break;
        default:
            throw new Error(`Unknown ScratchLink socket Type: ${this._type}`);
        }

        const socketUrls = ScratchLinkWebSocket.getSocketUrls(pathname);
        const pendingSockets = [];
        const errors = [];
        let opened = false;
        let connectTimeout = null;

        const closeUnusedSockets = socketToUse => {
            pendingSockets.forEach(socket => {
                if (socket !== socketToUse) {
                    socket.onopen = socket.onerror = null;
                    socket.close();
                }
            });
        };

        const setSocket = socketToUse => {
            opened = true;
            closeUnusedSockets(socketToUse);

            this._ws = socketToUse;
            this._ws.onopen = this._onOpen;
            this._ws.onclose = this._onClose;
            this._ws.onerror = this._onError;
            this._ws.onmessage = this._onMessage.bind(this);
        };

        const reportErrorIfAllFailed = (errorEvent, force) => {
            if (!opened && (force || errors.length >= socketUrls.length) && this._onError) {
                clearTimeout(connectTimeout);
                const socket = pendingSockets[0];
                if (socket) {
                    setSocket(socket);
                    this._ws.onerror(errorEvent);
                } else {
                    this._onError(errorEvent);
                }
            }
        };

        connectTimeout = setTimeout(() => {
            reportErrorIfAllFailed(new Event('timeout'), true);
        }, ScratchLinkWebSocket.getConnectTimeoutMs());

        socketUrls.forEach(url => {
            let socket;
            try {
                socket = new WebSocket(url);
            } catch (e) {
                errors.push(e);
                reportErrorIfAllFailed(e);
                return;
            }
            pendingSockets.push(socket);
            socket.onopen = openEvent => {
                if (opened) return;
                clearTimeout(connectTimeout);
                setSocket(socket);
                this._ws.onopen(openEvent);
            };
            socket.onerror = errorEvent => {
                errors.push(errorEvent);
                reportErrorIfAllFailed(errorEvent);
            };
        });
    }

    close () {
        this._ws.close();
        this._ws = null;
    }

    sendMessage (message) {
        const messageText = JSON.stringify(message);
        this._ws.send(messageText);
    }

    setOnOpen (fn) {
        this._onOpen = fn;
    }

    setOnClose (fn) {
        this._onClose = fn;
    }

    setOnError (fn) {
        this._onError = fn;
    }

    setHandleMessage (fn) {
        this._handleMessage = fn;
    }

    isOpen () {
        return this._ws && this._ws.readyState === this._ws.OPEN;
    }

    _onMessage (e) {
        const json = JSON.parse(e.data);
        this._handleMessage(json);
    }

    /**
     * @param {string} pathname The Scratch Link path for the peripheral type.
     * @returns {Array.<string>} WebSocket URLs to try for Scratch Link.
     */
    static getSocketUrls (pathname) {
        const urls = [`ws://127.0.0.1:20111/${pathname}`];
        if (isScratchLinkRemoteFallbackEnabled()) {
            urls.push(
                `wss://${REMOTE_FALLBACK_HOST}:20110/${pathname}`,
                `wss://${REMOTE_FALLBACK_HOST}:20111/${pathname}`
            );
        }
        return urls;
    }

    /**
     * @returns {number} Connection timeout in milliseconds.
     */
    static getConnectTimeoutMs () {
        return readConnectTimeoutMs();
    }
}

module.exports = ScratchLinkWebSocket;
