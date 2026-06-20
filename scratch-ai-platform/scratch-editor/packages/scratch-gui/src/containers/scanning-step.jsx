import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import ScanningStepComponent from '../components/connection-modal/scanning-step.jsx';
import VM from '@scratch/scratch-vm';

/**
 * Scan for a peripheral and allow the user to choose from a list of those discovered.
 * Does not support "prescan" and "pressbutton" phases.
 */
class ScanningStep extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handlePeripheralListUpdate',
            'handlePeripheralScanTimeout',
            'handleUserPickedPeripheral',
            'handleRefresh',
            'refreshConnectionDiagnostic'
        ]);
        this.state = {
            scanning: true,
            peripheralList: [],
            connectionDiagnostic: null
        };
    }
    componentDidMount () {
        this.props.vm.scanForPeripheral(this.props.extensionId);
        this.refreshConnectionDiagnostic();
        this.connectionDiagnosticInterval = window.setInterval(
            this.refreshConnectionDiagnostic,
            1000
        );
        this.props.vm.on(
            'PERIPHERAL_LIST_UPDATE', this.handlePeripheralListUpdate);
        this.props.vm.on(
            'PERIPHERAL_SCAN_TIMEOUT', this.handlePeripheralScanTimeout);
        this.props.vm.on(
            'USER_PICKED_PERIPHERAL', this.handleUserPickedPeripheral);
    }
    componentWillUnmount () {
        // @todo: stop the peripheral scan here
        if (this.connectionDiagnosticInterval) {
            window.clearInterval(this.connectionDiagnosticInterval);
        }
        this.props.vm.removeListener(
            'PERIPHERAL_LIST_UPDATE', this.handlePeripheralListUpdate);
        this.props.vm.removeListener(
            'PERIPHERAL_SCAN_TIMEOUT', this.handlePeripheralScanTimeout);
        this.props.vm.removeListener(
            'USER_PICKED_PERIPHERAL', this.handleUserPickedPeripheral);
    }
    handlePeripheralScanTimeout () {
        this.setState({
            scanning: false,
            peripheralList: []
        });
        this.refreshConnectionDiagnostic();
    }
    handlePeripheralListUpdate (newList) {
        // TODO: sort peripherals by signal strength? so they don't jump around
        const peripheralArray = Object.keys(newList).map(id =>
            newList[id]
        );
        this.setState({peripheralList: peripheralArray});
        this.refreshConnectionDiagnostic();
    }
    handleUserPickedPeripheral (newList) {
        const peripheralArray = Object.keys(newList).map(id =>
            newList[id]
        );
        this.setState({peripheralList: peripheralArray});
        this.refreshConnectionDiagnostic();
        if (peripheralArray.length > 0) {
            this.props.onConnecting(peripheralArray[0].peripheralId);
        }
    }
    handleRefresh () {
        this.props.vm.scanForPeripheral(this.props.extensionId);
        this.setState({
            scanning: true,
            peripheralList: []
        });
        this.refreshConnectionDiagnostic();
    }
    refreshConnectionDiagnostic () {
        if (typeof this.props.vm.getPeripheralConnectionDiagnostic !== 'function') {
            return;
        }
        this.setState({
            connectionDiagnostic: this.props.vm.getPeripheralConnectionDiagnostic(this.props.extensionId)
        });
    }
    render () {
        return (
            <ScanningStepComponent
                connectionDiagnostic={this.state.connectionDiagnostic}
                connectionSmallIconURL={this.props.connectionSmallIconURL}
                peripheralList={this.state.peripheralList}
                phase={this.state.phase}
                scanning={this.state.scanning}
                title={this.props.extensionId}
                onConnected={this.props.onConnected}
                onConnecting={this.props.onConnecting}
                onRefresh={this.handleRefresh}
                onUpdatePeripheral={this.props.onUpdatePeripheral}
            />
        );
    }
}

ScanningStep.propTypes = {
    connectionSmallIconURL: PropTypes.string,
    extensionId: PropTypes.string.isRequired,
    onConnected: PropTypes.func.isRequired,
    onConnecting: PropTypes.func.isRequired,
    onUpdatePeripheral: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default ScanningStep;
