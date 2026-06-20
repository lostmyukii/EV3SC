import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';

import BalancedFormattedMessage from '../../containers/balanced-formatted-message.jsx';
import Box from '../box/box.jsx';
import PeripheralTile from './peripheral-tile.jsx';
import Dots from './dots.jsx';

import enterUpdateIcon from './icons/enter-update.svg';
import radarIcon from './icons/searching.png';
import refreshIcon from './icons/refresh.svg';
import warningIcon from './icons/warning.svg';

import styles from './connection-modal.css';

const ScanningStep = props => {
    const showUpdate = !!(props.onUpdatePeripheral && !props.scanning);
    const diagnostic = props.connectionDiagnostic || {};
    const diagnosticMessage = diagnostic.message || (
        props.scanning ?
            '正在连接本机 Link。' :
            'Link 未启动 / 20111 不可达。'
    );
    const diagnosticHint = diagnostic.hint ||
        '这是内部 WebSocket 地址，不能直接在浏览器地址栏打开；请在同一台 Windows 电脑打开 ScratchAI 页面。';
    const diagnosticUrl = diagnostic.linkUrl || 'ws://127.0.0.1:20111/scratch/bt';
    return (<Box className={styles.body}>
        <Box className={styles.activityArea}>
            {props.scanning ? (
                props.peripheralList.length === 0 ? (
                    <div className={styles.activityAreaInfo}>
                        <div className={styles.centeredRow}>
                            <img
                                className={classNames(styles.radarSmall, styles.radarSpin)}
                                src={radarIcon}
                            />
                            <FormattedMessage
                                defaultMessage="Looking for devices"
                                description="Text shown while scanning for devices"
                                id="gui.connection.scanning.lookingforperipherals"
                            />
                        </div>
                    </div>
                ) : (
                    <div className={styles.peripheralTilePane}>
                        {props.peripheralList.map(peripheral =>
                            (<PeripheralTile
                                connectionSmallIconURL={props.connectionSmallIconURL}
                                key={peripheral.peripheralId}
                                name={peripheral.name}
                                peripheralId={peripheral.peripheralId}
                                rssi={peripheral.rssi}
                                onConnecting={props.onConnecting}
                            />)
                        )}
                    </div>
                )
            ) : (
                <Box className={styles.centeredRow}>
                    <img
                        className={styles.helpStepImage}
                        src={warningIcon}
                    />
                    <FormattedMessage
                        className={styles.helpStepText}
                        defaultMessage="No devices found"
                        description="Text shown when no devices could be found"
                        id="gui.connection.scanning.noPeripheralsFound"
                    />
                </Box>
            )}
        </Box>
        <Box className={styles.bottomArea}>
            <Box className={styles.connectionDiagnostic}>
                <div className={styles.connectionDiagnosticStatus}>
                    {diagnosticMessage}
                </div>
                <div className={styles.connectionDiagnosticUrl}>
                    {diagnosticUrl}
                </div>
                <div className={styles.connectionDiagnosticHint}>
                    {diagnosticHint}
                </div>
            </Box>
            <Box className={classNames(styles.bottomAreaItem, styles.instructions)}>
                {(props.scanning || props.peripheralList.length > 0) && (
                    // Show this message if we're still scanning OR if we've found devices
                    <FormattedMessage
                        defaultMessage="Select your device in the list above."
                        description="Prompt for choosing a device to connect to"
                        id="gui.connection.scanning.instructions"
                    />
                )}
                {showUpdate && (
                    // Show this message if we're done scanning AND we can update
                    // Note that it's possible the list includes devices but does not include the desired device,
                    // so don't limit this message to the (props.peripheralList.length === 0) case
                    <BalancedFormattedMessage
                        defaultMessage="If you don't see your device, you may need to update it to work with Scratch."
                        description="Prompt for updating a peripheral device"
                        id="gui.connection.scanning.updatePeripheralPrompt"
                    />
                )}
            </Box>
            <Dots
                className={styles.bottomAreaItem}
                counter={0}
                total={3}
            />
            <Box className={classNames(styles.bottomAreaItem, styles.buttonRow)}>
                <button
                    className={styles.connectionButton}
                    onClick={props.onRefresh}
                >
                    <FormattedMessage
                        defaultMessage="Refresh"
                        description="Button in prompt for starting a search"
                        id="gui.connection.search"
                    />
                    <img
                        className={styles.buttonIconRight}
                        src={refreshIcon}
                    />
                </button>
                {showUpdate && (
                    <button
                        className={styles.connectionButton}
                        onClick={props.onUpdatePeripheral}
                    >
                        <FormattedMessage
                            defaultMessage="Update my Device"
                            description="Button to enter the peripheral update mode"
                            id="gui.connection.scanning.updatePeripheralButton"
                        />
                        <img
                            className={styles.buttonIconRight}
                            src={enterUpdateIcon}
                        />
                    </button>
                )}
            </Box>
        </Box>
    </Box>);
};

ScanningStep.propTypes = {
    connectionDiagnostic: PropTypes.shape({
        freshnessSeconds: PropTypes.number,
        hint: PropTypes.string,
        linkUrl: PropTypes.string,
        message: PropTypes.string,
        peripheralName: PropTypes.string,
        status: PropTypes.string
    }),
    connectionSmallIconURL: PropTypes.string,
    onConnecting: PropTypes.func,
    onRefresh: PropTypes.func,
    onUpdatePeripheral: PropTypes.func,
    peripheralList: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        rssi: PropTypes.number,
        peripheralId: PropTypes.string
    })),
    scanning: PropTypes.bool.isRequired
};

ScanningStep.defaultProps = {
    peripheralList: [],
    scanning: true
};

export default ScanningStep;
