import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDomClient from 'react-dom/client';
import {connect} from 'react-redux';
import {compose} from 'redux';

import Box from '../components/box/box.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import AppStateHOC from '../lib/app-state-hoc.jsx';

import {setPlayer} from '../reducers/mode';

if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
    // Warn before navigating away
    window.onbeforeunload = () => true;
}

import styles from './player.css';

const readQueryParam = name => {
    if (typeof window !== 'object') return '';
    return new URLSearchParams(window.location.search).get(name) || '';
};

const readBooleanQueryParam = name => {
    const value = readQueryParam(name).toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
};

const resolveScratchHost = (configuredHost, sameOriginPath = '') => {
    if (configuredHost === 'same-origin' && typeof window === 'object') {
        return `${window.location.origin}${sameOriginPath}`;
    }
    return configuredHost || void 0;
};

const getScratchAssetHost = () => {
    const configuredHost = process.env.SCRATCH_AI_ASSET_HOST ||
        (process.env.SCRATCH_AI_MIDDLEWARE_URL === '/' ? 'same-origin' : '');
    return resolveScratchHost(configuredHost);
};

const getScratchProjectHost = () => {
    const configuredHost = process.env.SCRATCH_AI_PROJECT_HOST ||
        (process.env.SCRATCH_AI_MIDDLEWARE_URL === '/' ? 'same-origin' : '');
    return resolveScratchHost(configuredHost, '/internalapi/project');
};

const Player = ({
    assetHost,
    isPlayerOnly,
    onSeeInside,
    projectHost,
    projectId,
    readOnly
}) => (
    <Box className={classNames(isPlayerOnly ? styles.stageOnly : styles.editor)}>
        {isPlayerOnly && !readOnly && <button onClick={onSeeInside}>{'See inside'}</button>}
        <GUI
            assetHost={assetHost || void 0}
            canEditTitle={!readOnly}
            enableCommunity={!readOnly}
            isPlayerOnly={isPlayerOnly}
            projectHost={projectHost || void 0}
            projectId={projectId}
        />
    </Box>
);

Player.propTypes = {
    assetHost: PropTypes.string,
    isPlayerOnly: PropTypes.bool,
    onSeeInside: PropTypes.func,
    projectHost: PropTypes.string,
    projectId: PropTypes.string,
    readOnly: PropTypes.bool
};

const mapStateToProps = state => ({
    isPlayerOnly: state.scratchGui.mode.isPlayerOnly
});

const mapDispatchToProps = dispatch => ({
    onSeeInside: () => dispatch(setPlayer(false))
});

const ConnectedPlayer = connect(
    mapStateToProps,
    mapDispatchToProps
)(Player);

// note that redux's 'compose' function is just being used as a general utility to make
// the hierarchy of HOC constructor calls clearer here; it has nothing to do with redux's
// ability to compose reducers.
const WrappedPlayer = compose(
    AppStateHOC,
    HashParserHOC
)(ConnectedPlayer);

const appTarget = document.createElement('div');
document.body.appendChild(appTarget);

const root = ReactDomClient.createRoot(appTarget);
root.render(
    <WrappedPlayer
        isPlayerOnly
        assetHost={readQueryParam('asset_host') || getScratchAssetHost()}
        projectHost={readQueryParam('project_host') || getScratchProjectHost()}
        readOnly={readBooleanQueryParam('read_only')}
    />
);
