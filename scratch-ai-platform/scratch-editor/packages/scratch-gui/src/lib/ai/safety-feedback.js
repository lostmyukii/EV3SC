const SAFETY_FEEDBACK_TYPES = Object.freeze({
    MISSING_CONSENT: 'missingConsent',
    TOO_MUCH_PROJECT: 'tooMuchProject',
    PRIVATE_INFO: 'privateInfo',
    UNKNOWN: 'unknown'
});

const readArray = value => (Array.isArray(value) ? value : []);

const normalizeReason = value => (typeof value === 'string' ? value : '');

const getSafetyFeedbackType = reason => {
    const normalizedReason = normalizeReason(reason);
    if (normalizedReason === 'missing-model-consent') {
        return SAFETY_FEEDBACK_TYPES.MISSING_CONSENT;
    }
    if (normalizedReason.indexOf('forbidden-context:') === 0) {
        return SAFETY_FEEDBACK_TYPES.TOO_MUCH_PROJECT;
    }
    if (normalizedReason.indexOf('redacted') !== -1 || normalizedReason.indexOf('sensitive') !== -1) {
        return SAFETY_FEEDBACK_TYPES.PRIVATE_INFO;
    }
    return SAFETY_FEEDBACK_TYPES.UNKNOWN;
};

const uniqueValues = values => Array.from(new Set(values));

const getSafetyFeedbackTypes = safetyGate => {
    const reasonTypes = readArray(safetyGate && safetyGate.blockedReasons)
        .map(getSafetyFeedbackType);
    const redactionTypes = safetyGate && safetyGate.redactionApplied ?
        [SAFETY_FEEDBACK_TYPES.PRIVATE_INFO] :
        [];
    const allTypes = uniqueValues(reasonTypes.concat(redactionTypes));
    return allTypes.length ? allTypes : [SAFETY_FEEDBACK_TYPES.UNKNOWN];
};

export {
    SAFETY_FEEDBACK_TYPES,
    getSafetyFeedbackType,
    getSafetyFeedbackTypes
};
